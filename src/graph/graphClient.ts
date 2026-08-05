import { appConfig } from '../config/appConfig';

/**
 * Envoltorio delgado sobre fetch() para llamar a Microsoft Graph con un
 * token Bearer ya obtenido (ver useAuthToken). No usamos el SDK oficial
 * @microsoft/microsoft-graph-client para mantener el bundle pequeño —
 * la superficie de Graph que necesitamos aquí es pequeña y estable.
 */

export class GraphError extends Error {
  status: number;
  body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'GraphError';
    this.status = status;
    this.body = body;
  }
}

async function graphFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
  timeoutMs: number = appConfig.graph.timeoutMs,
): Promise<T> {
  const url = path.startsWith('http') ? path : `${appConfig.graph.baseUrl}${path}`;

  // Sin esto, en una conexión de campo débil o intermitente un fetch()
  // puede quedarse esperando para siempre: el registro de la cola nunca
  // pasa a 'error-sync' (porque nunca falla) y el candado
  // `syncEnCurso` de syncService.ts queda bloqueado indefinidamente,
  // impidiendo que se sincronice CUALQUIER otro registro, incluso en
  // reintentos automáticos o manuales posteriores.
  //
  // No basta con controller.abort(): Safari/WebKit en iOS tiene fallas
  // conocidas donde abortar una solicitud CON CUERPO (como el PUT de una
  // foto de evidencia) no hace que fetch() realmente se rechace — la
  // promesa se queda esperando para siempre aunque la señal de abort ya
  // se haya disparado. Por eso, en vez de confiar solo en abort(), se hace
  // una carrera (Promise.race) contra un temporizador independiente: así
  // el código de la app SIEMPRE sigue su curso al cumplirse el tiempo
  // límite, sin importar si el navegador coopera con el abort o no (la
  // solicitud real puede seguir viva un rato en segundo plano, pero ya no
  // bloquea nada).
  const controller = new AbortController();
  let temporizador: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    temporizador = setTimeout(() => {
      controller.abort();
      reject(
        new GraphError(
          `Se agotó el tiempo de espera esperando respuesta del servidor (${path}). ` +
            'La conexión es probablemente muy débil o intermitente; se reintentará automáticamente.',
          0,
        ),
      );
    }, timeoutMs);
  });

  let res: Response;
  try {
    res = await Promise.race([
      fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body && !(init.body instanceof FormData)
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...init?.headers,
        },
      }),
      timeoutPromise,
    ]);
  } catch (err) {
    // Si ya es nuestro GraphError de timeout, se propaga tal cual (mensaje
    // claro ya armado). Cualquier otro error de red (sin conexión, DNS,
    // CORS, etc.) se traduce también a un mensaje en español en vez de
    // mostrar el texto técnico crudo del navegador.
    if (err instanceof GraphError) throw err;
    const mensaje = err instanceof Error ? err.message : String(err);
    throw new GraphError(`No se pudo conectar con el servidor (${path}): ${mensaje}`, 0);
  } finally {
    clearTimeout(temporizador!);
  }

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new GraphError(`Graph API ${res.status} en ${path}`, res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const graph = { fetch: graphFetch };

/** Resuelve y cachea el siteId de SharePoint a partir del hostname + ruta. */
let cachedSiteId: string | null = null;
export async function resolveSiteId(token: string): Promise<string> {
  if (cachedSiteId) return cachedSiteId;
  const stored = localStorage.getItem('audigrasa:siteId');
  if (stored) {
    cachedSiteId = stored;
    return stored;
  }
  const path = `/sites/${appConfig.sharepoint.hostname}:${appConfig.sharepoint.sitePath}`;
  const site = await graph.fetch<{ id: string }>(path, token);
  cachedSiteId = site.id;
  localStorage.setItem('audigrasa:siteId', site.id);
  return site.id;
}

/** Resuelve y cachea los IDs (GUID) de cada Lista a partir de su nombre. */
const cachedListIds = new Map<string, string>();
export async function resolveListId(
  token: string,
  siteId: string,
  displayName: string,
): Promise<string> {
  const cacheKey = `audigrasa:list:${displayName}`;
  if (cachedListIds.has(displayName)) return cachedListIds.get(displayName)!;
  const stored = localStorage.getItem(cacheKey);
  if (stored) {
    cachedListIds.set(displayName, stored);
    return stored;
  }
  const result = await graph.fetch<{ value: { id: string; displayName: string }[] }>(
    `/sites/${siteId}/lists?$select=id,displayName`,
    token,
  );
  const found = result.value.find((l) => l.displayName === displayName);
  if (!found) {
    throw new Error(
      `No se encontró la Lista "${displayName}" en el sitio de SharePoint. ` +
        `Verifica el nombre exacto en appConfig.listas.`,
    );
  }
  cachedListIds.set(displayName, found.id);
  localStorage.setItem(cacheKey, found.id);
  return found.id;
}

/** Resuelve y cachea el ID del drive (biblioteca de documentos) de evidencia. */
let cachedDriveId: string | null = null;
export async function resolveEvidenciasDriveId(
  token: string,
  siteId: string,
): Promise<string> {
  if (cachedDriveId) return cachedDriveId;
  const stored = localStorage.getItem('audigrasa:driveId');
  if (stored) {
    cachedDriveId = stored;
    return stored;
  }
  const result = await graph.fetch<{ value: { id: string; name: string }[] }>(
    `/sites/${siteId}/drives?$select=id,name`,
    token,
  );
  const found = result.value.find(
    (d) => d.name === appConfig.sharepoint.evidenciasLibrary,
  );
  if (!found) {
    throw new Error(
      `No se encontró la biblioteca de documentos "${appConfig.sharepoint.evidenciasLibrary}".`,
    );
  }
  cachedDriveId = found.id;
  localStorage.setItem('audigrasa:driveId', found.id);
  return found.id;
}
