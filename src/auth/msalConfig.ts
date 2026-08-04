import type { Configuration } from '@azure/msal-browser';
import { LogLevel } from '@azure/msal-browser';
import { appConfig } from '../config/appConfig';

/**
 * Configuración de MSAL para una SPA pública (sin client secret, con PKCE).
 *
 * Esta app REUTILIZA el registro de aplicación en Entra ID que ya usa
 * "Inspección Pulmonar" — mismo Client ID y mismo Tenant ID (ver
 * appConfig.aad). El código de ambas apps vive en repositorios
 * completamente separados; lo único compartido es la identidad de la
 * aplicación en Entra ID, que ya tiene consentido el permiso delegado de
 * Microsoft Graph `Sites.ReadWrite.All`.
 *
 * Lo único que hay que agregar en ese registro existente al desplegar
 * esta app es una Redirect URI adicional (la URL de GitHub Pages de
 * ESTE proyecto), sin tocar la que ya usa pulmones. Ver README.
 */
export const msalConfig: Configuration = {
  auth: {
    clientId: appConfig.aad.clientId,
    authority: `https://login.microsoftonline.com/${appConfig.aad.tenantId}`,
    redirectUri: appConfig.aad.redirectUri,
    postLogoutRedirectUri: appConfig.aad.redirectUri,
  },
  cache: {
    // localStorage (no sessionStorage) para que la sesión sobreviva a que
    // el usuario cierre y reabra la PWA instalada en su celular.
    cacheLocation: 'localStorage',
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error('[MSAL]', message);
      },
      logLevel: LogLevel.Warning,
    },
  },
};

/** Scopes solicitados al iniciar sesión y al renovar token silenciosamente. */
export const graphLoginRequest = {
  scopes: appConfig.graph.scopes.map((s) => `https://graph.microsoft.com/${s}`),
};
