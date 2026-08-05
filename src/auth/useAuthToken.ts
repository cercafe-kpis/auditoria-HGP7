import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { graphLoginRequest } from './msalConfig';
import { appConfig } from '../config/appConfig';

/**
 * Envuelve una promesa con un límite de tiempo propio. No cancela la
 * promesa original — MSAL no expone una forma de abortar
 * acquireTokenSilent — pero permite que el código de la app siga su curso
 * aunque esa promesa nunca se resuelva. Es el mismo truco que graphFetch()
 * usa para las llamadas a Microsoft Graph, y por el mismo motivo: en campo,
 * con señal débil, la llamada de red que MSAL hace para renovar el token
 * puede quedarse esperando para siempre. Sin este límite, eso deja el
 * ítem en 'Sincronizando…' para siempre, sin ni siquiera llegar a intentar
 * la llamada a Graph (que sí tiene su propio límite en graphClient.ts).
 */
function conLimiteDeTiempo<T>(promesa: Promise<T>, ms: number, mensaje: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const temporizador = setTimeout(() => reject(new Error(mensaje)), ms);
    promesa.then(
      (valor) => {
        clearTimeout(temporizador);
        resolve(valor);
      },
      (error) => {
        clearTimeout(temporizador);
        reject(error);
      },
    );
  });
}

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
      const result = await conLimiteDeTiempo(
        instance.acquireTokenSilent({ ...graphLoginRequest, account }),
        appConfig.aad.timeoutMs,
        'Se agotó el tiempo de espera confirmando la sesión con Microsoft.',
      );
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

      // Cualquier otro fallo (por ejemplo, nuestro propio límite de tiempo,
      // o un "timed_out" real de MSAL: su técnica interna —un iframe
      // oculto— para confirmar la sesión sin interrumpir al usuario puede
      // agotar su propio tiempo de espera con una conexión lenta/inestable
      // o con cookies de terceros bloqueadas) suele ser pasajero. Se
      // intenta una vez más antes de darse por vencido, y si vuelve a
      // fallar se traduce a un mensaje claro en vez de mostrar el error
      // técnico interno de la librería tal cual.
      try {
        const reintento = await conLimiteDeTiempo(
          instance.acquireTokenSilent({ ...graphLoginRequest, account }),
          appConfig.aad.timeoutMs,
          'Se agotó el tiempo de espera confirmando la sesión con Microsoft.',
        );
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
