import { isTauri } from "./store/ai.js";

export type UpdateInfo = { version: string; currentVersion: string; downloadAndInstall: () => Promise<unknown> };

/** Returns an available desktop update, or null. No-op in the browser/PWA. */
export async function getAvailableUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri()) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const u = await check();
    return u?.available ? (u as unknown as UpdateInfo) : null;
  } catch (e) {
    console.warn("Update check failed:", e);
    return null;
  }
}

/** Install the update in place and relaunch. Local work is untouched. */
export async function installUpdate(u: UpdateInfo): Promise<void> {
  await u.downloadAndInstall();
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
