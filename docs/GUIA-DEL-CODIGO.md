# Guía del código — explicación archivo por archivo

Esta guía explica para qué sirve cada archivo del proyecto, pensada para alguien que ve el código por primera vez. Antes de entrar en detalle, una idea central que hace más fácil entender todo lo demás:

**Este proyecto no tiene servidor propio.** Es un montón de archivos que, al pasar por una herramienta llamada Vite, se convierten en HTML/CSS/JavaScript normal que corre completo dentro del navegador del usuario (celular, tablet o computador). No hay una máquina en algún centro de datos ejecutando este código — cuando alguien abre la app, su propio navegador descarga estos archivos ya convertidos y los ejecuta ahí. El "backend" que normalmente tendría una app como esta lo reemplazan servicios que Microsoft ya opera: Microsoft Entra ID para el inicio de sesión, y Microsoft Graph API para leer/escribir en las Listas de SharePoint.

Con eso en mente, vamos carpeta por carpeta.

---

## 1. Archivos en la raíz del proyecto

Estos no son "la app" en sí — son configuración de las herramientas que construyen y ejecutan la app.

**`package.json`** — la lista de ingredientes del proyecto. Dice qué librerías necesita (React, Tailwind, MSAL, etc.) y define los comandos que puedes ejecutar, como `npm run dev` (correr en tu computador para probar) o `npm run build` (generar la versión final lista para publicar).

**`package-lock.json`** — un archivo generado automáticamente que fija las versiones exactas de cada librería instalada, para que el proyecto se comporte igual en cualquier computador. Nunca se edita a mano.

**`vite.config.ts`** — la configuración de Vite, la herramienta que arma el proyecto. Aquí es donde se activa el "modo PWA" (para que la app se pueda instalar en el celular y funcione sin conexión) y el plugin de Tailwind CSS.

**`tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`** — configuración de TypeScript, que es JavaScript con "tipos" (le dices a cada dato qué forma tiene, y el editor te avisa si lo usas mal, antes incluso de correr el código). Hay tres archivos porque el código de la app y el código de configuración de herramientas tienen reglas ligeramente distintas; no necesitas tocarlos.

**`.env.example`** — una plantilla que muestra qué valores de configuración necesita la app (el Client ID de Entra ID, el nombre del sitio de SharePoint, etc.) sin poner los valores reales. Se copia como `.env.local` y ahí sí se llenan los datos reales — ese archivo `.env.local` nunca se sube a GitHub (ver `.gitignore`).

**`.gitignore`** — la lista de carpetas/archivos que Git (el sistema de control de versiones) debe ignorar al subir el proyecto a GitHub. Lo más importante que ignora: `node_modules` (las librerías instaladas — pesan mucho y se pueden volver a descargar con `npm install`) y cualquier archivo `.local` (tus configuraciones reales, que no deben quedar públicas en el repositorio).

**`.oxlintrc.json`** — configuración de un "linter" (una herramienta que revisa el código buscando errores comunes o malas prácticas de estilo). Vino incluido por defecto al crear el proyecto con Vite.

**`index.html`** — la única página HTML real de todo el proyecto. React toma el control de una sola línea de esta página (`<div id="root">`) y desde ahí construye y reemplaza todo lo que ves en pantalla.

**`README.md`** — las instrucciones para una persona: cómo configurar las cuentas de Microsoft, crear las Listas de SharePoint, correr el proyecto y publicarlo.

**`.github/workflows/deploy.yml`** — una receta que GitHub ejecuta automáticamente cada vez que subes cambios a la rama `main`: construye el proyecto (`npm run build`) y publica el resultado en GitHub Pages, sin que tengas que hacerlo manualmente.

---

## 2. Carpeta `public/`

Archivos que se copian tal cual (sin procesar) al resultado final.

**`favicon.svg`, `icons.svg`** — el ícono pequeño que aparece en la pestaña del navegador. Vinieron con la plantilla de Vite.

**`pwa-192x192.png`, `pwa-512x512.png`** — el ícono de la app en dos tamaños, usado cuando alguien la "instala" en la pantalla de inicio de su celular (por ahora son un ícono de relleno con las iniciales "AG" — se pueden reemplazar por un logo real).

---

## 3. Carpeta `docs/`

Documentación de referencia, no código: el documento de arquitectura completo, los diagramas, y esta misma guía. No afecta el funcionamiento de la app.

---

## 4. La puerta de entrada: `src/main.tsx`, `src/App.tsx`, `src/index.css`

**`src/main.tsx`** — el primerísimo archivo que se ejecuta. Su único trabajo es decirle a React: "toma el componente `App` y dibújalo dentro de ese `<div id='root'>` de `index.html`".

**`src/App.tsx`** — la raíz de toda la aplicación. Envuelve todo en dos capas: primero el sistema de inicio de sesión (`AuthProvider`) y luego el sistema de navegación entre pantallas (`AppRouter`). Piensa en esto como las "capas de una cebolla": todo lo demás vive adentro de estas dos envolturas.

**`src/index.css`** — los estilos globales. La primera línea (`@import "tailwindcss"`) activa Tailwind, una forma de darle estilo a las cosas escribiendo clases cortas directamente en el HTML (como `class="h-14 rounded-xl bg-blue-600"`) en vez de escribir hojas de estilo CSS separadas.

**`src/vite-env.d.ts`** — un archivo pequeño y puramente técnico que le dice a TypeScript "estas variables de entorno existen y son texto", para que no se queje cuando el código las use.

---

## 5. `src/config/appConfig.ts` — el panel de control

Un solo archivo donde vive toda la configuración "de negocio" de la app: nombres exactos de las Listas de SharePoint, cuántas auditorías pendientes se permiten antes de avisar, los tiempos de espera para reintentar sincronizar. Casi ningún otro archivo del proyecto tiene valores de configuración sueltos — todos leen de aquí, y este archivo a su vez lee del `.env.local`. Si algún día cambias el nombre de una Lista en SharePoint, este es el único lugar que hay que tocar.

---

## 6. `src/types/entities.ts` — el diccionario de datos

Este archivo no ejecuta ninguna acción; solo describe la "forma" que tiene cada tipo de dato en la app: una `Planta` siempre tiene `nombre`, `codigo`, `ciudad`; una `AuditoriaLocal` siempre tiene sus campos de evaluación, etc. Gracias a esto, si en algún otro archivo intentas usar un dato de forma incorrecta (por ejemplo, olvidar el número de tiquete), TypeScript te avisa mientras escribes el código, no cuando ya está corriendo en el celular de un auditor.

---

## 7. Carpeta `src/auth/` — todo lo relacionado con iniciar sesión

**`msalConfig.ts`** — la configuración de la librería que habla con Microsoft (MSAL): qué aplicación es (Client ID), de qué organización (Tenant ID), y a dónde debe volver después de iniciar sesión (Redirect URI).

**`AuthProvider.tsx`** — envuelve toda la app para que cualquier pantalla pueda saber "¿hay alguien con sesión iniciada, y quién es?".

**`useAuthToken.ts`** — una función reutilizable que cualquier parte de la app llama cuando necesita hablar con Microsoft Graph. Primero intenta renovar la sesión en silencio (sin molestar al usuario); solo si de verdad hace falta, pide iniciar sesión de nuevo. Esto es clave para el modo offline: nunca interrumpe al auditor mientras está registrando una auditoría, solo al momento de sincronizar.

---

## 8. Carpeta `src/graph/` — cómo se habla con SharePoint

Esta carpeta reemplaza lo que en una app tradicional sería "el backend".

**`graphClient.ts`** — un ayudante genérico para hacer peticiones a Microsoft Graph, más dos funciones importantes que hacen "detective work" la primera vez que la app corre: averiguar el ID interno del sitio de SharePoint y el ID interno de cada Lista, a partir de sus nombres. Esos IDs se guardan en caché (`localStorage`) para no tener que pedirlos cada vez.

**`lists.ts`** — el corazón de la lógica de datos: una función por cada acción real de la app ("traer todas las plantas", "crear una auditoría", "subir una foto de evidencia"). Es literalmente donde vive la lógica que en la propuesta original habría estado en un servidor FastAPI — aquí simplemente corre en el navegador en vez de en un servidor.

---

## 9. Carpeta `src/offline/` — la magia de funcionar sin conexión

**`db.ts`** — define una mini base de datos que vive dentro del propio navegador (se llama IndexedDB; usamos una librería llamada Dexie que la hace más fácil de manejar). Aquí se guardan las auditorías capturadas mientras no hay señal, y una copia de los catálogos (plantas, metodologías, operarios) para que los menús desplegables del formulario funcionen sin internet.

**`useOnlineStatus.ts`** — un sensor simple: le pregunta al navegador "¿hay conexión a internet ahora mismo?" y avisa cuando cambia.

**`syncService.ts`** — el proceso que, cuando hay conexión, toma cada auditoría guardada localmente, sube su(s) foto(s) y luego crea el registro en SharePoint. Si algo falla, lo deja marcado para reintentar más tarde en vez de perderlo.

**`useSyncQueue.ts`** — conecta todo lo anterior con la interfaz: cuenta cuántas auditorías están pendientes, dispara la sincronización automáticamente al recuperar señal, y expone el botón de "sincronizar ahora".

---

## 10. Carpeta `src/features/` — una carpeta por pantalla/funcionalidad

Es una forma común de organizar un proyecto: en vez de agrupar por tipo técnico, se agrupa por lo que el usuario hace.

**`auth/LoginPage.tsx`** — la pantalla con el botón "Iniciar sesión con Microsoft".

**`auth/useCurrentUser.ts`** — averigua, para la persona ya logueada, cuál es su rol (Administrador/Auditor/Consulta) buscándolo en la Lista `Usuarios` de SharePoint — y lo guarda en caché para que la app siga sabiendo "quién eres" incluso sin conexión.

**`auditoria/schema.ts`** — las reglas de validación del formulario (usando una librería llamada Zod): qué campos son obligatorios, que el tiquete no puede quedar vacío, que debe haber al menos una foto.

**`auditoria/AuditoriaWizard.tsx`** — el formulario real de 4 pasos (información general → evaluación → evidencia → revisión). Es el archivo más largo del proyecto porque concentra toda la pantalla que más se usa en el día a día.

**`auditoria/MisAuditoriasPage.tsx`** — la primera pantalla que ve un auditor: un botón para empezar una auditoría nueva, y la lista de las que capturó en ese dispositivo (incluidas las que aún no se han sincronizado).

**`catalogos/useCatalogosOffline.ts`** — mantiene actualizada la copia local de plantas/metodologías/operarios, refrescándola cada vez que hay conexión.

**`catalogos/PlantasAdmin.tsx`** — la pantalla donde un Administrador ve y agrega Plantas. Se construyó como "plantilla" — las pantallas equivalentes para Metodologías, Operarios y Usuarios se arman copiando esta misma estructura.

**`indicadores/IndicadoresPage.tsx`** — el panel de indicadores: trae las auditorías de un rango de fechas/planta y calcula ahí mismo (en el navegador) los conteos y porcentajes, mostrándolos en tarjetas y un gráfico de barras.

---

## 11. Carpeta `src/components/` — piezas visuales reutilizables

Estas no son pantallas completas, son piezas más pequeñas que varias pantallas usan.

**`SegmentedYesNo.tsx`** — los dos botones grandes de Sí/No que se usan en varios campos del formulario de evaluación.

**`ClassificationPicker.tsx`** — los cuatro botones grandes de clasificación (Bueno/Regular/Malo/Insuficiente), cada uno con su color.

**`CameraCapture.tsx`** — el control para tomar foto con la cámara o elegir de la galería, y comprimirla automáticamente antes de guardarla.

**`PendingSyncBadge.tsx`** — el aviso flotante que aparece en la parte inferior de la pantalla mostrando "X pendientes por sincronizar" y el botón de reintentar.

**`RoleGuard.tsx`** — un "portero": envuelve una pantalla y solo la muestra si el rol de quien inició sesión está en la lista de roles permitidos; si no, lo redirige de vuelta.

---

## 12. `src/router/AppRouter.tsx` — el mapa de navegación

Decide qué pantalla se muestra según la dirección (URL) y el rol de quien inició sesión — por ejemplo, que solo un Administrador pueda llegar a la pantalla de Plantas. Usa un tipo de navegación llamado "HashRouter" (las direcciones se ven como `algo.com/#/indicadores`) en vez del más común, porque GitHub Pages no sabe manejar bien las rutas "normales" de una aplicación de una sola página.

---

## 13. Carpeta `src/assets/`

**`react.svg`, `vite.svg`, `hero.png`** — imágenes decorativas que trajo la plantilla original de Vite para su pantalla de bienvenida. Ya no se usan en ninguna parte del código actual — se pueden borrar sin ningún efecto.
