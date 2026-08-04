import { db } from './db';
import { appConfig } from '../config/appConfig';
import { crearAuditoriaIdempotente, subirEvidencia } from '../graph/lists';
import type { AuditoriaLocal } from '../types/entities';

type TokenGetter = () => Promise<string>;

let syncEnCurso = false;

/**
 * Procesa la cola de auditorías pendientes: para cada una, sube primero
 * sus fotos a la biblioteca de Evidencias y luego crea el ítem en la Lista
 * Auditorías de forma idempotente (por IdCliente). Si un paso falla, el
 * registro queda en estado 'error-sync' con backoff antes del próximo
 * reintento — nunca se pierde ni se bloquea el resto de la cola.
 *
 * Se llama: al detectar el evento 'online', periódicamente en segundo
 * plano, y desde un botón manual "Sincronizar ahora" en la UI.
 */
export async function procesarColaSincronizacion(getAccessToken: TokenGetter): Promise<{
  sincronizadas: number;
  fallidas: number;
}> {
  if (syncEnCurso) return { sincronizadas: 0, fallidas: 0 };
  syncEnCurso = true;
  let sincronizadas = 0;
  let fallidas = 0;

  try {
    const pendientes = await db.auditoriasPendientes
      .where('estado')
      .anyOf(['local-pendiente', 'error-sync'])
      .toArray();

    for (const auditoria of pendientes) {
      try {
        await sincronizarUna(auditoria, getAccessToken);
        sincronizadas++;
      } catch (err) {
        fallidas++;
        await registrarFallo(auditoria, err);
      }
    }
  } finally {
    syncEnCurso = false;
  }

  return { sincronizadas, fallidas };
}

async function sincronizarUna(auditoria: AuditoriaLocal, getAccessToken: TokenGetter) {
  await db.auditoriasPendientes.update(auditoria.idCliente, { estado: 'sincronizando' });
  const token = await getAccessToken();

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
    inclinacionHerramienta: auditoria.inclinacionHerramienta,
    tieneMarca: auditoria.tieneMarca,
    marcaIntercostalCorrecta: auditoria.marcaIntercostalCorrecta,
    clasificacion: auditoria.clasificacion,
    canalGrasosa: auditoria.canalGrasosa,
    capturadaEn: auditoria.capturadaEn,
  });

  // 3) Éxito — se elimina de la cola local (ya vive en SharePoint).
  await db.auditoriasPendientes.delete(auditoria.idCliente);
}

async function registrarFallo(auditoria: AuditoriaLocal, err: unknown) {
  const intentos = (auditoria.intentosSync ?? 0) + 1;
  const mensaje = err instanceof Error ? err.message : String(err);
  await db.auditoriasPendientes.update(auditoria.idCliente, {
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
