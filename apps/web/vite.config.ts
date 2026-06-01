import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Tauri sets TAURI_ENV_* when it runs this build. Inside the desktop webview the
// assets are already local and offline, so a service worker adds nothing but a
// caching layer that survives app updates (WebView2 keeps it in its own user-data
// dir) and serves stale chunks — the dictionary and other lazy imports then need
// a manual hard-refresh to load. For desktop builds we ship a self-destroying SW:
// it unregisters any previously-installed worker and clears its caches on next
// launch, then stays out of the way. The web PWA build keeps the real SW.
const isTauriBuild = Boolean(process.env.TAURI_ENV_PLATFORM);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      selfDestroying: isTauriBuild,
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
  ],
  server: {
    port: 5173,
  },
});
