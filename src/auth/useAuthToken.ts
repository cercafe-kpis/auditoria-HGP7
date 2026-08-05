import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { graphLoginRequest } from './msalConfig';

/**
 * Hook que expone una función para obtener un token de acceso válido para
 * Microsoft Graph. Intenta primero adquisición silenciosa (usando el
 * refresh token cacheado); si falla porque requiere interacción (por
 * ejemplo, la sesión expiró mientras el dispositivo estaba sin conexión),
 * dispara un login por redirect.
 *
 * Este es el único punto de la app que "sabe" cómo conseguir un token —
 * tanto las llamadas en línea como el proceso de sincronización offline
 * pasan por aquí antes de llamar a Graph.
 */
export function useAuthToken() {
  const { instance, accounts } = useMsal();

  /**
   * @param interactivo Si es `true`, permite que esta función interrumpa al
   * usuario con una redirección de página completa a Microsoft cuando la
   * sesión ya no se puede renovar en silencio. Debe ser `true` SOLO cuando
   * viene de una acción explícita del usuario (por ejemplo, tocar
   * "Sincronizar ahora"). Cuando viene de un proceso automático en segundo
   * plano (sincronización al reconectar, reintento periódico), debe ser
   * `false` — de lo contrario, un token vencido durante una prueba de campo
   * larga dispararía una redirección de página completa sin que el usuario
   * la haya pedido, algo especialmente confuso con conexión débil o nula
   * (la página puede quedar cargando o mostrar un error del navegador en
   * vez de la app). En ese caso simplemente se lanza un error claro y el
   * ítem queda en 'error-sync' para reintentarse cuando el usuario vuelva
   * a tocar "Sincronizar ahora" con buena conexión.
   */
  async function getAccessToken(interactivo = true): Promise<string> {
    const account = accounts[0];
    if (!account) {
      if (!interactivo) {
        throw new Error('Debes iniciar sesión para sincronizar. Toca "Sincronizar ahora".');
      }
      await instance.loginRedirect(graphLoginRequest);
      // loginRedirect navega fuera de la app; esto nunca debería resolverse.
      throw new Error('Redirigiendo a inicio de sesión...');
    }

    try {
      const result = await instance.acquireTokenSilent({
        ...graphLoginRequest,
        account,
      });
      return result.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        if (!interactivo) {
          throw new Error(
            'Tu sesión venció y se requiere iniciar sesión nuevamente. Toca "Sincronizar ahora" para hacerlo.',
          );
        }
        // Solo aquí se interrumpe al usuario — nunca durante la captura
        // offline de una auditoría, únicamente al tocar "Sincronizar ahora".
        await instance.acquireTokenRedirect(graphLoginRequest);
        throw new Error('Se requiere iniciar sesión nuevamente para sincronizar.');
      }

      // Cualquier otro fallo de acquireTokenSilent (por ejemplo un
      // "timed_out": MSAL usa una técnica interna —un iframe oculto— para
      // confirmar la sesión sin interrumpir al usuario, y puede agotar su
      // propio tiempo de espera con una conexión lenta/inestable o con
      // cookies de terceros bloqueadas por el navegador) suele ser
      // pasajero. Se intenta una vez más antes de darse por vencido, y si
      // vuelve a fallar se traduce a un mensaje claro en vez de mostrar el
      // error técnico interno de la librería tal cual.
      try {
        const reintento = await instance.acquireTokenSilent({
          ...graphLoginRequest,
          account,
        });
        return reintento.accessToken;
      } catch {
        const mensaje = error instanceof Error ? error.message : String(error);
        throw new Error(
          `No se pudo confirmar tu sesión de Microsoft (${mensaje}). Verifica tu conexión a internet e intenta de nuevo en unos segundos.`,
        );
      }
    }
  }

  return { getAccessToken };
}
