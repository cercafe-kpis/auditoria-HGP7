import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  // IMPORTANTE: si se publica en GitHub Pages como
  // https://usuario.github.io/audigrasa-app/, este "base" debe ser
  // '/audigrasa-app/'. Si se publica en la raíz de un dominio propio,
  // debe ser '/'. Ver README.md sección "Despliegue en GitHub Pages".
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Auditoría HGP7',
        short_name: 'Auditoría HGP7',
        description: 'Auditoría de medición de grasa dorsal en canales de cerdo',
        theme_color: '#2563eb',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Precachea el app shell completo para que el formulario cargue
        // sin conexión (ver arquitectura, sección 8.1).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        runtimeCaching: [
          {
            // Los catálogos y la lectura de auditorías vía Graph se
            // sirven de red-primero-con-fallback-a-caché; la
            // escritura (creación/subida) SIEMPRE pasa por la cola de
            // IndexedDB (ver src/offline), nunca directo por Workbox.
            urlPattern: /^https:\/\/graph\.microsoft\.com\/v1\.0\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'graph-api-cache',
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
