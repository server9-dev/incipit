import type {
  Project,
  ProjectType,
  StoryNode,
  NodeType,
  Entity,
  OutlineFramework,
  RefineAction,
} from "./types.js";

/* ------------------------------------------------------------------ *
 * Manuscript tree containment rules (shared by UI drop-zones + server)
 * ------------------------------------------------------------------ */

/** Which node types may live directly under a parent (null = top level). */
export function allowedChildTypes(parent: NodeType | null): NodeType[] {
  if (parent === null) return ["folder", "chapter", "scene", "poem"];
  if (parent === "folder") return ["folder", "chapter", "poem"];
  if (parent === "chapter") return ["scene"];
  return []; // scene / poem are leaves
}

export const canContain = (parent: NodeType | null, child: NodeType): boolean =>
  allowedChildTypes(parent).includes(child);

/* ------------------------------------------------------------------ *
 * Project scaffolds — the starting tree for each project type.
 * Returned as parent-relative specs; the server assigns ids/order.
 * ------------------------------------------------------------------ */

export type ScaffoldNode = {
  type: StoryNode["type"];
  title: string;
  synopsis?: string;
  children?: ScaffoldNode[];
};

export const SCAFFOLDS: Record<ProjectType, ScaffoldNode[]> = {
  novel: [
    {
      type: "folder",
      title: "Act I",
      children: [{ type: "chapter", title: "Chapter 1", children: [{ type: "scene", title: "Opening scene" }] }],
    },
    { type: "folder", title: "Act II", children: [] },
    { type: "folder", title: "Act III", children: [] },
  ],
  verse_novel: [
    {
      type: "folder",
      title: "Part I",
      children: [{ type: "chapter", title: "Canto 1", children: [{ type: "scene", title: "Opening verse" }] }],
    },
  ],
  short_story: [{ type: "scene", title: "Untitled Story" }],
  poems: [{ type: "poem", title: "Untitled Poem" }],
};

/* ------------------------------------------------------------------ *
 * Story-structure frameworks (used to generate beat-sheet outlines)
 * ------------------------------------------------------------------ */

export const FRAMEWORK_BEATS: Record<OutlineFramework, string[]> = {
  three_act: [
    "Act I — Setup",
    "Inciting Incident",
    "Plot Point 1 (into Act II)",
    "Rising Action",
    "Midpoint",
    "Plot Point 2 (crisis)",
    "Act III — Climax",
    "Resolution",
  ],
  save_the_cat: [
    "Opening Image",
    "Theme Stated",
    "Setup",
    "Catalyst",
    "Debate",
    "Break into Two",
    "B Story",
    "Fun and Games",
    "Midpoint",
    "Bad Guys Close In",
    "All Is Lost",
    "Dark Night of the Soul",
    "Break into Three",
    "Finale",
    "Final Image",
  ],
  heros_journey: [
    "Ordinary World",
    "Call to Adventure",
    "Refusal of the Call",
    "Meeting the Mentor",
    "Crossing the Threshold",
    "Tests, Allies, Enemies",
    "Approach to the Inmost Cave",
    "The Ordeal",
    "Reward",
    "The Road Back",
    "Resurrection",
    "Return with the Elixir",
  ],
  snowflake: [
    "One-sentence summary",
    "One-paragraph summary (with disasters)",
    "Character summaries & goals",
    "One-page synopsis expanding each paragraph",
    "Scene list",
  ],
  freeform: [],
};

/* ------------------------------------------------------------------ *
 * Prompt builders
 * ------------------------------------------------------------------ */

function projectVoice(p: Project): string {
  const bits: string[] = [];
  if (p.genre) bits.push(`Genre: ${p.genre}`);
  if (p.pov) bits.push(`POV: ${p.pov}`);
  if (p.tense) bits.push(`Tense: ${p.tense}`);
  if (p.synopsis) bits.push(`Premise: ${p.synopsis}`);
  if (p.styleNotes) bits.push(`Voice/style: ${p.styleNotes}`);
  const verseHint =
    p.type === "poems" || p.type === "verse_novel"
      ? "\nThis is verse: attend to line breaks, rhythm, and imagery; do not write prose paragraphs."
      : "";
  return (bits.length ? bits.join("\n") : "No style constraints specified.") + verseHint;
}

function entityContext(entities: Entity[]): string {
  if (!entities.length) return "";
  const lines = entities.map((e) => `- ${e.name} (${e.type})${e.summary ? `: ${e.summary}` : ""}`);
  return `\n\nStory bible (stay consistent with these):\n${lines.join("\n")}`;
}

export const DRAFT_SYSTEM =
  "You are a skilled fiction writer and ghostwriter. Write vivid, immersive prose that honors the author's established voice, POV, and tense. Show rather than tell. Do not summarize, explain your choices, or add headings — output only the story text.";

export function buildDraftPrompt(opts: {
  project: Project;
  node: StoryNode;
  mode: "draft" | "continue";
  entities: Entity[];
  precedingText?: string;
  instruction?: string;
}): string {
  const { project, node, mode, entities, precedingText, instruction } = opts;
  const header = `${projectVoice(project)}${entityContext(entities)}`;
  const brief = node.synopsis ? `\n\nScene brief: ${node.synopsis}` : "";
  const extra = instruction ? `\n\nAuthor instruction: ${instruction}` : "";

  if (mode === "continue") {
    const tail = (precedingText ?? node.content ?? "").slice(-4000);
    return `${header}${brief}${extra}\n\nContinue the following passage seamlessly, matching its voice and momentum. Do not repeat what is already written.\n\n---\n${tail}`;
  }
  return `${header}${brief}${extra}\n\nWrite this ${node.type === "poem" ? "poem" : "scene"} as fully realized prose${node.type === "poem" ? " (verse)" : ""}.`;
}

export const OUTLINE_SYSTEM =
  "You are a story-structure editor. Produce a clear, actionable beat sheet a novelist can write from. Be specific to the premise — concrete events, not abstract advice. Use Markdown. Output only the beat sheet: no preamble, sign-off, or meta commentary.";

export function buildOutlinePrompt(opts: {
  project: Project;
  framework: OutlineFramework;
  premise: string;
}): string {
  const { project, framework, premise } = opts;
  const beats = FRAMEWORK_BEATS[framework];
  const structure = beats.length
    ? `\n\nUse this structure, giving 1–3 sentences per beat:\n${beats.map((b) => `- ${b}`).join("\n")}`
    : "\n\nChoose whatever structure best fits the story.";
  return `${projectVoice(project)}\n\nPremise: ${premise}${structure}`;
}

/* ------------------------------------------------------------------ *
 * Fiction line-craft refine prompts
 * ------------------------------------------------------------------ */

export const REFINE_SYSTEM: Record<RefineAction, string> = {
  show_dont_tell:
    "Rewrite the passage to dramatize through action, sensory detail, and behavior instead of stating emotions or facts outright. Preserve plot and voice. Return only the rewritten prose.",
  tighten:
    "Tighten the passage: cut filler, redundancy, and weak qualifiers; favor strong verbs. Keep meaning and voice. Return only the tightened prose.",
  vary_rhythm:
    "Revise for sentence-rhythm variety — mix short and long sentences for cadence and emphasis. Preserve meaning and voice. Return only the revised prose.",
  sensory:
    "Enrich the passage with grounded sensory detail (sight, sound, smell, touch, taste) without purple overwriting. Preserve voice. Return only the revised prose.",
  dialogue_polish:
    "Sharpen the dialogue: make voices distinct, trim on-the-nose lines, improve beats and subtext. Keep the story. Return only the revised prose.",
  rewrite:
    "Improve the clarity, flow, and impact of the passage while preserving its meaning and voice. Return only the rewritten prose.",
  expand:
    "Expand the passage with more detail, beat, and texture, staying in the same scene and voice. Return only the expanded prose.",
  proofread:
    "Correct grammar, spelling, and punctuation only, preserving the author's voice and style. Return only the corrected prose.",
};

export function refineUserPrompt(text: string, project?: Project): string {
  const voice = project
    ? `Style to respect — ${[project.pov && `POV: ${project.pov}`, project.tense && `tense: ${project.tense}`, project.styleNotes]
        .filter(Boolean)
        .join("; ")}\n\n`
    : "";
  return `${voice}${text}`;
}
