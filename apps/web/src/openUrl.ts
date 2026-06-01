import { isTauri } from "./store/ai.js";

/** Where "Donate" / "Consider donating" point. */
export const SPONSOR_URL = "https://github.com/sponsors/server9-dev";

/**
 * Open an external URL in the system browser. In the desktop WebView a plain
 * `window.open`/`<a target="_blank">` won't reach the real browser, so route
 * through Tauri's opener plugin; fall back to `window.open` on the web.
 */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    } catch (e) {
      console.warn("opener failed, falling back to window.open:", e);
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
