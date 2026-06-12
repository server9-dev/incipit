import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "./store/ai.js";

/**
 * "Read aloud" — speak a piece of text using text-to-speech. In the desktop app
 * it routes through the native OS voice (a Tauri command), since the WebView's
 * Web Speech API silently fails there; in a real browser/PWA it uses the built-in
 * `speechSynthesis`. Toggling while speaking stops playback.
 */
export function useReadAloud() {
  const [reading, setReading] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supported =
    isTauri() || (typeof window !== "undefined" && "speechSynthesis" in window);

  const clearTimer = () => {
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  };

  const stop = useCallback(() => {
    clearTimer();
    setReading(false);
    if (isTauri()) {
      void import("@tauri-apps/api/core").then(({ invoke }) => invoke("stop_speak")).catch(() => {});
    } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const toggle = useCallback(
    async (text: string) => {
      if (reading) {
        stop();
        return;
      }
      const clean = (text || "").replace(/\s+/g, " ").trim();
      if (!clean) return;

      if (isTauri()) {
        setReading(true);
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("speak", { text: clean });
        } catch {
          setReading(false);
          return;
        }
        // The native voice gives no "finished" callback, so estimate how long it
        // will take (~165 wpm) and clear the Stop state when it should be done.
        const words = clean.split(" ").length;
        const ms = Math.max(2000, (words / 165) * 60000 + 700);
        clearTimer();
        resetTimer.current = setTimeout(() => setReading(false), ms);
      } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(clean);
        u.onend = () => setReading(false);
        u.onerror = () => setReading(false);
        window.speechSynthesis.cancel();
        setReading(true);
        window.speechSynthesis.speak(u);
      }
    },
    [reading, stop],
  );

  // stop speaking if the editor unmounts (e.g. switching scenes)
  useEffect(() => () => stop(), [stop]);

  return { reading, supported, toggle, stop };
}
