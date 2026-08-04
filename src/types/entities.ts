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
  inclinacionHerramienta: boolean;
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
  inclinacionHerramienta: boolean;
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
