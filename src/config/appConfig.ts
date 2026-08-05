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
    // Tiempo máximo de espera para que MSAL confirme/renueve la sesión en
    // silencio (ver useAuthToken.ts). Esta llamada es de red igual que las
    // de Graph, pero es un paso ANTERIOR a cualquier llamada a Graph — sin
    // límite propio aquí, una sesión colgada en este paso deja el ítem en
    // 'Sincronizando…' para siempre sin ni siquiera llegar a intentar subir
    // la foto o crear el registro (que sí tienen su propio límite).
    timeoutMs: 20000,
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
    indicadoresObservaciones: 'IndicadoresObservaciones',
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
    // Tiempo máximo de espera por solicitud a Graph antes de abortarla y
    // marcarla como fallida (ver graphClient.ts). Sin esto, una solicitud
    // en una conexión de campo débil o intermitente puede quedar "colgada"
    // indefinidamente y bloquear TODA la cola de sincronización detrás de
    // ella (ver syncService.ts) — nunca falla, pero tampoco avanza.
    timeoutMs: 25000,
    // Las fotos de evidencia pesan más que un simple registro JSON, así que
    // se les da más tiempo antes de considerarlas colgadas.
    uploadTimeoutMs: 60000,
  },
} as const;
