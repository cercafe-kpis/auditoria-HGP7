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
): Promise<T> {
  const url = path.startsWith('http') ? path : `${appConfig.graph.baseUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init?.headers,
    },
  });

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
