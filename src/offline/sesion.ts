import { db } from './db';
import type { SesionActivaLocal } from '../types/entities';

/**
 * Crea (o reemplaza) la sesión activa del día. Siempre se llama desde
 * SesionForm, que solo se muestra cuando NO hay sesión activa — así que
 * cada llamada es, por definición, una sesión nueva y genera un
 * `inclinacionId` nuevo (no hay caso de "editar en el sitio" que deba
 * conservar el id anterior).
 */
export async function crearSesionActiva(datos: {
  fechaAuditoria: string;
  plantaId: string;
  metodologiaId: string;
  operarioId: string;
  auditorCorreo: string;
}): Promise<SesionActivaLocal> {
  const sesion: SesionActivaLocal = {
    id: 'actual',
    ...datos,
    inclinacionId: crypto.randomUUID(),
    creadaEn: new Date().toISOString(),
  };
  await db.sesionActual.put(sesion);
  return sesion;
}

/** "Cambiar sesión" — borra la sesión activa para volver a pedir la
 * pantalla inicial (por ejemplo, al cambiar de planta o de día). */
export async function limpiarSesionActiva(): Promise<void> {
  await db.sesionActual.delete('actual');
}
