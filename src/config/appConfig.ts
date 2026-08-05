/**
 * Configuración central de la app. Todos los valores reales se inyectan por
 * variables de entorno (ver .env.example) — nunca se deben "quemar" en el
 * código IDs de tenant/cliente reales.
 */

function requireEnv(name: string, fallback: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv] as string | undefined;
  if (!value) {
    // No lanzamos error duro en build para no romper el scaffold antes de
    // configurar credenciales reales; en runtime se advierte en consola.
    console.warn(`[config] Variable de entorno ${name} no configurada, usando valor por defecto.`);
    return fallback;
  }
  return value;
}

export const appConfig = {
  aad: {
    clientId: requireEnv('VITE_AAD_CLIENT_ID', '00000000-0000-0000-0000-000000000000'),
    tenantId: requireEnv('VITE_AAD_TENANT_ID', '00000000-0000-0000-0000-000000000000'),
    redirectUri: requireEnv('VITE_AAD_REDIRECT_URI', window.location.origin + '/'),
  },
  sharepoint: {
    hostname: requireEnv('VITE_SP_HOSTNAME', 'tuempresa.sharepoint.com'),
    sitePath: requireEnv('VITE_SP_SITE_PATH', '/sites/AuditoriaGrasaDorsal'),
    evidenciasLibrary: requireEnv('VITE_SP_EVIDENCIAS_LIBRARY', 'Evidencias'),
  },
  // Nombres EXACTOS que deben tener las Listas en SharePoint.
  // Ver README.md sección "Estructura de Listas de SharePoint".
  listas: {
    plantas: 'Plantas',
    metodologias: 'Metodologias',
    operarios: 'Operarios',
    usuarios: 'Usuarios',
    auditorias: 'Auditorias',
    auditoriaLog: 'AuditoriaLog',
    inclinacionHerramienta: 'InclinacionHerramienta',
  },
  offline: {
    // Máximo de auditorías pendientes acumulables antes de advertir al
    // auditor que revise su conexión (ver documento de arquitectura, 8.4).
    maxPendientesAntesDeAdvertir: 50,
    // Reintentos de sincronización con backoff exponencial (ms).
    reintentosBackoffMs: [5000, 15000, 45000, 120000],
  },
  graph: {
    baseUrl: 'https://graph.microsoft.com/v1.0',
    // Sites.ReadWrite.All (no Sites.Selected): esta app reutiliza el MISMO
    // registro de aplicación en Entra ID que "Inspección Pulmonar" (mismo
    // Client ID y Tenant ID), que ya tiene este permiso consentido por un
    // administrador. Al compartir el registro, no hace falta otorgar
    // acceso `Sites.Selected` sitio por sitio — con iniciar sesión ya
    // alcanza cualquier sitio de SharePoint al que el usuario tenga acceso.
    // El código de esta app vive en su propio proyecto/repositorio,
    // completamente separado del de pulmones — solo se comparte la
    // identidad de la aplicación en Entra ID, no el código.
    scopes: ['Sites.ReadWrite.All'],
  },
} as const;
