import { appConfig } from '../config/appConfig';
import { graph, resolveSiteId, resolveListId, resolveEvidenciasDriveId } from './graphClient';
import type {
  Planta,
  Metodologia,
  Operario,
  UsuarioApp,
  AuditoriaRemota,
  AuditoriaLogEntry,
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

  // Sigue la paginación de Graph (@odata.nextLink) hasta traer todo.
  // Para catálogos (plantas, metodologías, operarios, usuarios) el volumen
  // es pequeño; para Auditorías, las pantallas de reporte deben pasar
  // siempre un filtro de fecha/planta para no traer el histórico completo.
  while (path) {
    const res: SpListResponse<TFields> = await graph.fetch(path, token);
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

// ---------- Usuarios (roles) ----------
interface UsuarioFields {
  Title: string; // nombre
  Correo: string;
  Rol: Rol;
  PlantasAsignadasLookupId: string[];
  Activo: boolean;
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
  InclinacionHerramienta: boolean;
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
    inclinacionHerramienta: f.InclinacionHerramienta,
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
  inclinacionHerramienta: boolean;
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
      PlantaLookupId: input.plantaId,
      MetodologiaLookupId: input.metodologiaId,
      AuditorCorreo: input.auditorCorreo,
      OperarioLookupId: input.operarioId,
      NumeroTiquete: input.numeroTiquete,
      InclinacionHerramienta: input.inclinacionHerramienta,
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
        AuditoriaIdLookupId: entry.auditoriaId,
        UsuarioCorreo: entry.usuarioCorreo,
        Accion: entry.accion,
        DetalleJson: entry.detalleJson,
        CreadoEn: entry.creadoEn,
      },
    }),
  });
}

// ---------- Evidencia fotográfica ----------

/** Sube una foto a la biblioteca de documentos "Evidencias" y devuelve su ID. */
export async function subirEvidencia(
  token: string,
  idCliente: string,
  orden: number,
  blob: Blob,
  nombreArchivo: string,
): Promise<string> {
  const siteId = await resolveSiteId(token);
  const driveId = await resolveEvidenciasDriveId(token, siteId);
  const rutaCarpeta = idCliente; // una carpeta por auditoría dentro de la biblioteca
  const nombre = `${orden}_${nombreArchivo}`;

  // Subida simple (válida hasta ~4MB, suficiente para fotos ya comprimidas
  // en el cliente a 150-400KB). Para archivos más grandes, usar upload
  // session: POST /createUploadSession.
  const item: { id: string } = await graph.fetch(
    `/sites/${siteId}/drives/${driveId}/root:/${encodeURIComponent(rutaCarpeta)}/${encodeURIComponent(nombre)}:/content`,
    token,
    { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type || 'image/jpeg' } },
  );
  return item.id;
}
