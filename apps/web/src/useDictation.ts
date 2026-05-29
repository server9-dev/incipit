import { useEffect, useRef, useState } from "react";

/* Minimal typing for the Web Speech API (not in lib.dom by default). */
type SREvent = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
type SR = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type SRCtor = new () => SR;

function getCtor(): SRCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: SRCtor }).webkitSpeechRecognition;
}

/**
 * Live dictation via the browser's Web Speech API. Finalized phrases are sent
 * to `onFinal`; interim text is exposed for a live indicator. Note: most
 * browsers process speech via a cloud service, unlike the rest of the app.
 */
export function useDictation(onFinal: (text: string) => void) {
  const [active, setActive] = useState(false);
  const [interim, setInterim] = useState("");
  const rec = useRef<SR | null>(null);
  const activeRef = useRef(false);
  const cb = useRef(onFinal);
  cb.current = onFinal;

  const supported = !!getCtor();

  function start() {
    const Ctor = getCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";
    r.onresult = (e) => {
      let fin = "";
      let inter = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) fin += res[0]!.transcript;
        else inter += res[0]!.transcript;
      }
      if (fin) cb.current(fin);
      setInterim(inter);
    };
    r.onend = () => {
      if (activeRef.current) {
        try {
          r.start(); // Chrome stops on silence — keep going
        } catch {
          /* already started */
        }
      } else {
        setInterim("");
      }
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        activeRef.current = false;
        setActive(false);
        setInterim("");
        alert("Microphone permission was denied.");
      }
    };
    rec.current = r;
    activeRef.current = true;
    setActive(true);
    try {
      r.start();
    } catch {
      /* noop */
    }
  }

  function stop() {
    activeRef.current = false;
    setActive(false);
    setInterim("");
    try {
      rec.current?.stop();
    } catch {
      /* noop */
    }
  }

  useEffect(() => () => {
    activeRef.current = false;
    try {
      rec.current?.stop();
    } catch {
      /* noop */
    }
  }, []);

  return { supported, active, interim, toggle: () => (active ? stop() : start()) };
}
