import { Hono } from "hono";
import { streamText } from "ai";
import {
  draftRequestSchema,
  outlineRequestSchema,
  refineRequestSchema,
  buildDraftPrompt,
  buildOutlinePrompt,
  DRAFT_SYSTEM,
  OUTLINE_SYSTEM,
  REFINE_SYSTEM,
  refineUserPrompt,
  type Entity,
} from "@incipit/shared";
import { getModel } from "../ai.js";
import { projects, nodes, entities } from "../db.js";

export const aiRoutes = new Hono();

/** Pick entities mentioned by name in a blob of text (cheap auto-context). */
function autoEntities(all: Entity[], ...texts: string[]): Entity[] {
  const hay = texts.join(" ").toLowerCase();
  return all.filter((e) => e.name && hay.includes(e.name.toLowerCase()));
}

/** Draft or continue prose for a node, grounded in project voice + bible. */
aiRoutes.post("/draft", async (c) => {
  const parsed = draftRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { projectId, nodeId, mode, instruction, entityIds } = parsed.data;

  const project = projects.get(projectId);
  const node = nodes.get(nodeId);
  if (!project || !node) return c.json({ error: "Project or node not found" }, 404);

  const allEntities = entities.listByProject(projectId);
  const selected = entityIds?.length
    ? allEntities.filter((e) => entityIds.includes(e.id))
    : autoEntities(allEntities, node.synopsis, node.content, instruction ?? "");

  const prompt = buildDraftPrompt({
    project,
    node,
    mode,
    entities: selected,
    precedingText: node.content,
    instruction,
  });

  const result = streamText({ model: getModel(), system: DRAFT_SYSTEM, prompt });
  return result.toTextStreamResponse();
});

/** Generate a beat-sheet outline for a project. */
aiRoutes.post("/outline", async (c) => {
  const parsed = outlineRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { projectId, framework, premise } = parsed.data;

  const project = projects.get(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const prompt = buildOutlinePrompt({ project, framework, premise });
  const result = streamText({ model: getModel(), system: OUTLINE_SYSTEM, prompt });
  return result.toTextStreamResponse();
});

/** Fiction line-craft refine of a selected passage. */
aiRoutes.post("/refine", async (c) => {
  const parsed = refineRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { action, text, projectId } = parsed.data;

  const project = projectId ? projects.get(projectId) : undefined;
  const result = streamText({
    model: getModel(),
    system: REFINE_SYSTEM[action],
    prompt: refineUserPrompt(text, project),
  });
  return result.toTextStreamResponse();
});
