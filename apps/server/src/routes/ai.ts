import { Hono } from "hono";
import { streamText } from "ai";
import {
  generateRequestSchema,
  refineRequestSchema,
  getTemplate,
  renderPrompt,
  type RefineAction,
} from "@firstdraft/shared";
import { getModel } from "../ai.js";

export const aiRoutes = new Hono();

/** Generate a fresh draft from a template + filled-in field values. */
aiRoutes.post("/generate", async (c) => {
  const parsed = generateRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const template = getTemplate(parsed.data.templateId);
  if (!template) return c.json({ error: "Unknown template" }, 404);

  const prompt = renderPrompt(template, parsed.data.values);
  const result = streamText({ model: getModel(), system: template.system, prompt });
  return result.toTextStreamResponse();
});

const REFINE_SYSTEM: Record<RefineAction, string> = {
  paraphrase: "Rewrite the user's text to express the same meaning in different words. Return only the rewritten text.",
  summarize: "Summarize the user's text concisely without adding information. Return only the summary.",
  translate: "Translate the user's text. Return only the translation.",
  proofread: "Correct grammar, spelling, and punctuation in the user's text while preserving voice and meaning. Return only the corrected text.",
  rewrite: "Improve the clarity and flow of the user's text. Return only the rewritten text.",
  shorten: "Make the user's text more concise while keeping its meaning. Return only the shortened text.",
  expand: "Expand the user's text with more detail and supporting points. Return only the expanded text.",
};

/** Refine a selection of text. Output is meant to feed a suggestion card. */
aiRoutes.post("/refine", async (c) => {
  const parsed = refineRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { action, text, instruction } = parsed.data;
  const system = REFINE_SYSTEM[action];
  const prompt = instruction ? `${instruction}\n\n---\n${text}` : text;

  const result = streamText({ model: getModel(), system, prompt });
  return result.toTextStreamResponse();
});
