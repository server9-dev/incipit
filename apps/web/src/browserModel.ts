import type { MLCEngine } from "@mlc-ai/web-llm";

/** Curated WebLLM models that run in-browser via WebGPU (q4f16). */
export const BROWSER_MODELS = [
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 3B — best (~2 GB)" },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B — fast (~0.9 GB)" },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 1.5B (~1 GB)" },
  { id: "gemma-2-2b-it-q4f16_1-MLC", label: "Gemma 2 2B (~1.5 GB)" },
  { id: "SmolLM2-1.7B-Instruct-q4f16_1-MLC", label: "SmolLM2 1.7B (~1 GB)" },
];
export const DEFAULT_BROWSER_MODEL = BROWSER_MODELS[0]!.id;

export const webgpuAvailable = () =>
  typeof navigator !== "undefined" && "gpu" in navigator && !!(navigator as { gpu?: unknown }).gpu;

// Default to the on-device model on first run when WebGPU is available — zero
// setup, fully private. Users can switch to Ollama/cloud in settings.
export const browserEngineEnabled = () => {
  const v = localStorage.getItem("incipit-engine");
  if (v === null) return webgpuAvailable();
  return v === "browser";
};
export const getBrowserModelId = () => localStorage.getItem("incipit-browser-model") || DEFAULT_BROWSER_MODEL;
export function setBrowserEngine(enabled: boolean, modelId?: string) {
  localStorage.setItem("incipit-engine", enabled ? "browser" : "server");
  if (modelId) localStorage.setItem("incipit-browser-model", modelId);
}

export type Progress = (p: { progress: number; text: string }) => void;

let engine: MLCEngine | null = null;
let loadedModel = ""; // only set AFTER a successful reload
let loading: Promise<MLCEngine> | null = null;

/**
 * Lazily load WebLLM + the selected model (cached in the browser after first
 * download). Uses an explicit reload() so the model is guaranteed loaded before
 * we return, and resets cleanly on failure so a retry isn't stuck.
 */
export async function ensureEngine(onProgress?: Progress): Promise<MLCEngine> {
  const modelId = getBrowserModelId();
  if (engine && loadedModel === modelId) return engine;
  if (loading) {
    await loading.catch(() => {});
    if (engine && loadedModel === modelId) return engine;
  }
  loading = (async () => {
    try {
      const webllm = await import("@mlc-ai/web-llm");
      if (!engine) engine = new webllm.MLCEngine();
      if (onProgress) engine.setInitProgressCallback((r) => onProgress({ progress: r.progress, text: r.text }));
      await engine.reload(modelId); // resolves only once the model is fully loaded
      loadedModel = modelId;
      return engine;
    } catch (e) {
      loadedModel = ""; // allow a clean retry
      throw e;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** Stream a system+user completion from the on-device model. */
export async function browserStream(
  { system, prompt }: { system: string; prompt: string },
  onChunk: (t: string) => void,
  onProgress?: Progress,
): Promise<void> {
  const e = await ensureEngine(onProgress);
  const stream = await e.chat.completions.create({
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    stream: true,
    temperature: 0.8,
  });
  for await (const chunk of stream) {
    const d = chunk.choices[0]?.delta?.content;
    if (d) onChunk(d);
  }
}
