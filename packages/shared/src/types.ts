import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Projects
 * ------------------------------------------------------------------ */

export const projectTypeSchema = z.enum(["novel", "short_story", "poems", "verse_novel"]);
export type ProjectType = z.infer<typeof projectTypeSchema>;

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  novel: "Novel",
  short_story: "Short Story",
  poems: "Poems",
  verse_novel: "Verse Novel",
};

export const projectSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: projectTypeSchema,
  /** one-line logline / premise */
  synopsis: z.string().default(""),
  /** craft defaults the AI should respect */
  pov: z.string().default(""), // e.g. "First person", "Third limited"
  tense: z.string().default(""), // e.g. "Past", "Present"
  genre: z.string().default(""),
  /** freeform notes on voice/style to steer the model */
  styleNotes: z.string().default(""),
  /** ornament shown between scenes in book view & export (e.g. # , * * * , ❧) */
  sceneBreak: z.string().default("#"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

/* ------------------------------------------------------------------ *
 * Manuscript tree (acts / chapters / scenes / poems)
 * ------------------------------------------------------------------ */

// folder = act/part/section grouping; chapter groups scenes; scene & poem are leaves.
export const nodeTypeSchema = z.enum(["folder", "chapter", "scene", "poem"]);
export type NodeType = z.infer<typeof nodeTypeSchema>;

export const nodeSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  parentId: z.string().nullable(),
  type: nodeTypeSchema,
  title: z.string(),
  /** short synopsis / scene brief shown in the outline and fed to the AI */
  synopsis: z.string().default(""),
  /** prose body, stored as HTML */
  content: z.string().default(""),
  /** POV character / label for this chapter or scene (multi-POV stories) */
  pov: z.string().default(""),
  /** epigraph — a quote/aside shown before the prose (chapter or scene opener) */
  epigraph: z.string().default(""),
  /** preserved handwriting: JSON {w,h,strokes:[[{x,y}]]} of the original ink */
  ink: z.string().default(""),
  /** sibling ordering */
  order: z.number(),
  wordCount: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StoryNode = z.infer<typeof nodeSchema>;

/* ------------------------------------------------------------------ *
 * Story bible (characters & world)
 * ------------------------------------------------------------------ */

export const entityTypeSchema = z.enum(["character", "location", "item", "lore", "term"]);
export type EntityType = z.infer<typeof entityTypeSchema>;

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  character: "Characters",
  location: "Locations",
  item: "Items",
  lore: "Lore",
  term: "Glossary",
};

export const entitySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  type: entityTypeSchema,
  /** parent entity for nesting (e.g. a country → provinces → cities); null = top level */
  parentId: z.string().nullable().default(null),
  name: z.string(),
  /** one-line summary the AI sees by default */
  summary: z.string().default(""),
  /** longer description / details */
  notes: z.string().default(""),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Entity = z.infer<typeof entitySchema>;

/* ------------------------------------------------------------------ *
 * AI request shapes
 * ------------------------------------------------------------------ */

/** Draft or continue prose for a scene/chapter/poem. */
export const draftRequestSchema = z.object({
  projectId: z.string(),
  nodeId: z.string(),
  mode: z.enum(["draft", "continue"]),
  /** extra instruction beyond the node synopsis */
  instruction: z.string().optional(),
  /** ids of entities to pull into context; empty = auto by name match */
  entityIds: z.array(z.string()).optional(),
});
export type DraftRequest = z.infer<typeof draftRequestSchema>;

export const outlineFrameworkSchema = z.enum([
  "three_act",
  "save_the_cat",
  "heros_journey",
  "snowflake",
  "freeform",
]);
export type OutlineFramework = z.infer<typeof outlineFrameworkSchema>;

export const OUTLINE_FRAMEWORK_LABELS: Record<OutlineFramework, string> = {
  three_act: "Three-Act",
  save_the_cat: "Save the Cat",
  heros_journey: "Hero's Journey",
  snowflake: "Snowflake",
  freeform: "Freeform",
};

/** Generate a beat-sheet / chapter outline for a project. */
export const outlineRequestSchema = z.object({
  projectId: z.string(),
  framework: outlineFrameworkSchema,
  premise: z.string(),
});
export type OutlineRequest = z.infer<typeof outlineRequestSchema>;

/** Fiction line-craft refine actions (operate on a passage). */
export const refineActionSchema = z.enum([
  "show_dont_tell",
  "tighten",
  "vary_rhythm",
  "sensory",
  "dialogue_polish",
  "rewrite",
  "expand",
  "proofread",
]);
export type RefineAction = z.infer<typeof refineActionSchema>;

export const REFINE_LABELS: Record<RefineAction, string> = {
  show_dont_tell: "Show, don't tell",
  tighten: "Tighten",
  vary_rhythm: "Vary rhythm",
  sensory: "Add sensory",
  dialogue_polish: "Polish dialogue",
  rewrite: "Rewrite",
  expand: "Expand",
  proofread: "Proofread",
};

/** Transcribe a handwriting image (PNG data URL) to text via a vision model. */
export const transcribeRequestSchema = z.object({
  image: z.string(), // data:image/png;base64,...
});
export type TranscribeRequest = z.infer<typeof transcribeRequestSchema>;

export const refineRequestSchema = z.object({
  action: refineActionSchema,
  text: z.string(),
  /** optional project id so refine can respect POV/tense/voice */
  projectId: z.string().optional(),
});
export type RefineRequest = z.infer<typeof refineRequestSchema>;
