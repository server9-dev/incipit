import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// The service worker only benefits the web PWA (offline + installability). Inside
// the Tauri desktop webview the assets are already local, and a worker just adds a
// cache that WebView2 keeps in its own profile across app updates — it serves the
// original shell forever, so the dictionary and other lazy chunks need a manual
// hard-refresh. Tauri sets TAURI_ENV_* when it runs this build; desktop builds ship
// no worker at all, and any worker left over from an older install is torn down
// natively on launch (see src-tauri/src/lib.rs).
const isTauriBuild = Boolean(process.env.TAURI_ENV_PLATFORM);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(isTauriBuild
      ? []
      : [
          VitePWA({
            registerType: "autoUpdate",
            injectRegister: "auto",
            manifest: {
              name: "Incipit",
              short_name: "Incipit",
              description: "Local-first fiction writing studio — novels, short stories, and verse.",
              theme_color: "#0a0a12",
              background_color: "#0a0a12",
              display: "standalone",
              start_url: "/",
              icons: [
                { src: "pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
                { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
                { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
                { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
              ],
            },
            workbox: {
              // app shell is the only large precache concern; raise the limit for the
              // WebLLM/transformers chunks so the SW doesn't refuse to precache them
              maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
              globPatterns: ["**/*.{js,css,html,svg,woff,woff2}"],
              navigateFallback: "index.html",
              runtimeCaching: [
                {
                  // cache model/runtime files fetched from CDNs so they work offline after first load
                  urlPattern: /^https:\/\/(huggingface\.co|cdn-lfs.*\.huggingface\.co|raw\.githubusercontent\.com|cdn\.jsdelivr\.net)\/.*/i,
                  handler: "CacheFirst",
                  options: {
                    cacheName: "model-cdn",
                    expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 90 },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
              ],
            },
          }),
        ]),
  ],
  server: {
    port: 5173,
  },
});
