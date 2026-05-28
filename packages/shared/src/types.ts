import { z } from "zod";

/**
 * A field the user fills in before running a template.
 * Rendered as form inputs in the template gallery.
 */
export const templateFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["text", "textarea", "select"]),
  placeholder: z.string().optional(),
  required: z.boolean().default(false),
  /** options for "select" type */
  options: z.array(z.string()).optional(),
});
export type TemplateField = z.infer<typeof templateFieldSchema>;

/**
 * A writing template (the Jasper/Copy.ai-style "gallery" unit).
 * `prompt` is a string with {{field_id}} placeholders substituted at run time.
 */
export const templateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  icon: z.string().optional(),
  fields: z.array(templateFieldSchema),
  /** system prompt that frames the model's role */
  system: z.string(),
  /** user prompt template with {{field_id}} placeholders */
  prompt: z.string(),
});
export type Template = z.infer<typeof templateSchema>;

/**
 * Built-in "refine" operations run against a selection of text.
 * These feed the suggestion-card flow rather than generating new docs.
 */
export const refineActionSchema = z.enum([
  "paraphrase",
  "summarize",
  "translate",
  "proofread",
  "rewrite",
  "shorten",
  "expand",
]);
export type RefineAction = z.infer<typeof refineActionSchema>;

/** Persisted document. `content` is TipTap/ProseMirror JSON. */
export const documentSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.unknown(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Doc = z.infer<typeof documentSchema>;

/** Request shapes for the AI endpoints. */
export const generateRequestSchema = z.object({
  templateId: z.string(),
  values: z.record(z.string()),
});
export type GenerateRequest = z.infer<typeof generateRequestSchema>;

export const refineRequestSchema = z.object({
  action: refineActionSchema,
  text: z.string(),
  /** free-form instruction, e.g. target language for translate */
  instruction: z.string().optional(),
});
export type RefineRequest = z.infer<typeof refineRequestSchema>;
