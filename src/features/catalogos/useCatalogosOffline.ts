import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../offline/db';
import { useAuthToken } from '../../auth/useAuthToken';
import { getPlantas, getMetodologias, getOperarios } from '../../graph/lists';

/**
 * Mantiene los catálogos (Plantas, Metodologías, Operarios) cacheados en
 * IndexedDB, refrescándolos cada vez que hay conexión disponible. El
 * formulario de auditoría siempre lee de este caché local — nunca
 * directamente de Graph — para poder diligenciarse sin conexión.
 */
export function useCatalogosOffline() {
  const { getAccessToken } = useAuthToken();

  useEffect(() => {
    if (!navigator.onLine) return;
    let cancelado = false;

    async function refrescar() {
      try {
        const token = await getAccessToken();
        const [plantas, metodologias, operarios] = await Promise.all([
          getPlantas(token),
          getMetodologias(token),
          getOperarios(token),
        ]);
        if (cancelado) return;
        await db.transaction('rw', db.plantas, db.metodologias, db.operarios, async () => {
          await db.plantas.clear();
          await db.plantas.bulkAdd(plantas);
          await db.metodologias.clear();
          await db.metodologias.bulkAdd(metodologias);
          await db.operarios.clear();
          await db.operarios.bulkAdd(operarios);
        });
      } catch {
        // Si falla el refresco (p. ej. token expiró), se sigue trabajando
        // con lo que ya haya en caché — no se interrumpe al usuario.
      }
    }

    void refrescar();
    return () => {
      cancelado = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Se filtra en memoria (no con un índice IndexedDB) porque el soporte de
  // índices booleanos varía entre navegadores; el volumen de plantas es
  // siempre pequeño, así que el costo es insignificante.
  const plantas = useLiveQuery(
    async () => (await db.plantas.toArray()).filter((p) => p.activa),
    [],
    [],
  );
  const metodologias = useLiveQuery(() => db.metodologias.toArray(), [], []);
  const operarios = useLiveQuery(() => db.operarios.toArray(), [], []);

  return { plantas: plantas ?? [], metodologias: metodologias ?? [], operarios: operarios ?? [] };
}
