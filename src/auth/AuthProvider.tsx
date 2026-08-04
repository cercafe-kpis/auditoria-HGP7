import { PublicClientApplication, EventType } from '@azure/msal-browser';
import type { AuthenticationResult } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import type { ReactNode } from 'react';
import { msalConfig } from './msalConfig';

export const msalInstance = new PublicClientApplication(msalConfig);

/**
 * Desde msal-browser v3+, la instancia DEBE inicializarse (llamada async)
 * antes de usar cualquier otro método (getAllAccounts, login*,
 * acquireToken*, etc.) — de lo contrario se produce el error
 * "uninitialized_public_client_application". Se llama una única vez desde
 * main.tsx, antes de montar React, y se espera su resultado.
 */
export async function initializeMsal() {
  await msalInstance.initialize();

  // Si al recargar la página ya hay una cuenta en caché pero ninguna activa
  // (por ejemplo tras un redirect), la fijamos como cuenta activa.
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
  }

  msalInstance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
      const payload = event.payload as AuthenticationResult;
      msalInstance.setActiveAccount(payload.account);
    }
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
