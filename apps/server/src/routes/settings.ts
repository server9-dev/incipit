import { Hono } from "hono";
import { z } from "zod";
import { getStored, setStored } from "../settings.js";
import { activeConfig, connectionStatus, ollamaModels } from "../ai.js";

export const settingsRoutes = new Hono();

settingsRoutes.get("/", async (c) => {
  const s = getStored();
  return c.json({
    ...activeConfig(), // effective provider, model, embedModel, visionModel
    ollamaBaseUrl: s.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
    hasOpenaiKey: !!(s.openaiKey || process.env.OPENAI_API_KEY),
    hasAnthropicKey: !!(s.anthropicKey || process.env.ANTHROPIC_API_KEY),
    hasGoogleKey: !!(s.googleKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    providers: ["ollama", "openai", "anthropic", "google"],
    ollamaModels: await ollamaModels(),
    connection: await connectionStatus(),
  });
});

const putSchema = z.object({
  provider: z.enum(["ollama", "openai", "anthropic", "google"]).optional(),
  model: z.string().optional(),
  embedModel: z.string().optional(),
  visionModel: z.string().optional(),
  ollamaBaseUrl: z.string().optional(),
  openaiKey: z.string().optional(),
  anthropicKey: z.string().optional(),
  googleKey: z.string().optional(),
});

settingsRoutes.put("/", async (c) => {
  const parsed = putSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const patch = { ...parsed.data };
  // switching provider without naming models → clear stale overrides so defaults apply
  if (patch.provider) {
    if (patch.model === undefined) patch.model = "";
    if (patch.embedModel === undefined) patch.embedModel = "";
    if (patch.visionModel === undefined) patch.visionModel = "";
  }
  setStored(patch);
  return c.json({ ok: true, connection: await connectionStatus() });
});
