/** Tipos que reflejan exactamente las columnas de las Listas de SharePoint
 * definidas en el documento de arquitectura (sección 4). */

export type Rol = 'Administrador' | 'Auditor' | 'Consulta';

export type Clasificacion = 'Bueno' | 'Regular' | 'Malo' | 'Insuficiente';

export type EstadoSync = 'Pendiente' | 'Sincronizada';

export interface Planta {
  id: string; // id del ítem en SharePoint
  nombre: string; // columna Título
  codigo: string;
  ciudad: string;
  activa: boolean;
}

export interface Metodologia {
  id: string;
  nombre: string;
  version: string;
  descripcion: string;
  activa: boolean;
}

export interface Operario {
  id: string;
  nombre: string;
  documento: string;
  plantaId: string;
  cargo: string;
  activo: boolean;
}

export interface UsuarioApp {
  id: string;
  correo: string;
  nombre: string;
  rol: Rol;
  plantasAsignadas: string[]; // ids de Planta
  activo: boolean;
}

/** Auditoría tal como vive localmente (IndexedDB) antes/durante sincronización. */
export interface AuditoriaLocal {
  idCliente: string; // UUID generado en el dispositivo — es el "Título" en SharePoint
  fechaAuditoria: string; // ISO date
  plantaId: string;
  metodologiaId: string;
  auditorCorreo: string;
  operarioId: string;
  numeroTiquete: string;
  tieneMarca: boolean;
  marcaIntercostalCorrecta: boolean;
  clasificacion: Clasificacion;
  canalGrasosa: boolean;
  capturadaEn: string; // ISO datetime, hora del dispositivo
  fotos: FotoLocal[];
  estado: 'local-pendiente' | 'sincronizando' | 'sincronizada' | 'error-sync';
  intentosSync: number;
  ultimoError?: string;
}

/**
 * Muestreo de inclinación de la herramienta — se registra por SESIÓN
 * (misma fecha+planta+metodología+auditor+operario), no por canal/tiquete:
 * el auditor revisa varias canales seguidas y anota cuántas de esas
 * canales tenían la inclinación correcta. No tiene relación 1 a 1 con la
 * auditoría de canal (Tiquete/Marca/Clasificación/etc.), que se hace en un
 * momento distinto — por eso vive en su propia lista/cola, separada de
 * AuditoriaLocal/AuditoriaRemota aunque comparta esos 5 campos de contexto.
 */
export interface InclinacionLocal {
  idCliente: string;
  fechaAuditoria: string;
  plantaId: string;
  metodologiaId: string;
  auditorCorreo: string;
  operarioId: string;
  canalesRevisadas: number;
  canalesCorrectas: number;
  capturadaEn: string;
  estado: 'local-pendiente' | 'sincronizando' | 'sincronizada' | 'error-sync';
  intentosSync: number;
  ultimoError?: string;
}

export interface InclinacionRemota {
  id: string;
  idCliente: string;
  fechaAuditoria: string;
  plantaId: string;
  metodologiaId: string;
  auditorCorreo: string;
  operarioId: string;
  canalesRevisadas: number;
  canalesCorrectas: number;
  estadoSync: EstadoSync;
  capturadaEn: string;
  recibidaEn: string;
}

export interface FotoLocal {
  orden: number;
  blob: Blob;
  nombreArchivo: string;
  tomadaEn: string; // ISO datetime
}

/** Auditoría tal como se lee de vuelta desde SharePoint (ya sincronizada). */
export interface AuditoriaRemota {
  id: string;
  idCliente: string;
  fechaAuditoria: string;
  plantaId: string;
  metodologiaId: string;
  auditorCorreo: string;
  operarioId: string;
  numeroTiquete: string;
  tieneMarca: boolean;
  marcaIntercostalCorrecta: boolean;
  clasificacion: Clasificacion;
  canalGrasosa: boolean;
  estadoSync: EstadoSync;
  capturadaEn: string;
  recibidaEn: string;
}

export interface AuditoriaLogEntry {
  auditoriaId: string;
  usuarioCorreo: string;
  accion: string;
  detalleJson: string;
  creadoEn: string;
}

/**
 * Sesión activa del día — SOLO local (no se sincroniza como tal, no tiene
 * lista propia en SharePoint). Es la "pantalla inicial" que el auditor
 * llena una sola vez (Fecha, Planta, Metodología, Auditor, Operario) y que
 * de ahí en adelante alimenta tanto la Inclinación de la herramienta como
 * la Clasificación/medición, sin tener que volver a diligenciarla. Vive en
 * una sola fila fija (id: 'actual') en IndexedDB; "Cambiar sesión" la
 * borra para volver a pedirla.
 *
 * `inclinacionId` se genera una única vez al crear la sesión y es el
 * IdCliente estable del registro agregado de InclinacionLocal de esa
 * sesión — así, cada Sí/No de la pantalla de inclinación actualiza SIEMPRE
 * el mismo registro (mismo idCliente) en vez de crear uno nuevo por toque.
 */
export interface SesionActivaLocal {
  id: 'actual';
  fechaAuditoria: string;
  plantaId: string;
  metodologiaId: string;
  auditorCorreo: string;
  operarioId: string;
  inclinacionId: string;
  creadaEn: string;
}
