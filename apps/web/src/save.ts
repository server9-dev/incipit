import { isTauri } from "./store/ai.js";

/**
 * Save a file to disk. In the desktop/mobile webview the browser
 * `<a download>` trick is a no-op, so we route through the native save
 * dialog + a Rust `write_file` command. In a real browser we fall back to
 * the anchor download.
 */
export async function savePlatform(filename: string, data: Blob | string, mime = "text/markdown"): Promise<void> {
  const blob = typeof data === "string" ? new Blob([data], { type: `${mime};charset=utf-8` }) : data;

  if (isTauri()) {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await save({ defaultPath: filename, filters: extFilter(filename) });
      if (!path) return; // user cancelled the dialog
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await invoke("write_file", { path, contents: Array.from(bytes) });
      return;
    } catch (e) {
      console.warn("Native save failed, falling back to browser download:", e);
      // fall through to the browser path
    }
  }

  downloadInBrowser(filename, blob);
}

function extFilter(filename: string): { name: string; extensions: string[] }[] | undefined {
  const ext = filename.includes(".") ? filename.split(".").pop()! : "";
  return ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined;
}

function downloadInBrowser(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none"; // must be in the DOM for the click to download in Edge/Firefox
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
