import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText, generateText, embed, embedMany, type LanguageModel, type EmbeddingModel } from "ai";
import type { Entity } from "@incipit/shared";
import { settings, entities } from "./db.js";

/*
 * Client-side AI. In the browser, generation works with Ollama (localhost) and
 * the on-device WebLLM engine; cloud providers are CORS-blocked there. Inside
 * the Tauri desktop/mobile app we route through the Tauri HTTP plugin (no CORS),
 * so OpenAI / Anthropic / Google all work with a pasted key.
 */

export type ProviderName = "ollama" | "openai" | "anthropic" | "google";
const DEFAULT_MODEL: Record<ProviderName, string> = {
  ollama: "gemma3-writer",
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5", // cheap + fast default
  google: "gemini-2.0-flash",
};
const DEFAULT_EMBED: Record<ProviderName, string | null> = {
  ollama: "nomic-embed-text",
  openai: "text-embedding-3-small",
  google: "text-embedding-004",
  anthropic: null,
};
const DEFAULT_VISION: Record<ProviderName, string> = {
  ollama: "llama3.2-vision:11b",
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-6",
  google: "gemini-2.0-flash",
};

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let cachedFetch: typeof fetch | undefined;
/** In Tauri, use the HTTP plugin's fetch (bypasses CORS); in the browser, default fetch. */
async function platformFetch(): Promise<typeof fetch | undefined> {
  if (!isTauri()) return undefined;
  if (cachedFetch) return cachedFetch;
  const mod = await import("@tauri-apps/plugin-http");
  cachedFetch = mod.fetch as unknown as typeof fetch;
  return cachedFetch;
}

export type Effective = {
  provider: ProviderName;
  model: string;
  embedModel: string | null;
  visionModel: string;
  ollamaBaseUrl: string;
  openaiKey?: string;
  anthropicKey?: string;
  googleKey?: string;
};

export async function effective(): Promise<Effective> {
  const s = await settings.all();
  const p = (s.provider || "ollama") as ProviderName;
  const provider: ProviderName = ["ollama", "openai", "anthropic", "google"].includes(p) ? p : "ollama";
  return {
    provider,
    model: s.model || DEFAULT_MODEL[provider],
    embedModel: s.embedModel || DEFAULT_EMBED[provider],
    visionModel: s.visionModel || DEFAULT_VISION[provider],
    ollamaBaseUrl: s.ollamaBaseUrl || "http://localhost:11434/v1",
    openaiKey: s.openaiKey,
    anthropicKey: s.anthropicKey,
    googleKey: s.googleKey,
  };
}

function textModel(e: Effective, modelId: string, f: typeof fetch | undefined): LanguageModel {
  const o = f ? { fetch: f } : {};
  switch (e.provider) {
    case "ollama":
      return createOpenAI({ baseURL: e.ollamaBaseUrl, apiKey: "ollama", ...o })(modelId);
    case "openai":
      return createOpenAI({ apiKey: e.openaiKey, ...o })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey: e.anthropicKey, ...o })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey: e.googleKey, ...o })(modelId);
  }
}

function embedModel(e: Effective, f: typeof fetch | undefined): EmbeddingModel<string> | null {
  if (!e.embedModel) return null;
  const o = f ? { fetch: f } : {};
  switch (e.provider) {
    case "ollama":
      return createOpenAI({ baseURL: e.ollamaBaseUrl, apiKey: "ollama", ...o }).textEmbeddingModel(e.embedModel);
    case "openai":
      return createOpenAI({ apiKey: e.openaiKey, ...o }).textEmbeddingModel(e.embedModel);
    case "google":
      return createGoogleGenerativeAI({ apiKey: e.googleKey, ...o }).textEmbeddingModel(e.embedModel);
    case "anthropic":
      return null;
  }
}

export async function clientStream({ system, prompt }: { system: string; prompt: string }, onChunk: (t: string) => void) {
  const e = await effective();
  const model = textModel(e, e.model, await platformFetch());
  const res = streamText({ model, system, prompt });
  for await (const chunk of res.textStream) onChunk(chunk);
}

/** Decode a data: URL to raw bytes + media type (providers choke on data URLs). */
function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mediaType: string } {
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mediaType = /data:(.*?);base64/.exec(meta)?.[1] || "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mediaType };
}

export async function clientVision(image: string): Promise<string> {
  const e = await effective();
  const model = textModel(e, e.visionModel, await platformFetch());
  const { bytes, mediaType } = image.startsWith("data:")
    ? dataUrlToBytes(image)
    : { bytes: image as unknown as Uint8Array, mediaType: "image/png" };
  const { text } = await generateText({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe the handwriting in this image into plain text, exactly as written, preserving line breaks. Output only the transcription." },
          { type: "image", image: bytes, mimeType: mediaType },
        ],
      },
    ],
  });
  return text.trim();
}

/* ---- story-bible semantic retrieval (best-effort) ---- */
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export async function relevantEntities(projectId: string, query: string, k = 6, threshold = 0.5): Promise<Entity[]> {
  const e = await effective();
  const model = embedModel(e, await platformFetch());
  if (!model) return [];
  const rows = await entities.embeddingRows(projectId);
  if (!rows.length) return [];
  try {
    const missing = rows.filter((r) => !r.vec);
    if (missing.length) {
      const { embeddings } = await embedMany({ model, values: missing.map((m) => `search_document: ${m.text}`) });
      await Promise.all(missing.map((m, i) => { m.vec = embeddings[i]!; return entities.setEmbedding(m.id, embeddings[i]!); }));
    }
    const { embedding: q } = await embed({ model, value: `search_query: ${query}` });
    const scored = rows.filter((r) => r.vec).map((r) => ({ id: r.id, s: cosine(q, r.vec!) }))
      .sort((a, b) => b.s - a.s).filter((x) => x.s >= threshold).slice(0, k);
    const all = await entities.listByProject(projectId);
    const byId = new Map(all.map((x) => [x.id, x]));
    return scored.map((x) => byId.get(x.id)).filter((x): x is Entity => !!x);
  } catch {
    return [];
  }
}

/* ---- connection + discovery for the settings UI ---- */
export async function effectiveConfig() {
  const e = await effective();
  return { provider: e.provider, model: e.model, embedModel: e.embedModel, visionModel: e.visionModel };
}

const trimTrailingSlash = (url: string) => url.replace(/\/+$/, "");
const ollamaRootUrl = (baseUrl: string) => trimTrailingSlash(baseUrl).replace(/\/v1$/, "");

function fetchTimeoutSignal(ms = 5000): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(ms) : undefined;
}

function endpointPermissionDetail(error: unknown): string | null {
  const message = String(error).toLowerCase();
  if (message.includes("not allowed") || message.includes("forbidden") || message.includes("permission") || message.includes("scope")) {
    return "Endpoint blocked by desktop permissions";
  }
  return null;
}

export async function connectionStatus(): Promise<{ connected: boolean; detail: string }> {
  const e = await effective();
  if (e.provider === "ollama") {
    const f = (await platformFetch()) ?? fetch;
    const base = trimTrailingSlash(e.ollamaBaseUrl);
    const root = ollamaRootUrl(e.ollamaBaseUrl);

    try {
      const res = await f(`${root}/api/tags`, { signal: fetchTimeoutSignal() });
      if (res.ok) return { connected: true, detail: "Ollama reachable" };
    } catch (error) {
      const detail = endpointPermissionDetail(error);
      if (detail) return { connected: false, detail };
    }

    try {
      const res = await f(`${base}/models`, { signal: fetchTimeoutSignal() });
      return res.ok ? { connected: true, detail: "OpenAI-compatible endpoint reachable" } : { connected: false, detail: "Ollama endpoint not responding" };
    } catch (error) {
      return { connected: false, detail: endpointPermissionDetail(error) ?? "Ollama endpoint not reachable" };
    }
  }
  const key = e.provider === "openai" ? e.openaiKey : e.provider === "anthropic" ? e.anthropicKey : e.googleKey;
  if (!key) return { connected: false, detail: "No API key — add one in settings" };
  if (isTauri()) return { connected: true, detail: "API key set" };
  return { connected: false, detail: "Cloud keys work in the desktop app (browser blocks direct calls)" };
}

export async function ollamaModels(): Promise<string[]> {
  const e = await effective();
  const f = (await platformFetch()) ?? fetch;
  const base = trimTrailingSlash(e.ollamaBaseUrl);
  const root = ollamaRootUrl(e.ollamaBaseUrl);

  try {
    const res = await f(`${root}/api/tags`, { signal: fetchTimeoutSignal() });
    if (res.ok) {
      const data = (await res.json()) as { models?: { name: string }[] };
      return (data.models ?? []).map((m) => m.name).sort();
    }
  } catch {
    // Try OpenAI-compatible model discovery below.
  }

  try {
    const res = await f(`${base}/models`, { signal: fetchTimeoutSignal() });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: { id: string }[] };
    return (data.data ?? []).map((m) => m.id).sort();
  } catch {
    return [];
  }
}
