import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, contarPendientes } from './db';
import { procesarColaSincronizacion, calcularEsperaBackoff } from './syncService';
import { useOnlineStatus } from './useOnlineStatus';
import { useAuthToken } from '../auth/useAuthToken';

/**
 * Hook central que un layout raíz (ver App.tsx) mantiene montado siempre:
 * observa la cola local en vivo, dispara sincronización automática al
 * recuperar conexión, y expone una acción manual "sincronizar ahora" para
 * el badge de la interfaz.
 */
export function useSyncQueue() {
  const online = useOnlineStatus();
  const { getAccessToken } = useAuthToken();
  const [sincronizando, setSincronizando] = useState(false);

  const pendientes = useLiveQuery(() => contarPendientes(), [], 0);

  const sincronizarAhora = useCallback(async () => {
    if (!online) return;
    setSincronizando(true);
    try {
      await procesarColaSincronizacion(getAccessToken);
    } finally {
      setSincronizando(false);
    }
  }, [online, getAccessToken]);

  // Sincroniza automáticamente al recuperar conexión.
  useEffect(() => {
    if (online) void sincronizarAhora();
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reintento periódico en segundo plano para los que quedaron en error,
  // con backoff creciente (ver syncService.calcularEsperaBackoff).
  useEffect(() => {
    if (!online) return;
    let cancelado = false;
    let manejador: ReturnType<typeof setTimeout>;

    async function ciclo() {
      const conError = await db.auditoriasPendientes.where('estado').equals('error-sync').first();
      const espera = conError ? calcularEsperaBackoff(conError.intentosSync) : 30000;
      manejador = setTimeout(async () => {
        if (cancelado) return;
        await sincronizarAhora();
        void ciclo();
      }, espera);
    }
    void ciclo();

    return () => {
      cancelado = true;
      clearTimeout(manejador);
    };
  }, [online, sincronizarAhora]);

  return {
    online,
    pendientes: pendientes ?? 0,
    sincronizando,
    sincronizarAhora,
    limiteAdvertencia: 50,
  };
}
