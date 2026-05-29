import {
  buildDraftPrompt,
  buildOutlinePrompt,
  refineUserPrompt,
  DRAFT_SYSTEM,
  OUTLINE_SYSTEM,
  REFINE_SYSTEM,
  type Project,
  type StoryNode,
  type Entity,
  type RefineAction,
  type OutlineFramework,
} from "@incipit/shared";
import { browserEngineEnabled, browserStream, type Progress } from "./browserModel.js";
import { clientStream, relevantEntities } from "./store/ai.js";

const nameMatch = (entities: Entity[], ...texts: string[]): Entity[] => {
  const hay = texts.join(" ").toLowerCase();
  return entities.filter((e) => e.name && hay.includes(e.name.toLowerCase()));
};

/** Stream from the on-device model (WebLLM) when enabled, else the configured cloud/local provider. */
function stream(
  body: { system: string; prompt: string },
  onChunk: (t: string) => void,
  onProgress?: Progress,
): Promise<void> {
  return browserEngineEnabled() ? browserStream(body, onChunk, onProgress) : clientStream(body, onChunk);
}

export async function draftStream(
  opts: { project: Project; node: StoryNode; mode: "draft" | "continue"; plain: string; entities: Entity[]; instruction?: string },
  onChunk: (t: string) => void,
  onProgress?: Progress,
): Promise<void> {
  const explicit = nameMatch(opts.entities, opts.node.synopsis, opts.plain, opts.instruction ?? "");
  const byId = new Map(explicit.map((e) => [e.id, e]));
  try {
    const query = `${opts.node.title}. ${opts.node.synopsis}. ${opts.plain.slice(0, 1500)} ${opts.instruction ?? ""}`;
    for (const e of await relevantEntities(opts.project.id, query)) byId.set(e.id, e);
  } catch {
    /* embeddings unavailable — name-match only */
  }
  const prompt = buildDraftPrompt({
    project: opts.project,
    node: { ...opts.node, content: opts.plain },
    mode: opts.mode,
    entities: [...byId.values()],
    precedingText: opts.plain,
    instruction: opts.instruction,
  });
  return stream({ system: DRAFT_SYSTEM, prompt }, onChunk, onProgress);
}

export function refineStream(
  opts: { project: Project; action: RefineAction; text: string },
  onChunk: (t: string) => void,
  onProgress?: Progress,
): Promise<void> {
  return stream(
    { system: REFINE_SYSTEM[opts.action], prompt: refineUserPrompt(opts.text, opts.project) },
    onChunk,
    onProgress,
  );
}

export function outlineStream(
  opts: { project: Project; framework: OutlineFramework; premise: string },
  onChunk: (t: string) => void,
  onProgress?: Progress,
): Promise<void> {
  return stream(
    { system: OUTLINE_SYSTEM, prompt: buildOutlinePrompt({ project: opts.project, framework: opts.framework, premise: opts.premise }) },
    onChunk,
    onProgress,
  );
}
