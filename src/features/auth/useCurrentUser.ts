import { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../offline/db';
import { useAuthToken } from '../../auth/useAuthToken';
import { getUsuarioPorCorreo } from '../../graph/lists';
import type { UsuarioApp } from '../../types/entities';

/**
 * Resuelve el rol y las plantas asignadas del usuario ya autenticado con
 * Entra ID, consultando la Lista "Usuarios" de SharePoint. El resultado se
 * cachea en IndexedDB para que la app siga sabiendo "quién es" y "qué
 * puede hacer" incluso sin conexión (crítico: sin esto, un auditor no
 * podría ni abrir el formulario si pierde señal justo al iniciar turno).
 */
export function useCurrentUser() {
  const { accounts } = useMsal();
  const { getAccessToken } = useAuthToken();
  const correo = accounts[0]?.username ?? null;
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const usuarioCacheado = useLiveQuery(
    () => (correo ? db.usuarios.where('correo').equals(correo).first() : undefined),
    [correo],
  );

  useEffect(() => {
    if (!correo) return;
    let cancelado = false;

    async function refrescar() {
      try {
        if (!navigator.onLine) return; // usa solo el caché mientras no haya red
        const token = await getAccessToken();
        const usuario = await getUsuarioPorCorreo(token, correo!);
        if (usuario && !cancelado) {
          await db.usuarios.put(usuario as UsuarioApp);
        }
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    void refrescar();
    return () => {
      cancelado = true;
    };
  }, [correo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (usuarioCacheado !== undefined) setCargando(false);
  }, [usuarioCacheado]);

  return {
    correo,
    usuario: usuarioCacheado ?? null,
    cargando,
    error,
  };
}
