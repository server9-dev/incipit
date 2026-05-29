import { useEffect, useRef, useState } from "react";

const MODEL = "onnx-community/whisper-tiny.en";

// transformers.js pipeline is heavy + lazy; cache one instance across uses.
let transcriber: ((audio: Float32Array) => Promise<{ text?: string }>) | null = null;
let loading: Promise<typeof transcriber> | null = null;

async function getTranscriber(onProgress?: (pct: number) => void) {
  if (transcriber) return transcriber;
  if (loading) return loading;
  loading = (async () => {
    const { pipeline } = await import("@huggingface/transformers");
    const make = (device: "webgpu" | "wasm") =>
      pipeline("automatic-speech-recognition", MODEL, {
        device,
        progress_callback: (e: { status?: string; progress?: number }) => {
          if (e.status === "progress" && typeof e.progress === "number") onProgress?.(Math.min(100, Math.round(e.progress)));
        },
      });
    const webgpu = typeof navigator !== "undefined" && "gpu" in navigator;
    try {
      transcriber = (await make(webgpu ? "webgpu" : "wasm")) as unknown as typeof transcriber;
    } catch {
      transcriber = (await make("wasm")) as unknown as typeof transcriber; // fall back if WebGPU init fails
    }
    return transcriber;
  })();
  return loading;
}

/** Decode a recorded audio blob to mono 16 kHz PCM (what Whisper expects). */
async function blobToPcm16k(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer();
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const decoded = await ctx.decodeAudioData(buf);
  void ctx.close();
  const frames = Math.max(1, Math.ceil(decoded.duration * 16000));
  const off = new OfflineAudioContext(1, frames, 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0).slice();
}

/**
 * Private, on-device dictation: record audio, then transcribe locally with
 * Whisper (transformers.js, WebGPU/WASM). Audio never leaves the device.
 * Not live — you record a passage and it transcribes on stop.
 */
export function useWhisperDictation(onText: (t: string) => void) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  const supported =
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  async function start() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const mr = new MediaRecorder(s);
      chunks.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.current?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: mr.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        setBusy(true);
        setProgress("Loading Whisper…");
        try {
          const t = await getTranscriber((pct) => setProgress(`Loading Whisper… ${pct}%`));
          setProgress("Transcribing…");
          const pcm = await blobToPcm16k(blob);
          const out = await t!(pcm);
          const text = (out?.text || "").trim();
          if (text) cb.current(text);
        } catch (e) {
          alert("Whisper transcription failed: " + e);
        } finally {
          setBusy(false);
          setProgress("");
        }
      };
      rec.current = mr;
      mr.start();
      setRecording(true);
    } catch (e) {
      alert("Microphone unavailable or permission denied: " + e);
    }
  }

  function stop() {
    setRecording(false);
    try {
      rec.current?.stop();
    } catch {
      /* noop */
    }
  }

  useEffect(
    () => () => {
      try {
        rec.current?.stop();
      } catch {
        /* noop */
      }
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  return { supported, recording, busy, progress, toggle: () => (recording ? stop() : start()) };
}
