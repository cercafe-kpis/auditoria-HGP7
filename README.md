# Auditoría de Grasa Dorsal

App web responsive y offline-first para auditar la medición de grasa dorsal en canales de cerdo. Corre íntegramente sobre licencias de Microsoft 365 ya existentes — sin backend propio ni costos de nube — replicando el patrón ya usado en la app de inspección de pulmones: frontend estático publicado en GitHub Pages, autenticado con Microsoft Entra ID, que lee y escribe directamente en Listas de SharePoint vía Microsoft Graph API.

Ver el documento de arquitectura completo (`Arquitectura-App-Auditoria-Grasa-Dorsal.md`, entregado junto con este scaffold) para el detalle de decisiones y trade-offs. Este README cubre solo lo operativo: cómo configurar, correr y desplegar.

## 1. Qué necesitas antes de empezar

- Acceso al registro de aplicación en Microsoft Entra ID que ya usa la app "Inspección Pulmonar" (se reutiliza el mismo — ver sección 2), o alguien de TI que pueda hacer el ajuste de la sección 2 por ti.
- Un sitio de SharePoint (puede ser uno nuevo, ej. `https://tuempresa.sharepoint.com/sites/AuditoriaGrasaDorsal`) donde vivirán las Listas.
- Node.js 20+ y una cuenta de GitHub.

## 2. Reutilizar el registro de aplicación de Entra ID (no se crea uno nuevo)

Esta app comparte a propósito el **mismo Client ID y Tenant ID** que "Inspección Pulmonar" — son dos proyectos de código completamente separados (repositorios distintos, sin nada en común), pero se identifican ante Microsoft con el mismo registro de aplicación en Entra ID. Esto evita repetir el registro y el consentimiento de administrador que ya existe para pulmones (que incluye el permiso `Sites.ReadWrite.All`, más amplio que solo un sitio — por eso alcanza para el sitio de esta app sin pasos adicionales).

Lo único que hay que hacer sobre ese registro **ya existente**:

1. Entra al mismo registro de aplicación de Entra ID que usa pulmones (Azure Portal → Microsoft Entra ID → Registros de aplicaciones → busca el nombre que le hayan puesto, ej. "Inspección Pulmonar" o similar).
2. En **Autenticación → Plataformas configuradas → SPA**, agrega dos Redirect URI **nuevas**, sin borrar las que ya tiene pulmones: `http://localhost:5173/` (para probar en tu computador) y la URL real de GitHub Pages de este proyecto (la agregas más adelante, en el paso 6, cuando ya sepas cuál es).
3. Copia el **Application (client) ID** y el **Directory (tenant) ID** que ya tiene ese registro — son los mismos que usa pulmones. Van en `.env.local` (paso 4).

No hace falta tocar **Permisos de API** (ya tiene `Sites.ReadWrite.All` consentido) ni crear ningún client secret.

## 3. Crear el sitio y las Listas de SharePoint

Crea (o reutiliza) un sitio de SharePoint, y dentro de él las siguientes Listas y Biblioteca, con estos nombres y columnas EXACTOS (ver detalle completo en el documento de arquitectura, sección 4):

| Lista/Biblioteca | Columnas (además de Título) |
|---|---|
| `Plantas` | Codigo (texto), Ciudad (texto), Activa (Sí/No) |
| `Metodologias` | Version (texto), Descripcion (texto largo), Activa (Sí/No) |
| `Operarios` | Documento (texto), Planta (búsqueda → `Plantas`), Cargo (texto), Activo (Sí/No) |
| `Usuarios` | Correo (texto, debe igualar la cuenta de M365), Rol (opción: Administrador/Auditor/Consulta), PlantasAsignadas (búsqueda multivalor → `Plantas`), Activo (Sí/No) |
| `Auditorias` | FechaAuditoria (fecha), Planta (búsqueda), Metodologia (búsqueda), AuditorCorreo (texto), Operario (búsqueda), NumeroTiquete (texto), InclinacionHerramienta (Sí/No), TieneMarca (Sí/No), MarcaIntercostalCorrecta (Sí/No), Clasificacion (opción: Bueno/Regular/Malo/Insuficiente), CanalGrasosa (Sí/No), EstadoSync (opción: Pendiente/Sincronizada), CapturadaEn (fecha y hora), RecibidaEn (fecha y hora) |
| `AuditoriaLog` | AuditoriaId (búsqueda → `Auditorias`), Usuario (persona), Accion (texto), DetalleJson (texto largo), CreadoEn (fecha y hora) |
| Biblioteca `Evidencias` | AuditoriaId (texto), Orden (número), TomadaEn (fecha y hora) |

**Importante:** en `Auditorias`, indexa las columnas `Planta`, `FechaAuditoria`, `AuditorCorreo` y `Operario` desde la configuración de la lista (Configuración de lista → Columnas indizadas) — esto evita el umbral de 5.000 elementos por vista filtrada a medida que crece el histórico (ver arquitectura, sección 4.1).

### Permisos por rol (sección 5 del documento de arquitectura)

Crea tres grupos de SharePoint sobre el sitio: `Administradores` (Control total), `Auditores` (Colaborar en `Auditorias` y `Evidencias`; solo Lectura en el resto), `Consulta` (solo Lectura en `Auditorias`, sin acceso a las demás). La aplicación oculta opciones de UI según el rol leído de la Lista `Usuarios`, pero el cumplimiento real lo hace SharePoint a este nivel.

Como el permiso de la aplicación (`Sites.ReadWrite.All`, sección 2) ya cubre cualquier sitio de SharePoint al que la persona logueada tenga acceso, no hace falta ningún paso adicional de "otorgar acceso al sitio" — basta con que cada usuario esté agregado al grupo de SharePoint correspondiente a su rol en este sitio.

> **Nota de seguridad:** al compartir el mismo registro de aplicación con pulmones y usar `Sites.ReadWrite.All`, cualquier persona que inicie sesión a través de esta identidad puede, en teoría, leer/escribir cualquier sitio de SharePoint al que tenga acceso — no solo el de esta app. El límite real de "quién puede hacer qué" lo dan los permisos de SharePoint de cada sitio (este, el de pulmones, y cualquier otro), no la aplicación. Si en el futuro se prefiere un aislamiento más estricto entre proyectos, la alternativa es registrar una aplicación separada para esta app con el permiso más angosto `Sites.Selected`, otorgado solo a este sitio — se documenta como opción, no como parte de esta configuración.

## 4. Configurar el proyecto

```bash
cp .env.example .env.local
```

Completa `.env.local` con el Client ID y Tenant ID del paso 2, y el hostname/ruta del sitio de SharePoint del paso 3.

## 5. Correr en local

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. El primer login abrirá el flujo de Microsoft; asegúrate de que tu propio correo ya esté dado de alta en la Lista `Usuarios` con un rol, o la app no podrá determinar qué mostrarte.

## 6. Desplegar en GitHub Pages

1. En el repositorio de GitHub: **Settings → Pages → Source: GitHub Actions**.
2. En **Settings → Secrets and variables → Actions → Variables**, crea las variables `VITE_AAD_CLIENT_ID`, `VITE_AAD_TENANT_ID`, `VITE_AAD_REDIRECT_URI` (la URL final de GitHub Pages, ej. `https://usuario.github.io/audigrasa-app/`), `VITE_SP_HOSTNAME`, `VITE_SP_SITE_PATH`, `VITE_SP_EVIDENCIAS_LIBRARY`. Ninguna de estas es secreta (son identificadores públicos de una SPA sin client secret), pero usar variables del repo evita hardcodearlas en el código.
3. Vuelve al registro de la app en Entra ID (paso 2) y agrega esa misma URL de GitHub Pages como Redirect URI adicional de la plataforma SPA.
4. Haz `push` a `main` — el flujo `.github/workflows/deploy.yml` construye y publica automáticamente.

## 7. Qué incluye este scaffold y qué sigue el mismo patrón

**Implementado de punta a punta:** login con MSAL.js contra Entra ID, cliente de Microsoft Graph con resolución/caché de siteId y listIds, capa offline completa (Dexie/IndexedDB + cola de sincronización con idempotencia por UUID + backoff), el formulario de auditoría de 4 pasos con las validaciones exactas solicitadas, captura de foto con compresión en el navegador, indicadores calculados en el cliente con gráfico de clasificación, y la pantalla de administración de `Plantas` como patrón de referencia completo (listar + crear).

**Sigue exactamente el mismo patrón, falta replicarlo:** las pantallas de administración de `Metodologias`, `Operarios` y `Usuarios` (copiar `src/features/catalogos/PlantasAdmin.tsx` y `crearPlanta` en `src/graph/lists.ts`, cambiando solo los nombres de columna); edición/anulación de una auditoría existente por un Administrador (la función `corregirAuditoria` en `src/graph/lists.ts` ya existe, falta la pantalla).

## 8. Limitaciones conocidas a monitorear

Las vistas de una Lista de SharePoint tienen un umbral de 5.000 elementos para consultas filtradas sin índice — ver la mitigación en la sección 3 de este README y en la sección 4.1 del documento de arquitectura. Microsoft Graph impone límites de *throttling* por aplicación/tenant; el envío de la cola offline ya está pensado para agruparse, pero si el volumen crece considerablemente conviene revisar el uso de `$batch` en `syncService.ts`. Como esta app comparte el registro de aplicación en Entra ID con pulmones (sección 2), ambas apps consumen la misma cuota de *throttling* de Graph frente a Microsoft — si en algún momento una de las dos crece mucho en volumen de uso, vale la pena revisar si conviene separar los registros. El bundle de producción actual pesa ~330KB comprimido (por MSAL + Dexie + Recharts); si se vuelve un problema de rendimiento en redes móviles muy lentas, se puede dividir con `import()` dinámico por ruta.
