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
import * as api from "./api.js";
import { browserEngineEnabled, browserStream, type Progress } from "./browserModel.js";

const nameMatch = (entities: Entity[], ...texts: string[]): Entity[] => {
  const hay = texts.join(" ").toLowerCase();
  return entities.filter((e) => e.name && hay.includes(e.name.toLowerCase()));
};

/**
 * Generation routed to the on-device browser model when enabled, otherwise to
 * the server (which adds embeddings-based retrieval). The browser path rebuilds
 * the same prompts client-side with name-matched story-bible context.
 */
export function draftStream(
  opts: { project: Project; node: StoryNode; mode: "draft" | "continue"; plain: string; entities: Entity[]; instruction?: string },
  onChunk: (t: string) => void,
  onProgress?: Progress,
): Promise<void> {
  if (browserEngineEnabled()) {
    const ents = nameMatch(opts.entities, opts.node.synopsis, opts.plain, opts.instruction ?? "");
    const prompt = buildDraftPrompt({
      project: opts.project,
      node: { ...opts.node, content: opts.plain },
      mode: opts.mode,
      entities: ents,
      precedingText: opts.plain,
      instruction: opts.instruction,
    });
    return browserStream({ system: DRAFT_SYSTEM, prompt }, onChunk, onProgress);
  }
  return api.draft({ projectId: opts.project.id, nodeId: opts.node.id, mode: opts.mode, instruction: opts.instruction }, onChunk);
}

export function refineStream(
  opts: { project: Project; action: RefineAction; text: string },
  onChunk: (t: string) => void,
  onProgress?: Progress,
): Promise<void> {
  if (browserEngineEnabled()) {
    return browserStream(
      { system: REFINE_SYSTEM[opts.action], prompt: refineUserPrompt(opts.text, opts.project) },
      onChunk,
      onProgress,
    );
  }
  return api.refine({ action: opts.action, text: opts.text, projectId: opts.project.id }, onChunk);
}

export function outlineStream(
  opts: { project: Project; framework: OutlineFramework; premise: string },
  onChunk: (t: string) => void,
  onProgress?: Progress,
): Promise<void> {
  if (browserEngineEnabled()) {
    return browserStream(
      { system: OUTLINE_SYSTEM, prompt: buildOutlinePrompt({ project: opts.project, framework: opts.framework, premise: opts.premise }) },
      onChunk,
      onProgress,
    );
  }
  return api.outline({ projectId: opts.project.id, framework: opts.framework, premise: opts.premise }, onChunk);
}
