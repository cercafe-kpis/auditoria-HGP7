import { appConfig } from '../config/appConfig';
import { graph, resolveSiteId, resolveListId, resolveEvidenciasDriveId } from './graphClient';
import type {
  Planta,
  Metodologia,
  Operario,
  UsuarioApp,
  AuditoriaRemota,
  AuditoriaLogEntry,
  InclinacionRemota,
  ObservacionIndicadores,
  Rol,
} from '../types/entities';

/** Ítem crudo tal como lo devuelve Graph para una Lista de SharePoint. */
interface SpListItem<TFields> {
  id: string;
  fields: TFields;
}

interface SpListResponse<TFields> {
  value: SpListItem<TFields>[];
  '@odata.nextLink'?: string;
}

async function siteAndList(token: string, listDisplayName: string) {
  const siteId = await resolveSiteId(token);
  const listId = await resolveListId(token, siteId, listDisplayName);
  return { siteId, listId };
}

async function getAllItems<TFields>(
  token: string,
  listDisplayName: string,
  filter?: string,
): Promise<SpListItem<TFields>[]> {
  const { siteId, listId } = await siteAndList(token, listDisplayName);
  const filterQs = filter ? `&$filter=${encodeURIComponent(filter)}` : '';
  let path = `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=200${filterQs}`;
  const items: SpListItem<TFields>[] = [];

  // Graph exige este header cuando se usa $filter sobre columnas de una
  // Lista de SharePoint que no están indizadas — sin él responde
  // 400 Bad Request en vez de ejecutar la consulta.
  const init = filter
    ? { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } }
    : undefined;

  // Sigue la paginación de Graph (@odata.nextLink) hasta traer todo.
  // Para catálogos (plantas, metodologías, operarios, usuarios) el volumen
  // es pequeño; para Auditorías, las pantallas de reporte deben pasar
  // siempre un filtro de fecha/planta para no traer el histórico completo.
  while (path) {
    const res: SpListResponse<TFields> = await graph.fetch(path, token, init);
    items.push(...res.value);
    path = res['@odata.nextLink'] ?? '';
  }
  return items;
}

// ---------- Plantas ----------
interface PlantaFields {
  Title: string;
  Codigo: string;
  Ciudad: string;
  Activa: boolean;
}

export async function getPlantas(token: string): Promise<Planta[]> {
  const items = await getAllItems<PlantaFields>(token, appConfig.listas.plantas);
  return items.map((i) => ({
    id: i.id,
    nombre: i.fields.Title,
    codigo: i.fields.Codigo,
    ciudad: i.fields.Ciudad,
    activa: i.fields.Activa,
  }));
}

export interface NuevaPlantaInput {
  nombre: string;
  codigo: string;
  ciudad: string;
  activa: boolean;
}

/**
 * Crea una Planta. Este es el patrón de referencia para el resto de los
 * catálogos administrativos (Metodologías, Operarios, Usuarios): mismo
 * enfoque de siteAndList() + POST /items — solo cambian los nombres de
 * columna. Se implementa aquí completo como ejemplo; los demás CRUD de
 * catálogo se agregan siguiendo exactamente esta forma.
 */
export async function crearPlanta(token: string, input: NuevaPlantaInput): Promise<Planta> {
  const { siteId, listId } = await siteAndList(token, appConfig.listas.plantas);
  const created: SpListItem<PlantaFields> = await graph.fetch(
    `/sites/${siteId}/lists/${listId}/items`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          Title: input.nombre,
          Codigo: input.codigo,
          Ciudad: input.ciudad,
          Activa: input.activa,
        },
      }),
    },
  );
  return {
    id: created.id,
    nombre: created.fields.Title,
    codigo: created.fields.Codigo,
    ciudad: created.fields.Ciudad,
    activa: created.fields.Activa,
  };
}

// ---------- Metodologías ----------
interface MetodologiaFields {
  Title: string;
  Version: string;
  Descripcion: string;
  Activa: boolean;
}

export async function getMetodologias(token: string): Promise<Metodologia[]> {
  const items = await getAllItems<MetodologiaFields>(token, appConfig.listas.metodologias);
  return items.map((i) => ({
    id: i.id,
    nombre: i.fields.Title,
    version: i.fields.Version,
    descripcion: i.fields.Descripcion,
    activa: i.fields.Activa,
  }));
}

export interface NuevaMetodologiaInput {
  nombre: string;
  version: string;
  descripcion: string;
  activa: boolean;
}

export async function crearMetodologia(
  token: string,
  input: NuevaMetodologiaInput,
): Promise<Metodologia> {
  const { siteId, listId } = await siteAndList(token, appConfig.listas.metodologias);
  const created: SpListItem<MetodologiaFields> = await graph.fetch(
    `/sites/${siteId}/lists/${listId}/items`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          Title: input.nombre,
          Version: input.version,
          Descripcion: input.descripcion,
          Activa: input.activa,
        },
      }),
    },
  );
  return {
    id: created.id,
    nombre: created.fields.Title,
    version: created.fields.Version,
    descripcion: created.fields.Descripcion,
    activa: created.fields.Activa,
  };
}

export async function editarMetodologia(
  token: string,
  id: string,
  cambios: Partial<NuevaMetodologiaInput>,
): Promise<void> {
  const { siteId, listId } = await siteAndList(token, appConfig.listas.metodologias);
  const fields: Record<string, unknown> = {};
  if (cambios.nombre !== undefined) fields.Title = cambios.nombre;
  if (cambios.version !== undefined) fields.Version = cambios.version;
  if (cambios.descripcion !== undefined) fields.Descripcion = cambios.descripcion;
  if (cambios.activa !== undefined) fields.Activa = cambios.activa;
  await graph.fetch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, token, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

// ---------- Operarios ----------
interface OperarioFields {
  Title: string;
  Documento: string;
  PlantaLookupId: string;
  Cargo: string;
  Activo: boolean;
}

export async function getOperarios(token: string, plantaId?: string): Promise<Operario[]> {
  const filter = plantaId ? `fields/PlantaLookupId eq ${plantaId}` : undefined;
  const items = await getAllItems<OperarioFields>(token, appConfig.listas.operarios, filter);
  return items.map((i) => ({
    id: i.id,
    nombre: i.fields.Title,
    documento: i.fields.Documento,
    plantaId: i.fields.PlantaLookupId,
    cargo: i.fields.Cargo,
    activo: i.fields.Activo,
  }));
}

export interface NuevoOperarioInput {
  nombre: string;
  documento: string;
  plantaId: string;
  cargo: string;
  activo: boolean;
}

export async function crearOperario(token: string, input: NuevoOperarioInput): Promise<Operario> {
  const { siteId, listId } = await siteAndList(token, appConfig.listas.operarios);
  const created: SpListItem<OperarioFields> = await graph.fetch(
    `/sites/${siteId}/lists/${listId}/items`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          Title: input.nombre,
          Documento: input.documento,
          // Graph exige un entero (no un string) para una columna de
          // búsqueda de valor único — de lo contrario responde 400.
          PlantaLookupId: Number(input.plantaId),
          Cargo: input.cargo,
          Activo: input.activo,
        },
      }),
    },
  );
  return {
    id: created.id,
    nombre: created.fields.Title,
    documento: created.fields.Documento,
    plantaId: created.fields.PlantaLookupId,
    cargo: created.fields.Cargo,
    activo: created.fields.Activo,
  };
}

export async function editarOperario(
  token: string,
  id: string,
  cambios: Partial<NuevoOperarioInput>,
): Promise<void> {
  const { siteId, listId } = await siteAndList(token, appConfig.listas.operarios);
  const fields: Record<string, unknown> = {};
  if (cambios.nombre !== undefined) fields.Title = cambios.nombre;
  if (cambios.documento !== undefined) fields.Documento = cambios.documento;
  if (cambios.plantaId !== undefined) fields.PlantaLookupId = Number(cambios.plantaId);
  if (cambios.cargo !== undefined) fields.Cargo = cambios.cargo;
  if (cambios.activo !== undefined) fields.Activo = cambios.activo;
  await graph.fetch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, token, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

// ---------- Usuarios (roles) ----------
interface UsuarioFields {
  Title: string; // nombre
  Correo: string;
  Rol: Rol;
  PlantasAsignadasLookupId: string[];
  Activo: boolean;
}

export async function getUsuarios(token: string): Promise<UsuarioApp[]> {
  const items = await getAllItems<UsuarioFields>(token, appConfig.listas.usuarios);
  return items.map((i) => ({
    id: i.id,
    correo: i.fields.Correo,
    nombre: i.fields.Title,
    rol: i.fields.Rol,
    plantasAsignadas: i.fields.PlantasAsignadasLookupId ?? [],
    activo: i.fields.Activo,
  }));
}

export interface NuevoUsuarioInput {
  nombre: string;
  correo: string;
  rol: Rol;
  plantasAsignadas: string[]; // ids de Planta (puede ir vacío = sin restricción)
  activo: boolean;
}

/**
 * Crea un Usuario (asigna su rol). El correo debe coincidir EXACTAMENTE
 * con el UPN de la cuenta de Microsoft 365 de la persona — es la clave que
 * useCurrentUser() usa para resolver el rol al iniciar sesión.
 */
export async function crearUsuario(
  token: string,
  input: NuevoUsuarioInput,
): Promise<UsuarioApp> {
  const { siteId, listId } = await siteAndList(token, appConfig.listas.usuarios);
  const fields: Record<string, unknown> = {
    Title: input.nombre,
    Correo: input.correo,
    Rol: input.rol,
    Activo: input.activo,
  };
  // Columna de búsqueda multivalor: Graph exige declarar el tipo OData de
  // la colección y que los ids vengan como enteros (no como string).
  if (input.plantasAsignadas.length > 0) {
    fields['PlantasAsignadasLookupId@odata.type'] = 'Collection(Edm.Int32)';
    fields.PlantasAsignadasLookupId = input.plantasAsignadas.map((id) => Number(id));
  }
  const created: SpListItem<UsuarioFields> = await graph.fetch(
    `/sites/${siteId}/lists/${listId}/items`,
    token,
    { method: 'POST', body: JSON.stringify({ fields }) },
  );
  return {
    id: created.id,
    correo: created.fields.Correo,
    nombre: created.fields.Title,
    rol: created.fields.Rol,
    plantasAsignadas: created.fields.PlantasAsignadasLookupId ?? [],
    activo: created.fields.Activo,
  };
}

export async function editarUsuario(
  token: string,
  id: string,
  cambios: Partial<NuevoUsuarioInput>,
): Promise<void> {
  const { siteId, listId } = await siteAndList(token, appConfig.listas.usuarios);
  const fields: Record<string, unknown> = {};
  if (cambios.nombre !== undefined) fields.Title = cambios.nombre;
  if (cambios.correo !== undefined) fields.Correo = cambios.correo;
  if (cambios.rol !== undefined) fields.Rol = cambios.rol;
  if (cambios.activo !== undefined) fields.Activo = cambios.activo;
  if (cambios.plantasAsignadas !== undefined) {
    fields['PlantasAsignadasLookupId@odata.type'] = 'Collection(Edm.Int32)';
    fields.PlantasAsignadasLookupId = cambios.plantasAsignadas.map((pid) => Number(pid));
  }
  await graph.fetch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, token, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

export async function getUsuarioPorCorreo(
  token: string,
  correo: string,
): Promise<UsuarioApp | null> {
  const items = await getAllItems<UsuarioFields>(
    token,
    appConfig.listas.usuarios,
    `fields/Correo eq '${correo.replace(/'/g, "''")}'`,
  );
  const item = items[0];
  if (!item) return null;
  return {
    id: item.id,
    correo: item.fields.Correo,
    nombre: item.fields.Title,
    rol: item.fields.Rol,
    plantasAsignadas: item.fields.PlantasAsignadasLookupId ?? [],
    activo: item.fields.Activo,
  };
}

// ---------- Auditorías ----------
interface AuditoriaFields {
  Title: string; // IdCliente (UUID)
  FechaAuditoria: string;
  PlantaLookupId: string;
  MetodologiaLookupId: string;
  AuditorCorreo: string;
  OperarioLookupId: string;
  NumeroTiquete: string;
  TieneMarca: boolean;
  MarcaIntercostalCorrecta: boolean;
  Clasificacion: AuditoriaRemota['clasificacion'];
  CanalGrasosa: boolean;
  EstadoSync: AuditoriaRemota['estadoSync'];
  CapturadaEn: string;
  RecibidaEn: string;
}

function mapAuditoria(item: SpListItem<AuditoriaFields>): AuditoriaRemota {
  const f = item.fields;
  return {
    id: item.id,
    idCliente: f.Title,
    fechaAuditoria: f.FechaAuditoria,
    plantaId: f.PlantaLookupId,
    metodologiaId: f.MetodologiaLookupId,
    auditorCorreo: f.AuditorCorreo,
    operarioId: f.OperarioLookupId,
    numeroTiquete: f.NumeroTiquete,
    tieneMarca: f.TieneMarca,
    marcaIntercostalCorrecta: f.MarcaIntercostalCorrecta,
    clasificacion: f.Clasificacion,
    canalGrasosa: f.CanalGrasosa,
    estadoSync: f.EstadoSync,
    capturadaEn: f.CapturadaEn,
    recibidaEn: f.RecibidaEn,
  };
}

export interface FiltrosAuditorias {
  plantaId?: string;
  auditorCorreo?: string;
  operarioId?: string;
  fechaDesde?: string; // ISO date
  fechaHasta?: string; // ISO date
  clasificacion?: AuditoriaRemota['clasificacion'];
}

export async function listarAuditorias(
  token: string,
  filtros: FiltrosAuditorias,
): Promise<AuditoriaRemota[]> {
  const partes: string[] = [];
  if (filtros.plantaId) partes.push(`fields/PlantaLookupId eq ${filtros.plantaId}`);
  if (filtros.auditorCorreo) partes.push(`fields/AuditorCorreo eq '${filtros.auditorCorreo}'`);
  if (filtros.operarioId) partes.push(`fields/OperarioLookupId eq ${filtros.operarioId}`);
  if (filtros.clasificacion) partes.push(`fields/Clasificacion eq '${filtros.clasificacion}'`);
  if (filtros.fechaDesde) partes.push(`fields/FechaAuditoria ge '${filtros.fechaDesde}'`);
  if (filtros.fechaHasta) partes.push(`fields/FechaAuditoria le '${filtros.fechaHasta}'`);
  // Nota: para reportes de rango largo, siempre se recomienda acotar por
  // fecha además de por planta, para no acercarse al umbral de 5000 ítems
  // por vista (ver documento de arquitectura, sección 4.1).
  const filter = partes.length ? partes.join(' and ') : undefined;
  const items = await getAllItems<AuditoriaFields>(token, appConfig.listas.auditorias, filter);
  return items.map(mapAuditoria);
}

/** Busca si ya existe una auditoría con este IdCliente (para idempotencia). */
export async function buscarAuditoriaPorIdCliente(
  token: string,
  idCliente: string,
): Promise<AuditoriaRemota | null> {
  const items = await getAllItems<AuditoriaFields>(
    token,
    appConfig.listas.auditorias,
    `fields/Title eq '${idCliente}'`,
  );
  return items[0] ? mapAuditoria(items[0]) : null;
}

export interface NuevaAuditoriaInput {
  idCliente: string;
  fechaAuditoria: string;
  plantaId: string;
  metodologiaId: string;
  auditorCorreo: string;
  operarioId: string;
  numeroTiquete: string;
  tieneMarca: boolean;
  marcaIntercostalCorrecta: boolean;
  clasificacion: AuditoriaRemota['clasificacion'];
  canalGrasosa: boolean;
  capturadaEn: string;
}

/**
 * Crea una auditoría en SharePoint. Idempotente: si ya existe un ítem con
 * el mismo IdCliente (por ejemplo, un reintento tras un corte de red que
 * impidió recibir la confirmación), devuelve el existente sin duplicar.
 */
export async function crearAuditoriaIdempotente(
  token: string,
  input: NuevaAuditoriaInput,
): Promise<AuditoriaRemota> {
  const existente = await buscarAuditoriaPorIdCliente(token, input.idCliente);
  if (existente) return existente;

  const { siteId, listId } = await siteAndList(token, appConfig.listas.auditorias);
  const body = {
    fields: {
      Title: input.idCliente,
      FechaAuditoria: input.fechaAuditoria,
      // Graph exige un entero (no un string) para columnas de búsqueda de
      // valor único — de lo contrario responde 400 Bad Request.
      PlantaLookupId: Number(input.plantaId),
      MetodologiaLookupId: Number(input.metodologiaId),
      AuditorCorreo: input.auditorCorreo,
      OperarioLookupId: Number(input.operarioId),
      NumeroTiquete: input.numeroTiquete,
      TieneMarca: input.tieneMarca,
      MarcaIntercostalCorrecta: input.marcaIntercostalCorrecta,
      Clasificacion: input.clasificacion,
      CanalGrasosa: input.canalGrasosa,
      EstadoSync: 'Sincronizada',
      CapturadaEn: input.capturadaEn,
      RecibidaEn: new Date().toISOString(),
    },
  };
  const created: SpListItem<AuditoriaFields> = await graph.fetch(
    `/sites/${siteId}/lists/${listId}/items`,
    token,
    { method: 'POST', body: JSON.stringify(body) },
  );
  return mapAuditoria(created);
}

/** Corrección administrativa — registra también la entrada de bitácora. */
export async function corregirAuditoria(
  token: string,
  auditoriaItemId: string,
  cambios: Partial<NuevaAuditoriaInput>,
  usuarioCorreo: string,
): Promise<void> {
  const { siteId, listId } = await siteAndList(token, appConfig.listas.auditorias);
  const fields: Record<string, unknown> = {};
  if (cambios.fechaAuditoria) fields.FechaAuditoria = cambios.fechaAuditoria;
  if (cambios.numeroTiquete) fields.NumeroTiquete = cambios.numeroTiquete;
  if (cambios.clasificacion) fields.Clasificacion = cambios.clasificacion;
  // ... (agregar el resto de campos editables según se necesite)

  await graph.fetch(`/sites/${siteId}/lists/${listId}/items/${auditoriaItemId}/fields`, token, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });

  await registrarLogCambio(token, {
    auditoriaId: auditoriaItemId,
    usuarioCorreo,
    accion: 'Corrección administrativa',
    detalleJson: JSON.stringify(cambios),
    creadoEn: new Date().toISOString(),
  });
}

async function registrarLogCambio(token: string, entry: AuditoriaLogEntry): Promise<void> {
  const { siteId, listId } = await siteAndList(token, appConfig.listas.auditoriaLog);
  await graph.fetch(`/sites/${siteId}/lists/${listId}/items`, token, {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        AuditoriaIdLookupId: Number(entry.auditoriaId),
        UsuarioCorreo: entry.usuarioCorreo,
        Accion: entry.accion,
        DetalleJson: entry.detalleJson,
        CreadoEn: entry.creadoEn,
      },
    }),
  });
}

// ---------- Inclinación de herramienta (muestreo por sesión) ----------
// Lista independiente de Auditorías: no se relaciona con un tiquete/canal
// puntual, sino con una sesión (fecha+planta+metodología+auditor+operario)
// en la que el auditor revisó N canales y anotó cuántas tenían la
// inclinación de la herramienta correcta. Ver comentario en
// types/entities.ts (InclinacionLocal) para el porqué de la separación.
interface InclinacionFields {
  Title: string; // IdCliente (UUID)
  FechaAuditoria: string;
  PlantaLookupId: string;
  MetodologiaLookupId: string;
  AuditorCorreo: string;
  OperarioLookupId: string;
  CanalesRevisadas: number;
  CanalesCorrectas: number;
  EstadoSync: InclinacionRemota['estadoSync'];
  CapturadaEn: string;
  RecibidaEn: string;
}

function mapInclinacion(item: SpListItem<InclinacionFields>): InclinacionRemota {
  const f = item.fields;
  return {
    id: item.id,
    idCliente: f.Title,
    fechaAuditoria: f.FechaAuditoria,
    plantaId: f.PlantaLookupId,
    metodologiaId: f.MetodologiaLookupId,
    auditorCorreo: f.AuditorCorreo,
    operarioId: f.OperarioLookupId,
    canalesRevisadas: f.CanalesRevisadas,
    canalesCorrectas: f.CanalesCorrectas,
    estadoSync: f.EstadoSync,
    capturadaEn: f.CapturadaEn,
    recibidaEn: f.RecibidaEn,
  };
}

export interface FiltrosInclinaciones {
  plantaId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}

export async function listarInclinaciones(
  token: string,
  filtros: FiltrosInclinaciones,
): Promise<InclinacionRemota[]> {
  const partes: string[] = [];
  if (filtros.plantaId) partes.push(`fields/PlantaLookupId eq ${filtros.plantaId}`);
  if (filtros.fechaDesde) partes.push(`fields/FechaAuditoria ge '${filtros.fechaDesde}'`);
  if (filtros.fechaHasta) partes.push(`fields/FechaAuditoria le '${filtros.fechaHasta}'`);
  const filter = partes.length ? partes.join(' and ') : undefined;
  const items = await getAllItems<InclinacionFields>(
    token,
    appConfig.listas.inclinacionHerramienta,
    filter,
  );
  return items.map(mapInclinacion);
}

/** Busca si ya existe un registro con este IdCliente (para idempotencia). */
export async function buscarInclinacionPorIdCliente(
  token: string,
  idCliente: string,
): Promise<InclinacionRemota | null> {
  const items = await getAllItems<InclinacionFields>(
    token,
    appConfig.listas.inclinacionHerramienta,
    `fields/Title eq '${idCliente}'`,
  );
  return items[0] ? mapInclinacion(items[0]) : null;
}

export interface NuevaInclinacionInput {
  idCliente: string;
  fechaAuditoria: string;
  plantaId: string;
  metodologiaId: string;
  auditorCorreo: string;
  operarioId: string;
  canalesRevisadas: number;
  canalesCorrectas: number;
  capturadaEn: string;
}

/**
 * Guarda el agregado de inclinación de la sesión en SharePoint. A
 * diferencia de crearAuditoriaIdempotente (que nunca toca un ítem que ya
 * existe), esto es un UPSERT real: el agregado de una sesión crece con
 * cada Sí/No que el auditor registra, así que si el ítem ya existe se
 * ACTUALIZAN sus totales (PATCH) en vez de dejarlo intacto. Sigue siendo
 * idempotente por IdCliente — nunca crea un segundo ítem para la misma
 * sesión.
 */
export async function guardarInclinacionSesion(
  token: string,
  input: NuevaInclinacionInput,
): Promise<InclinacionRemota> {
  const existente = await buscarInclinacionPorIdCliente(token, input.idCliente);
  const { siteId, listId } = await siteAndList(token, appConfig.listas.inclinacionHerramienta);

  if (existente) {
    await graph.fetch(`/sites/${siteId}/lists/${listId}/items/${existente.id}/fields`, token, {
      method: 'PATCH',
      body: JSON.stringify({
        CanalesRevisadas: input.canalesRevisadas,
        CanalesCorrectas: input.canalesCorrectas,
      }),
    });
    return { ...existente, canalesRevisadas: input.canalesRevisadas, canalesCorrectas: input.canalesCorrectas };
  }

  const body = {
    fields: {
      Title: input.idCliente,
      FechaAuditoria: input.fechaAuditoria,
      PlantaLookupId: Number(input.plantaId),
      MetodologiaLookupId: Number(input.metodologiaId),
      AuditorCorreo: input.auditorCorreo,
      OperarioLookupId: Number(input.operarioId),
      CanalesRevisadas: input.canalesRevisadas,
      CanalesCorrectas: input.canalesCorrectas,
      EstadoSync: 'Sincronizada',
      CapturadaEn: input.capturadaEn,
      RecibidaEn: new Date().toISOString(),
    },
  };
  const created: SpListItem<InclinacionFields> = await graph.fetch(
    `/sites/${siteId}/lists/${listId}/items`,
    token,
    { method: 'POST', body: JSON.stringify(body) },
  );
  return mapInclinacion(created);
}

// ---------- Observaciones del informe de Indicadores ----------
// Texto libre y opcional que el auditor escribe al final del informe de
// Indicadores (ver IndicadoresPage) — se guarda ligado a la combinación
// exacta de filtros (planta + rango de fechas) con la que se generó ese
// informe, no a una auditoría puntual. Es un UPSERT por "clave" (mismo
// patrón que guardarInclinacionSesion): si ya existe una observación para
// esa misma combinación de filtros, se actualiza en vez de duplicar.
interface ObservacionFields {
  Title: string; // clave (ver claveObservacion)
  PlantaId: string; // vacío = "todas las plantas"
  FechaDesde: string;
  FechaHasta: string;
  Observaciones: string;
  ActualizadoPorCorreo: string;
  ActualizadoEn: string;
}

function mapObservacion(item: SpListItem<ObservacionFields>): ObservacionIndicadores {
  const f = item.fields;
  return {
    id: item.id,
    clave: f.Title,
    plantaId: f.PlantaId ?? '',
    fechaDesde: f.FechaDesde,
    fechaHasta: f.FechaHasta,
    texto: f.Observaciones ?? '',
    actualizadoPorCorreo: f.ActualizadoPorCorreo,
    actualizadoEn: f.ActualizadoEn,
  };
}

/** Codifica la combinación planta+rango como una clave de texto estable. */
export function claveObservacion(plantaId: string, fechaDesde: string, fechaHasta: string): string {
  return `${plantaId || 'todas'}_${fechaDesde}_${fechaHasta}`;
}

export async function buscarObservacion(
  token: string,
  plantaId: string,
  fechaDesde: string,
  fechaHasta: string,
): Promise<ObservacionIndicadores | null> {
  const clave = claveObservacion(plantaId, fechaDesde, fechaHasta);
  const items = await getAllItems<ObservacionFields>(
    token,
    appConfig.listas.indicadoresObservaciones,
    `fields/Title eq '${clave.replace(/'/g, "''")}'`,
  );
  return items[0] ? mapObservacion(items[0]) : null;
}

export interface GuardarObservacionInput {
  plantaId: string;
  fechaDesde: string;
  fechaHasta: string;
  texto: string;
  correo: string;
}

/**
 * Guarda (crea o actualiza) la observación del informe para esta
 * combinación exacta de planta+rango. UPSERT real, igual que
 * guardarInclinacionSesion: si ya existe un ítem con la misma clave se
 * actualiza (PATCH) en vez de crear uno nuevo.
 */
export async function guardarObservacion(
  token: string,
  input: GuardarObservacionInput,
): Promise<ObservacionIndicadores> {
  const clave = claveObservacion(input.plantaId, input.fechaDesde, input.fechaHasta);
  const existente = await buscarObservacion(token, input.plantaId, input.fechaDesde, input.fechaHasta);
  const { siteId, listId } = await siteAndList(token, appConfig.listas.indicadoresObservaciones);
  const ahora = new Date().toISOString();

  if (existente) {
    await graph.fetch(`/sites/${siteId}/lists/${listId}/items/${existente.id}/fields`, token, {
      method: 'PATCH',
      body: JSON.stringify({
        Observaciones: input.texto,
        ActualizadoPorCorreo: input.correo,
        ActualizadoEn: ahora,
      }),
    });
    return { ...existente, texto: input.texto, actualizadoPorCorreo: input.correo, actualizadoEn: ahora };
  }

  const created: SpListItem<ObservacionFields> = await graph.fetch(
    `/sites/${siteId}/lists/${listId}/items`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          Title: clave,
          PlantaId: input.plantaId,
          FechaDesde: input.fechaDesde,
          FechaHasta: input.fechaHasta,
          Observaciones: input.texto,
          ActualizadoPorCorreo: input.correo,
          ActualizadoEn: ahora,
        },
      }),
    },
  );
  return mapObservacion(created);
}

// ---------- Evidencia fotográfica ----------

/** SharePoint no permite ciertos caracteres en nombres de carpeta/archivo. */
function sanitizarParaRuta(texto: string): string {
  return texto.replace(/["*:<>?/\\|#%~]/g, '_').trim();
}

/** Sube una foto a la biblioteca de documentos "Evidencias" y devuelve su ID. */
export async function subirEvidencia(
  token: string,
  idCliente: string,
  numeroTiquete: string,
  orden: number,
  blob: Blob,
  nombreArchivo: string,
): Promise<string> {
  const siteId = await resolveSiteId(token);
  const driveId = await resolveEvidenciasDriveId(token, siteId);
  // La carpeta empieza con el número de tiquete para que sea fácil de
  // reconocer al navegar la biblioteca "Evidencias" directamente en
  // SharePoint, pero termina siempre con el IdCliente (UUID) para
  // garantizar que sea única: el mismo número de tiquete puede repetirse
  // en otro día, otra planta, o por un error de captura — sin el UUID, las
  // fotos de dos auditorías distintas con el mismo tiquete terminarían
  // mezclándose (o sobrescribiéndose) en la misma carpeta.
  const rutaCarpeta = `${sanitizarParaRuta(numeroTiquete)}_${idCliente}`;
  const nombre = `${orden}_${nombreArchivo}`;

  // Subida simple (válida hasta ~4MB, suficiente para fotos ya comprimidas
  // en el cliente a 150-400KB). Para archivos más grandes, usar upload
  // session: POST /createUploadSession.
  const item: { id: string } = await graph.fetch(
    `/sites/${siteId}/drives/${driveId}/root:/${encodeURIComponent(rutaCarpeta)}/${encodeURIComponent(nombre)}:/content`,
    token,
    { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type || 'image/jpeg' } },
    appConfig.graph.uploadTimeoutMs,
  );
  return item.id;
}
