import { useEffect, useRef, useState } from "react";
import { getTranscriber } from "./whisperDictation.js";

/**
 * Live, on-device dictation that works inside the desktop WebView (unlike the
 * Web Speech API). It streams mic audio, detects phrase boundaries with a
 * simple energy VAD, and transcribes each phrase with Whisper (transformers.js)
 * as you pause — so text appears phrase-by-phrase. Audio never leaves the device.
 */
export function useLiveDictation(onText: (t: string) => void) {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const cb = useRef(onText);
  cb.current = onText;

  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef(false);
  const rateRef = useRef(16000);

  // segment / VAD state
  const seg = useRef<Float32Array[]>([]);
  const preroll = useRef<Float32Array | null>(null); // last quiet buffer, to avoid clipping onsets
  const speaking = useRef(false);
  const speechMs = useRef(0);
  const silenceMs = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    !!(window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);

  const SILENCE_HANG_MS = 650; // pause that ends a phrase
  const MIN_SPEECH_MS = 350; // ignore blips
  const MAX_SPEECH_MS = 13000; // force-flush long monologues
  const RMS_ON = 0.014; // speech onset
  const RMS_OFF = 0.009; // below this counts as silence

  function resampleTo16k(input: Float32Array, inRate: number): Float32Array {
    if (inRate === 16000) return input;
    const ratio = inRate / 16000;
    const outLen = Math.floor(input.length / ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const idx = i * ratio;
      const i0 = Math.floor(idx);
      const i1 = Math.min(i0 + 1, input.length - 1);
      const frac = idx - i0;
      out[i] = input[i0]! * (1 - frac) + input[i1]! * frac;
    }
    return out;
  }

  function reset() {
    seg.current = [];
    speaking.current = false;
    speechMs.current = 0;
    silenceMs.current = 0;
  }

  function flushSegment() {
    const enough = speechMs.current >= MIN_SPEECH_MS && seg.current.length > 0;
    const chunks = seg.current;
    reset();
    if (!enough) return;

    const total = chunks.reduce((n, a) => n + a.length, 0);
    const merged = new Float32Array(total);
    let off = 0;
    for (const a of chunks) {
      merged.set(a, off);
      off += a.length;
    }
    const pcm = resampleTo16k(merged, rateRef.current);

    queue.current = queue.current.then(async () => {
      setBusy(true);
      try {
        const t = await getTranscriber((pct) => setProgress(`Loading Whisper… ${pct}%`));
        setProgress("");
        const out = await t!(pcm);
        const text = (out?.text || "").trim();
        // Whisper tiny emits bracketed non-speech tokens / a lone "you" on near-silence
        if (text && !/^[[(].*[\])]$/.test(text) && text.toLowerCase() !== "you") cb.current(text);
      } catch {
        /* a failed chunk shouldn't end the session */
      } finally {
        if (activeRef.current) setBusy(false);
        else setBusy(false);
      }
    });
  }

  async function start() {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = s;
      const ctx = new AC({ sampleRate: 16000 }); // webview may ignore this; rateRef handles the truth
      ctxRef.current = ctx;
      rateRef.current = ctx.sampleRate;
      const source = ctx.createMediaStreamSource(s);
      sourceRef.current = source;
      const node = ctx.createScriptProcessor(4096, 1, 1);
      nodeRef.current = node;
      const bufMs = (4096 / ctx.sampleRate) * 1000;

      node.onaudioprocess = (e) => {
        if (!activeRef.current) return;
        const input = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < input.length; i++) sum += input[i]! * input[i]!;
        const rms = Math.sqrt(sum / input.length);
        const copy = new Float32Array(input); // the event buffer is reused — copy it

        if (rms >= RMS_ON) {
          if (!speaking.current) {
            speaking.current = true;
            if (preroll.current) seg.current.push(preroll.current);
          }
          seg.current.push(copy);
          speechMs.current += bufMs;
          silenceMs.current = 0;
        } else if (speaking.current) {
          seg.current.push(copy); // keep trailing audio through the pause
          if (rms < RMS_OFF) silenceMs.current += bufMs;
          else silenceMs.current = 0;
          if (silenceMs.current >= SILENCE_HANG_MS) flushSegment();
        } else {
          preroll.current = copy; // remember the last quiet buffer for the next onset
        }
        if (speaking.current && speechMs.current >= MAX_SPEECH_MS) flushSegment();
      };

      source.connect(node);
      node.connect(ctx.destination); // required to pump audio; node outputs silence (no echo)
      activeRef.current = true;
      setActive(true);
      setProgress("Loading Whisper…");
      void getTranscriber((pct) => setProgress(`Loading Whisper… ${pct}%`)).then(() => {
        if (activeRef.current) setProgress("");
      });
    } catch (e) {
      alert("Microphone unavailable or permission denied: " + e);
    }
  }

  function stop() {
    activeRef.current = false;
    setActive(false);
    flushSegment(); // transcribe whatever's pending
    try {
      nodeRef.current?.disconnect();
    } catch {
      /* noop */
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      /* noop */
    }
    try {
      void ctxRef.current?.close();
    } catch {
      /* noop */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    nodeRef.current = null;
    sourceRef.current = null;
    ctxRef.current = null;
    streamRef.current = null;
    preroll.current = null;
    setProgress("");
  }

  useEffect(
    () => () => {
      if (activeRef.current) stop();
    },
    [],
  );

  return { supported, active, busy, progress, toggle: () => (activeRef.current ? stop() : start()) };
}
