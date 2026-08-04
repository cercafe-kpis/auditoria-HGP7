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

  async function getAccessToken(): Promise<string> {
    const account = accounts[0];
    if (!account) {
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
        // Solo aquí se interrumpe al usuario — nunca durante la captura
        // offline de una auditoría, únicamente al momento de sincronizar.
        await instance.acquireTokenRedirect(graphLoginRequest);
        throw new Error('Se requiere iniciar sesión nuevamente para sincronizar.');
      }
      throw error;
    }
  }

  return { getAccessToken };
}
