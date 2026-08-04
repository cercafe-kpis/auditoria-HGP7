# Arquitectura y Diseño — App de Auditoría de Medición de Grasa Dorsal
## v2 — Arquitectura de costo cero sobre SharePoint (reemplaza la propuesta AWS)

**Proyecto:** App auditoría medición grasa · **Cliente:** CercafeIA · **Fecha:** agosto de 2026
**Contexto de este cambio:** sin presupuesto de infraestructura disponible; se replica el patrón ya probado en la app de inspección de pulmones (frontend estático publicado en GitHub, datos en una Lista de SharePoint), autenticando con Microsoft Entra ID.

---

## 1. Resumen ejecutivo

Esta versión reemplaza por completo la capa de backend y nube de pago (FastAPI, PostgreSQL, AWS) de la propuesta original por una arquitectura que corre íntegramente sobre licencias de Microsoft 365 que la empresa ya tiene, más hosting gratuito en GitHub Pages. No hay servidor propio: la aplicación es un frontend estático que se autentica contra Microsoft Entra ID (Azure AD) y lee/escribe directamente en Listas de SharePoint a través de Microsoft Graph API. Todo lo demás del diseño original se mantiene intacto porque no dependía de la nube: los tres roles y sus permisos, el modelo de datos exacto del formulario de auditoría, la experiencia mobile-first, y — de forma deliberada — la estrategia offline-first, que sigue siendo tan necesaria como antes porque una Lista de SharePoint tampoco resuelve por sí sola la falta de señal en el piso de planta.

---

## 2. Arquitectura propuesta

### 2.1 Qué cambia y qué no, respecto a la propuesta original

**Se elimina por completo:** servidor FastAPI, base de datos PostgreSQL propia, contenedores Docker en producción, ECS/RDS/S3/CloudFront/AWS en su totalidad, y con ello cualquier costo de infraestructura recurrente.

**Se reemplaza por:** un frontend React + Vite + Tailwind (PWA) publicado como sitio estático en **GitHub Pages** (gratuito, con despliegue automático vía GitHub Actions), que se autentica con **Microsoft Entra ID** usando **MSAL.js** (la misma cuenta corporativa de Microsoft 365 de cada usuario) y que llama directamente a **Microsoft Graph API** para leer y escribir en **Listas de SharePoint** — estas listas hacen las veces de base de datos — y en una **Biblioteca de documentos de SharePoint** para la evidencia fotográfica.

**Se mantiene sin cambios:** los tres roles (Administrador, Auditor, Consulta) y su matriz de permisos, el modelo de datos completo del formulario (los mismos campos exactos de evaluación), el flujo de UX mobile-first de 4 pasos, todas las validaciones solicitadas, y la estrategia offline-first con IndexedDB — solo cambia el destino final de la sincronización (Microsoft Graph en vez de un API propio).

### 2.2 Por qué este patrón es sólido (no solo "el más barato")

Autenticar con Microsoft Entra ID no es únicamente la opción gratuita: es además la más segura de las dos rutas posibles, porque cada usuario inicia sesión con la cuenta que la empresa ya administra centralmente (altas, bajas, políticas de contraseña, MFA si está activado), sin que la aplicación tenga que guardar ni gestionar contraseñas propias. Esto elimina de raíz toda la sección de autenticación JWT/refresh-token/bcrypt del documento anterior — Microsoft ya resuelve ese problema.

El uso de **Microsoft Graph API** (en vez de la API REST clásica de SharePoint, `_api/web/...`) es intencional: Graph tiene mejor soporte de CORS para aplicaciones de una sola página como esta, es la superficie que Microsoft sigue evolucionando activamente, y permite en el mismo token de acceso trabajar tanto con Listas como con la Biblioteca de documentos.

**Decisión operativa (actualización):** en vez de registrar una aplicación nueva en Entra ID para esta app, se reutiliza el mismo registro que ya usa "Inspección Pulmonar" — mismo Client ID y Tenant ID, ya con consentimiento de administrador otorgado. Esto evita repetir un trámite administrativo por cada app nueva que la empresa construya con este patrón. La consecuencia técnica es que el permiso solicitado es **`Sites.ReadWrite.All`** (el que ya tiene consentido ese registro), en vez del más angosto `Sites.Selected` que se recomendaba inicialmente. `Sites.ReadWrite.All` da acceso a cualquier sitio de SharePoint al que la persona logueada pueda llegar — más amplio que "solo el sitio de esta app" — así que el límite real de "quién puede hacer qué" queda en manos de los permisos de cada sitio de SharePoint (sección 5), no de la aplicación. Es una decisión consciente de simplicidad operativa sobre mínimo privilegio estricto; si en el futuro se prefiere aislar los proyectos a nivel de identidad, la alternativa sigue siendo registrar una app separada con `Sites.Selected` solo para este sitio.

Importante: aunque se comparte la identidad en Entra ID, **el código de esta app vive en su propio repositorio, separado del de pulmones** — no hay ninguna relación entre ambos proyectos de software, solo entre sus credenciales de inicio de sesión.

### 2.3 Diagrama de arquitectura

Ver `arquitectura-sistema.mermaid` (adjunto). Resumen: los dispositivos en planta cargan el sitio estático desde GitHub Pages, inician sesión contra Microsoft Entra ID mediante MSAL.js (obteniendo un token delegado), y con ese token llaman directamente a Microsoft Graph API para leer/escribir en las Listas de SharePoint y en la Biblioteca de documentos de evidencia — sin ningún servidor intermedio propio.

---

## 3. Stack tecnológico v2

| Capa | Tecnología | Rol específico |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind CSS | SPA mobile-first (sin cambios respecto a v1) |
| PWA / Offline | `vite-plugin-pwa` (Workbox) + Dexie.js (IndexedDB) | Instalabilidad, cola local, sincronización diferida (sin cambios) |
| Formularios | React Hook Form + Zod | Validación estricta del formulario (sin cambios) |
| Fotos | `browser-image-compression` | Compresión antes de guardar/subir (sin cambios) |
| **Hosting** | **GitHub Pages** | Sitio estático, gratuito, con dominio `usuario.github.io/repo` o dominio propio si lo hay |
| **CI/CD** | **GitHub Actions** | Build de Vite y publicación automática a GitHub Pages en cada `push` a `main` |
| **Identidad** | **Microsoft Entra ID + MSAL.js (`@azure/msal-browser`, `@azure/msal-react`)** | Login corporativo, sin contraseñas propias |
| **Datos** | **Microsoft Graph API → Listas de SharePoint** | Sustituye a PostgreSQL/FastAPI por completo |
| **Evidencia fotográfica** | **Biblioteca de documentos de SharePoint (vía Graph)** | Sustituye a S3 |
| **Indicadores** | Componentes de gráficos en el propio React (Chart.js / Recharts) sobre datos de Graph, con opción a Power BI si la organización ya tiene licencia | Ver sección 9 |

---

## 4. Modelo de datos como Listas de SharePoint

Ver `modelo-datos.mermaid` (adjunto). Cada "entidad" del diseño original se implementa como una Lista (o Biblioteca) de SharePoint dentro de un mismo sitio dedicado a la app:

**Lista `Plantas`**: Título (nombre), Código, Ciudad, Activa (Sí/No).

**Lista `Metodologías`**: Título (nombre), Versión, Descripción, Activa.

**Lista `Operarios`**: Título (nombre), Documento, Planta (columna de búsqueda a `Plantas`), Cargo, Activo.

**Lista `Usuarios`** (gobierna los roles de la app): Correo (debe coincidir exactamente con la cuenta de Microsoft 365 / UPN de la persona), Nombre, Rol (columna de opción: Administrador/Auditor/Consulta), Plantas Asignadas (búsqueda de valores múltiples a `Plantas`), Activo. Nota importante: "crear un auditor" en esta arquitectura no significa crear una cuenta de inicio de sesión nueva — las cuentas de Microsoft 365 las gestiona el área de TI de la empresa como ya lo hace hoy. "Crear un auditor" pasa a significar: dar de alta en esta lista el correo de una persona que **ya tiene** cuenta corporativa, asignarle el rol `Auditor` y las plantas donde puede auditar. Esta distinción es clave y conviene validarla con el equipo de TI antes de construir.

**Lista `Auditorías`** (el registro central): Título = `IdCliente` (el UUID generado en el dispositivo al momento de crear la auditoría — es lo que hace segura la sincronización offline, igual que en la v1), FechaAuditoria, Planta (búsqueda), Metodología (búsqueda), Auditor (columna de tipo Persona o Grupo, para que quede ligado directamente a la identidad de Entra ID de quien auditó), Operario (búsqueda), NúmeroTiquete (texto, validado como obligatorio), InclinaciónHerramienta (Sí/No), TieneMarca (Sí/No), MarcaIntercostalCorrecta (Sí/No), Clasificación (columna de opción: Bueno/Regular/Malo/Insuficiente), CanalGrasosa (Sí/No), EstadoSync (Pendiente/Sincronizada — útil para diagnóstico, aunque el estado "real" vive en el dispositivo mientras no se sincroniza), CapturadaEn (fecha/hora del dispositivo), RecibidaEn (fecha/hora en que SharePoint recibió el ítem).

**Biblioteca de documentos `Evidencias`**: cada fotografía se sube aquí como archivo, con una columna `AuditoríaId` (relacionando por el mismo `IdCliente`) y `Orden`, en vez de usar la función nativa de "adjuntos" de una Lista — esto da mejor control de metadatos, miniaturas automáticas y versión que el adjunto clásico.

**Lista `Bitácora` (`AuditoriaLog`)**: AuditoríaId, Usuario (Persona), Acción, Detalle (texto largo con el cambio en JSON), CreadoEn. Se sigue recomendando con la misma fuerza que en la v1: cualquier corrección de un administrador sobre una auditoría ya registrada debe quedar trazada.

### 4.1 Un límite técnico real que hay que planear desde ya

Las vistas de una Lista de SharePoint tienen un **umbral de 5.000 elementos** para consultas filtradas sin índice. Con auditorías diarias en varias plantas, ese umbral se puede alcanzar en menos de un año. La mitigación es sencilla pero hay que hacerla desde el diseño inicial, no después: indexar las columnas por las que se filtra más (Planta, FechaAuditoria, Auditor, Operario) desde la configuración de la lista, y definir una política de archivado (por ejemplo, mover a una lista `Auditorías_Historico` los registros de más de 18-24 meses, o exportarlos periódicamente). Si el volumen creciera mucho más de lo esperado, el siguiente escalón dentro del mismo ecosistema Microsoft sería Dataverse — pero eso ya tiene costo, por lo que se deja únicamente como nota para el futuro, no como parte de esta propuesta.

---

## 5. Roles y permisos (sin cambios en el "qué", cambia el "cómo se hace cumplir")

La matriz de permisos es la misma que en la v1 (Administrador administra catálogos/usuarios y ve todo; Auditor registra y ve lo propio; Consulta solo visualiza). Lo que cambia es el mecanismo de aplicación: en vez de un middleware de autorización en un backend propio, el cumplimiento real ocurre en los **permisos nativos de SharePoint** sobre cada Lista:

- El grupo de SharePoint "Auditores" tiene permiso de **Colaborar** (agregar y ver, no editar ni eliminar) sobre la Lista `Auditorías` y la Biblioteca `Evidencias`, y solo **Lectura** sobre `Plantas`, `Operarios`, `Metodologías`.
- El grupo "Administradores" tiene **Control total** sobre todas las listas.
- El grupo "Consulta" tiene **solo Lectura** sobre `Auditorías` y no tiene acceso de escritura a ninguna lista.

Esto es una ventaja real frente al backend propio: la autorización la aplica SharePoint del lado del servidor sin que la app tenga que reimplementarla — el frontend solo oculta opciones de UI según el rol leído de la Lista `Usuarios`, exactamente como antes, pero la app **no puede** saltarse el permiso real aunque alguien manipule el código del cliente, porque Microsoft Graph rechazará la operación si el usuario autenticado no tiene el permiso de SharePoint correspondiente.

---

## 6. Acceso a datos (reemplaza el capítulo de API REST)

No existe una API propia: el frontend llama directamente a Microsoft Graph. Los endpoints relevantes (todos autenticados con el token delegado de MSAL) son:

| Operación | Endpoint de Graph (resumen) | Notas |
|---|---|---|
| Login | MSAL.js `loginPopup`/`loginRedirect` contra Entra ID | Sin backend involucrado |
| Leer catálogo (plantas, metodologías, operarios) | `GET /sites/{site-id}/lists/{list-id}/items?expand=fields` | Se cachea en IndexedDB para uso offline |
| Leer rol del usuario actual | `GET /sites/{site-id}/lists/Usuarios/items?filter=fields/Correo eq '{correo}'` | Se ejecuta una vez al iniciar sesión |
| Crear auditoría | `POST /sites/{site-id}/lists/Auditorias/items` | Idempotente por `IdCliente` (ver sección 8) |
| Sincronizar varias auditorías pendientes | `POST /$batch` (hasta 20 operaciones por lote) | Reduce llamadas y mitiga *throttling* de Graph |
| Subir evidencia fotográfica | `PUT /sites/{site-id}/drive/root:/Evidencias/{archivo}:/content` (o sesión de carga para archivos grandes) | Se sube antes de crear el ítem de auditoría |
| Consultar auditorías (reportes) | `GET /sites/{site-id}/lists/Auditorias/items?expand=fields&filter=...` | Filtros por planta/auditor/operario/fecha; paginación con `$top`/`@odata.nextLink` |
| Corregir una auditoría | `PATCH /sites/{site-id}/lists/Auditorias/items/{id}` (solo rol Administrador) | Debe generar también un ítem en `AuditoriaLog` |

Como Graph API impone límites de *throttling* por aplicación/tenant, el envío de la cola offline siempre debe agruparse en lotes (`$batch`) en vez de disparar una llamada por cada auditoría pendiente — esto es más relevante aquí que en la v1, porque no hay un backend propio que amortigüe picos de tráfico.

---

## 7. Formulario de auditoría y UX mobile-first

**Esta sección no cambia respecto a la propuesta original** — el asistente de 4 pasos (información general, evaluación, evidencia fotográfica, revisión y envío), los controles grandes tipo interruptor/segmentado, la compresión de fotos en el navegador, y las cuatro validaciones exactas solicitadas (todos los campos obligatorios, no guardar sin foto, tiquete no vacío, fecha automática editable solo por el rol Administrador) se mantienen íntegras. Lo único que cambia es que, en el Paso 1, el nombre del auditor y las plantas disponibles en el selector ahora se derivan de la Lista `Usuarios` de SharePoint en vez de una tabla `usuario_planta` en PostgreSQL — la experiencia del usuario final es idéntica.

---

## 8. Estrategia offline-first y sincronización

Ver `secuencia-offline.mermaid` (adjunto). El diseño conceptual es el mismo de la v1 — se guarda de inmediato en IndexedDB (Dexie.js) con un UUID generado en el dispositivo, se muestra "guardada localmente, pendiente de sincronizar", y un *service worker* procesa la cola al recuperar conexión — con dos ajustes importantes propios de este stack:

**Los tokens de MSAL también dependen de la red.** Un usuario puede seguir *capturando* auditorías sin conexión aunque su token de acceso haya expirado, porque la captura solo escribe en IndexedDB local y no requiere llamar a Graph. La renovación de token (silenciosa, vía MSAL) solo se necesita en el momento de sincronizar, cuando ya hay conexión disponible — por eso el flujo de sincronización primero intenta obtener un token silencioso y, si el usuario quedó desconectado por más tiempo del que dura su sesión, le pide un nuevo login antes de continuar con la cola pendiente (sin perder ningún dato ya guardado localmente).

**La idempotencia sigue siendo por `IdCliente` (UUID), pero ahora se verifica contra SharePoint.** Antes de crear un ítem en la Lista `Auditorías`, el flujo de sincronización primero busca si ya existe un ítem con ese `IdCliente` (por ejemplo, de un intento previo que sí llegó al servidor pero cuya confirmación no llegó de vuelta al dispositivo por un corte de red). Si ya existe, se descarta el duplicado y simplemente se marca como sincronizado localmente.

---

## 9. Indicadores de desempeño

El cálculo conceptual de los indicadores (por planta, por auditor, por operario — ver v1 sección 9.1) no cambia. Lo que cambia es dónde se calculan: al no existir un motor de base de datos con `GROUP BY` del lado del servidor, hay dos caminos, y se recomienda evaluarlos según lo que la organización ya tenga contratado:

**Camino recomendado por defecto (costo cero):** los indicadores se calculan **en el propio frontend**, trayendo los ítems de la Lista `Auditorías` filtrados por rango de fecha/planta desde Graph API y agregándolos en JavaScript (conteos, porcentajes, tendencias) con una librería ligera de gráficos (Chart.js o Recharts). Para el volumen esperado (auditorías diarias, no eventos de alta frecuencia), esto es perfectamente viable y no requiere ninguna licencia adicional.

**Camino alternativo, solo si ya existe licencia de Power BI en la organización:** conectar Power BI directamente a las Listas de SharePoint como fuente de datos y construir ahí los tableros, incrustándolos en una página de SharePoint o en la misma app. Se documenta como alternativa, no como recomendación por defecto, precisamente porque el punto de partida de este cambio de arquitectura es "no tenemos presupuesto" — no se debe asumir una licencia de Power BI Pro que quizás no exista.

---

## 10. Seguridad

Se elimina toda la sección de JWT propio, hashing de contraseñas y *rate limiting* de login de la v1 — Microsoft Entra ID ya resuelve esto de forma más robusta de lo que esta app podría construir por su cuenta (incluyendo MFA, si la organización lo tiene activado a nivel de tenant). Los puntos de seguridad propios de esta arquitectura son: permiso de aplicación `Sites.ReadWrite.All` (reutilizado del registro compartido con pulmones — ver 2.2; la alternativa de mínimo privilegio sigue siendo `Sites.Selected` si se separan los registros más adelante) más enforcement real de quién puede escribir/editar/leer a través de los grupos de permisos de SharePoint (sección 5), no solo por ocultar botones en la interfaz; la Biblioteca de documentos de evidencia no se hace pública — solo es accesible con un token válido y permiso sobre el sitio; y toda corrección administrativa sobre una auditoría existente queda registrada en la Lista `AuditoriaLog` con usuario, fecha y valores anterior/nuevo.

Una dependencia que vale la pena confirmar con TI antes de construir: que todos los auditores, administradores y consultas tengan cuenta activa de Microsoft 365 en el tenant de la empresa — es el único requisito de identidad de toda esta arquitectura.

---

## 11. Infraestructura y despliegue (reemplaza el capítulo de AWS)

**No hay entorno de servidores que administrar.** El flujo completo de despliegue es: se hace `push` a la rama `main` del repositorio en GitHub → un flujo de **GitHub Actions** ejecuta `npm run build` (Vite) → el resultado estático se publica automáticamente en **GitHub Pages**. No hay Docker en producción (puede seguir usándose localmente en desarrollo si se quiere, pero no es necesario ni siquiera para eso, dado que Vite corre nativo con Node).

Configuración puntual a tener en cuenta: el registro de aplicación SPA en Entra ID debe tener como *redirect URI* la URL exacta de GitHub Pages (`https://<usuario-u-org>.github.io/<repo>/`), y el enrutamiento del lado del cliente en React debe usar `HashRouter` (o configurar un `404.html` de respaldo) porque GitHub Pages no soporta de forma nativa el enrutamiento "history" de una SPA en subrutas.

### 11.1 Entorno local de desarrollo

`npm run dev` (Vite) es suficiente para desarrollo diario. Para probar contra datos reales sin afectar producción, se recomienda un sitio de SharePoint y un registro de aplicación en Entra ID separados para "desarrollo/pruebas", replicando la misma estructura de listas.

### 11.2 Estructura de carpetas propuesta

```
audigrasa/
├── src/
│   ├── features/       # auditorias, catalogos, indicadores, auth
│   ├── graph/           # cliente de Microsoft Graph, MSAL config
│   ├── offline/         # Dexie schemas, cola de sincronización
│   └── components/
├── .github/
│   └── workflows/
│       └── deploy.yml   # build + publicación a GitHub Pages
├── public/
│   └── manifest.json     # PWA
├── vite.config.ts
└── docs/                 # este documento y diagramas
```

---

## 12. Hoja de ruta sugerida (actualizada)

**Fase 0 — Base de identidad y datos:** agregar la Redirect URI de esta app al registro de aplicación ya existente en Entra ID (compartido con pulmones — ver 2.2), crear el sitio de SharePoint con las Listas/Biblioteca descritas en la sección 4, y los grupos de permisos por rol (sección 5). Confirmar con TI que todo el personal relevante tiene cuenta de Microsoft 365.

**Fase 1 — Registro en línea:** login con MSAL.js, CRUD de catálogos vía Graph, formulario de auditoría completo con validaciones y subida de evidencia, funcionando con conexión.

**Fase 2 — Offline-first:** PWA instalable, cola local en IndexedDB, sincronización por lotes con idempotencia contra Graph — de nuevo, esta fase no es opcional dado el requisito de operar con wifi inestable en planta.

**Fase 3 — Indicadores:** paneles de desempeño calculados en el frontend a partir de los datos de SharePoint.

**Fase 4 — Endurecimiento:** revisión de permisos de SharePoint, plan de indexado/archivado de la Lista `Auditorías` (sección 4.1), pruebas con volumen real antes de escalar a todas las plantas.

---

## 13. Riesgos y decisiones abiertas propias de este enfoque

Conviene dejar explícitas, antes de construir, tres cosas que dependen de decisiones fuera del control de este documento: primero, que todo el personal que va a usar la app (incluyendo auditores en planta) efectivamente tenga cuenta de Microsoft 365 activa — si no la tienen, este enfoque completo no aplica y habría que reconsiderar; segundo, que alguien con acceso al registro de aplicación compartido con pulmones pueda agregar la Redirect URI de esta app — es un paso único pero requiere ese acceso puntual (ya no hace falta un nuevo consentimiento de administrador, al reutilizar el registro existente); y tercero, que el volumen real de auditorías se monitoree desde el principio frente al umbral de 5.000 elementos de las Listas (sección 4.1), para activar la política de archivado a tiempo y no como reacción a un problema ya manifestado. Vale la pena añadir un cuarto punto propio de compartir la identidad de Entra ID entre dos apps: si alguna de las dos crece mucho en volumen, conviene revisar si separar los registros de aplicación evita que una le "coma" cuota de *throttling* de Graph a la otra (ver README del scaffold, sección 8).

---

## 14. Cobertura de requisitos

Todos los roles, acciones, campos exactos del formulario de evaluación, captura/carga de evidencia fotográfica, y las cuatro validaciones solicitadas siguen cubiertos íntegramente — el cambio de esta versión es exclusivamente de infraestructura y costo, no de alcance funcional. Ver secciones 5, 7 y 10.
