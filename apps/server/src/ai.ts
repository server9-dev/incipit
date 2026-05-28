import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

/**
 * Provider-agnostic model resolution.
 *
 * The whole app only ever asks for `getModel()` — swapping providers is a
 * matter of environment variables, never code. Ollama is reached through its
 * OpenAI-compatible endpoint so a single client also covers OpenAI and any
 * other compatible host (LM Studio, vLLM, OpenRouter, ...).
 *
 * Env:
 *   AI_PROVIDER   ollama (default) | openai | anthropic | google
 *   AI_MODEL      model id (defaults per provider)
 *   OLLAMA_BASE_URL  default http://localhost:11434/v1
 *   OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY
 *   OPENAI_BASE_URL  optional, for OpenAI-compatible gateways
 */

type ProviderName = "ollama" | "openai" | "anthropic" | "google";

const DEFAULT_MODELS: Record<ProviderName, string> = {
  // gemma3-writer = gemma3:12b with num_ctx 16384 baked in (see models/).
  ollama: "gemma3-writer",
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-6",
  google: "gemini-2.0-flash",
};

function resolveProvider(): ProviderName {
  const p = (process.env.AI_PROVIDER ?? "ollama").toLowerCase();
  if (p === "openai" || p === "anthropic" || p === "google" || p === "ollama") return p;
  throw new Error(`Unknown AI_PROVIDER: ${p}`);
}

export function getModel(): LanguageModel {
  const provider = resolveProvider();
  const modelId = process.env.AI_MODEL ?? DEFAULT_MODELS[provider];

  switch (provider) {
    case "ollama": {
      const ollama = createOpenAI({
        baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
        apiKey: "ollama", // unused by Ollama, but the SDK requires a value
      });
      return ollama(modelId);
    }
    case "openai": {
      const openai = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL,
      });
      return openai(modelId);
    }
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      return anthropic(modelId);
    }
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
      return google(modelId);
    }
  }
}

export function activeConfig() {
  const provider = resolveProvider();
  return { provider, model: process.env.AI_MODEL ?? DEFAULT_MODELS[provider] };
}
