import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel, EmbeddingModel } from "ai";
import { getStored } from "./settings.js";

/**
 * Provider-agnostic model resolution. Effective config layers:
 *   stored settings (UI)  →  environment variables  →  built-in defaults.
 * So the app runs on local Ollama out of the box, but a user on any hardware
 * can switch provider + paste an API key at runtime with no restart.
 */

export type ProviderName = "ollama" | "openai" | "anthropic" | "google";

const DEFAULT_MODELS: Record<ProviderName, string> = {
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

type Effective = {
  provider: ProviderName;
  model: string;
  embedModel: string | null;
  visionModel: string;
  ollamaBaseUrl: string;
  openaiKey?: string;
  anthropicKey?: string;
  googleKey?: string;
};

function effective(): Effective {
  const s = getStored();
  const p = (s.provider ?? process.env.AI_PROVIDER ?? "ollama").toLowerCase();
  const provider: ProviderName =
    p === "openai" || p === "anthropic" || p === "google" || p === "ollama" ? p : "ollama";
  return {
    provider,
    model: s.model || process.env.AI_MODEL || DEFAULT_MODELS[provider],
    embedModel: s.embedModel || process.env.EMBED_MODEL || DEFAULT_EMBED[provider],
    visionModel: s.visionModel || process.env.VISION_MODEL || DEFAULT_VISION[provider],
    ollamaBaseUrl: s.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
    openaiKey: s.openaiKey || process.env.OPENAI_API_KEY,
    anthropicKey: s.anthropicKey || process.env.ANTHROPIC_API_KEY,
    googleKey: s.googleKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  };
}

/** A text-generation model factory for the active provider. */
function textClient(e: Effective): (id: string) => LanguageModel {
  switch (e.provider) {
    case "ollama":
      return createOpenAI({ baseURL: e.ollamaBaseUrl, apiKey: "ollama" });
    case "openai":
      return createOpenAI({ apiKey: e.openaiKey, baseURL: process.env.OPENAI_BASE_URL });
    case "anthropic":
      return createAnthropic({ apiKey: e.anthropicKey });
    case "google":
      return createGoogleGenerativeAI({ apiKey: e.googleKey });
  }
}

export function getModel(): LanguageModel {
  const e = effective();
  return textClient(e)(e.model);
}

export function getVisionModel(): LanguageModel {
  const e = effective();
  return textClient(e)(e.visionModel);
}

export function getEmbeddingModel(): EmbeddingModel<string> | null {
  const e = effective();
  if (!e.embedModel) return null;
  switch (e.provider) {
    case "ollama":
      return createOpenAI({ baseURL: e.ollamaBaseUrl, apiKey: "ollama" }).textEmbeddingModel(e.embedModel);
    case "openai":
      return createOpenAI({ apiKey: e.openaiKey, baseURL: process.env.OPENAI_BASE_URL }).textEmbeddingModel(e.embedModel);
    case "google":
      return createGoogleGenerativeAI({ apiKey: e.googleKey }).textEmbeddingModel(e.embedModel);
    case "anthropic":
      return null;
  }
}

export function activeConfig() {
  const e = effective();
  return { provider: e.provider, model: e.model, embedModel: e.embedModel, visionModel: e.visionModel };
}

/** Is the active provider usable right now? (Ollama reachable / API key present.) */
export async function connectionStatus(): Promise<{ connected: boolean; detail: string }> {
  const e = effective();
  if (e.provider === "ollama") {
    try {
      const root = e.ollamaBaseUrl.replace(/\/v1\/?$/, "");
      const res = await fetch(`${root}/api/tags`, { signal: AbortSignal.timeout(1500) });
      return res.ok ? { connected: true, detail: "Ollama reachable" } : { connected: false, detail: "Ollama not responding" };
    } catch {
      return { connected: false, detail: "Ollama not running" };
    }
  }
  const key = e.provider === "openai" ? e.openaiKey : e.provider === "anthropic" ? e.anthropicKey : e.googleKey;
  return key
    ? { connected: true, detail: "API key set" }
    : { connected: false, detail: "No API key — add one in settings" };
}

/** Local Ollama model list (best-effort; empty when unavailable). */
export async function ollamaModels(): Promise<string[]> {
  const e = effective();
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
