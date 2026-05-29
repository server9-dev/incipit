import { createOpenAI } from "@ai-sdk/openai";
import { streamText, generateText, embed, embedMany, type LanguageModel } from "ai";
import type { Entity } from "@incipit/shared";
import { settings, entities } from "./db.js";

/* Client-side AI: talks to Ollama (OpenAI-compatible) or OpenAI directly from
   the browser — no server. WebLLM (on-device) is handled separately. Anthropic
   /Google direct-from-browser are CORS-blocked; those await the desktop build. */

export type ProviderName = "ollama" | "openai" | "anthropic" | "google";
const DEFAULT_MODEL: Record<ProviderName, string> = {
  ollama: "gemma3-writer",
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-6",
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

export type Effective = {
  provider: ProviderName;
  model: string;
  embedModel: string | null;
  visionModel: string;
  ollamaBaseUrl: string;
  openaiKey?: string;
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
  };
}

function clientFor(e: Effective): (id: string) => LanguageModel {
  if (e.provider === "ollama") return createOpenAI({ baseURL: e.ollamaBaseUrl, apiKey: "ollama" });
  if (e.provider === "openai") return createOpenAI({ apiKey: e.openaiKey });
  throw new Error(
    `In the browser build, generation supports Ollama, OpenAI, or the on-device model. "${e.provider}" needs the desktop app.`,
  );
}

/** Stream a system+user completion from the configured cloud/local provider. */
export async function clientStream({ system, prompt }: { system: string; prompt: string }, onChunk: (t: string) => void) {
  const e = await effective();
  const model = clientFor(e)(e.model);
  const res = streamText({ model, system, prompt });
  for await (const chunk of res.textStream) onChunk(chunk);
}

/** Transcribe a handwriting image via a vision-capable model. */
export async function clientVision(image: string): Promise<string> {
  const e = await effective();
  const model = clientFor(e)(e.visionModel);
  const { text } = await generateText({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe the handwriting in this image into plain text, exactly as written, preserving line breaks. Output only the transcription." },
          { type: "image", image },
        ],
      },
    ],
  });
  return text.trim();
}

/* embeddings-based story-bible retrieval (best-effort; [] when unavailable) */
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export async function relevantEntities(projectId: string, query: string, k = 6, threshold = 0.5): Promise<Entity[]> {
  const e = await effective();
  if (!e.embedModel) return [];
  let model;
  if (e.provider === "ollama") model = createOpenAI({ baseURL: e.ollamaBaseUrl, apiKey: "ollama" }).textEmbeddingModel(e.embedModel);
  else if (e.provider === "openai") model = createOpenAI({ apiKey: e.openaiKey }).textEmbeddingModel(e.embedModel);
  else return [];
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

/* connection + model discovery for the settings UI */
export async function effectiveConfig() {
  const e = await effective();
  return { provider: e.provider, model: e.model, embedModel: e.embedModel, visionModel: e.visionModel };
}

export async function connectionStatus(): Promise<{ connected: boolean; detail: string }> {
  const e = await effective();
  if (e.provider === "ollama") {
    try {
      const root = e.ollamaBaseUrl.replace(/\/v1\/?$/, "");
      const res = await fetch(`${root}/api/tags`, { signal: AbortSignal.timeout(1500) });
      return res.ok ? { connected: true, detail: "Ollama reachable" } : { connected: false, detail: "Ollama not responding" };
    } catch {
      return { connected: false, detail: "Ollama not running" };
    }
  }
  if (e.provider === "openai") return e.openaiKey ? { connected: true, detail: "API key set" } : { connected: false, detail: "No API key" };
  return { connected: false, detail: `${e.provider} needs the desktop app (browser CORS)` };
}

export async function ollamaModels(): Promise<string[]> {
  const e = await effective();
  try {
    const root = e.ollamaBaseUrl.replace(/\/v1\/?$/, "");
    const res = await fetch(`${root}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name).sort();
  } catch {
    return [];
  }
}
