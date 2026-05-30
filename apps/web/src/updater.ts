import { isTauri } from "./store/ai.js";

/**
 * In the desktop app, check GitHub Releases for a newer signed build and offer
 * to install it in place. Your manuscript lives in local storage, so updating
 * never touches your work. No-op in the browser/PWA (which auto-updates anyway).
 */
export async function checkForUpdate(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update?.available) return;
    const ok = window.confirm(
      `Incipit ${update.version} is available (you have ${update.currentVersion}).\n\nUpdate now? Your projects stay exactly where they are.`,
    );
    if (!ok) return;
    await update.downloadAndInstall();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    console.warn("Update check failed:", e);
  }
}
