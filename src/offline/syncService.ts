import { db } from './db';
import { appConfig } from '../config/appConfig';
import {
  crearAuditoriaIdempotente,
  guardarInclinacionSesion,
  subirEvidencia,
} from '../graph/lists';
import type { AuditoriaLocal, InclinacionLocal } from '../types/entities';

type TokenGetter = (interactivo?: boolean) => Promise<string>;

let syncEnCurso = false;

/**
 * Procesa las dos colas locales — auditorías de canal e inclinación de
 * herramienta — que son independientes entre sí (ver comentario en
 * types/entities.ts sobre InclinacionLocal). Para auditorías, primero sube
 * las fotos a Evidencias y luego crea el ítem en la Lista Auditorías (una
 * vez, nunca se vuelve a tocar). Para inclinación es un UPSERT: el
 * agregado de la sesión crece con cada Sí/No, así que cada sincronización
 * actualiza el mismo ítem con los totales más recientes. Ambas son
 * idempotentes por IdCliente — nunca duplican el ítem. Si un paso falla,
 * el registro queda en estado 'error-sync' con backoff antes del próximo
 * reintento — nunca se pierde ni se bloquea el resto de la cola.
 *
 * Se llama: al detectar el evento 'online', periódicamente en segundo
 * plano, y desde un botón manual "Sincronizar ahora" en la UI.
 */
export async function procesarColaSincronizacion(
  getAccessToken: TokenGetter,
  interactivo = false,
): Promise<{
  sincronizadas: number;
  fallidas: number;
}> {
  if (syncEnCurso) return { sincronizadas: 0, fallidas: 0 };
  syncEnCurso = true;
  let sincronizadas = 0;
  let fallidas = 0;

  try {
    const pendientesAuditorias = await db.auditoriasPendientes
      .where('estado')
      .anyOf(['local-pendiente', 'error-sync'])
      .toArray();

    for (const auditoria of pendientesAuditorias) {
      try {
        await sincronizarUnaAuditoria(auditoria, getAccessToken, interactivo);
        sincronizadas++;
      } catch (err) {
        fallidas++;
        await registrarFalloAuditoria(auditoria, err);
      }
    }

    const pendientesInclinaciones = await db.inclinacionesPendientes
      .where('estado')
      .anyOf(['local-pendiente', 'error-sync'])
      .toArray();

    for (const inclinacion of pendientesInclinaciones) {
      try {
        await sincronizarUnaInclinacion(inclinacion, getAccessToken, interactivo);
        sincronizadas++;
      } catch (err) {
        fallidas++;
        await registrarFalloInclinacion(inclinacion, err);
      }
    }
  } finally {
    syncEnCurso = false;
  }

  return { sincronizadas, fallidas };
}

async function sincronizarUnaAuditoria(
  auditoria: AuditoriaLocal,
  getAccessToken: TokenGetter,
  interactivo: boolean,
) {
  await db.auditoriasPendientes.update(auditoria.idCliente, { estado: 'sincronizando' });
  const token = await getAccessToken(interactivo);

  // 1) Subir fotos primero — si falla, no se crea el ítem de auditoría
  //    todavía, para no dejar un registro "sincronizado" sin evidencia.
  for (const foto of auditoria.fotos) {
    await subirEvidencia(token, auditoria.idCliente, foto.orden, foto.blob, foto.nombreArchivo);
  }

  // 2) Crear el ítem en la Lista Auditorías (idempotente por IdCliente).
  await crearAuditoriaIdempotente(token, {
    idCliente: auditoria.idCliente,
    fechaAuditoria: auditoria.fechaAuditoria,
    plantaId: auditoria.plantaId,
    metodologiaId: auditoria.metodologiaId,
    auditorCorreo: auditoria.auditorCorreo,
    operarioId: auditoria.operarioId,
    numeroTiquete: auditoria.numeroTiquete,
    tieneMarca: auditoria.tieneMarca,
    marcaIntercostalCorrecta: auditoria.marcaIntercostalCorrecta,
    clasificacion: auditoria.clasificacion,
    canalGrasosa: auditoria.canalGrasosa,
    capturadaEn: auditoria.capturadaEn,
  });

  // 3) Éxito — se elimina de la cola local (ya vive en SharePoint).
  await db.auditoriasPendientes.delete(auditoria.idCliente);
}

async function registrarFalloAuditoria(auditoria: AuditoriaLocal, err: unknown) {
  const intentos = (auditoria.intentosSync ?? 0) + 1;
  const mensaje = err instanceof Error ? err.message : String(err);
  await db.auditoriasPendientes.update(auditoria.idCliente, {
    estado: 'error-sync',
    intentosSync: intentos,
    ultimoError: mensaje,
  });
}

async function sincronizarUnaInclinacion(
  inclinacion: InclinacionLocal,
  getAccessToken: TokenGetter,
  interactivo: boolean,
) {
  await db.inclinacionesPendientes.update(inclinacion.idCliente, { estado: 'sincronizando' });
  const token = await getAccessToken(interactivo);

  await guardarInclinacionSesion(token, {
    idCliente: inclinacion.idCliente,
    fechaAuditoria: inclinacion.fechaAuditoria,
    plantaId: inclinacion.plantaId,
    metodologiaId: inclinacion.metodologiaId,
    auditorCorreo: inclinacion.auditorCorreo,
    operarioId: inclinacion.operarioId,
    canalesRevisadas: inclinacion.canalesRevisadas,
    canalesCorrectas: inclinacion.canalesCorrectas,
    capturadaEn: inclinacion.capturadaEn,
  });

  // A diferencia de las auditorías de canal, este registro NO se borra:
  // el auditor puede seguir tocando Sí/No en la misma sesión, y cada toque
  // vuelve a marcarlo 'local-pendiente' para reenviar el total actualizado.
  await db.inclinacionesPendientes.update(inclinacion.idCliente, { estado: 'sincronizada' });
}

async function registrarFalloInclinacion(inclinacion: InclinacionLocal, err: unknown) {
  const intentos = (inclinacion.intentosSync ?? 0) + 1;
  const mensaje = err instanceof Error ? err.message : String(err);
  await db.inclinacionesPendientes.update(inclinacion.idCliente, {
    estado: 'error-sync',
    intentosSync: intentos,
    ultimoError: mensaje,
  });
}

/** Backoff exponencial para reintentos automáticos en segundo plano. */
export function calcularEsperaBackoff(intentos: number): number {
  const tabla = appConfig.offline.reintentosBackoffMs;
  return tabla[Math.min(intentos, tabla.length - 1)];
}
