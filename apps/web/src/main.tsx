import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/400-italic.css";
import "@fontsource/eb-garamond/500.css";
import "@fontsource/eb-garamond/600.css";
import "./index.css";

// The app shell is precached by a service worker (vite-plugin-pwa, autoUpdate).
// When a new build's SW takes control, reload once so the freshly-bundled UI
// actually replaces the old shell — otherwise the previous version lingers until
// a manual hard-refresh, which the desktop webview offers no button for. Guard on
// an existing controller so the first-ever install never triggers a reload.
if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
