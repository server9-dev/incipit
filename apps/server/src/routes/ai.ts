import { Hono } from "hono";
import { streamText, generateText } from "ai";
import {
  draftRequestSchema,
  outlineRequestSchema,
  refineRequestSchema,
  transcribeRequestSchema,
  buildDraftPrompt,
  buildOutlinePrompt,
  DRAFT_SYSTEM,
  OUTLINE_SYSTEM,
  REFINE_SYSTEM,
  refineUserPrompt,
  type Entity,
} from "@incipit/shared";
import { getModel, getVisionModel } from "../ai.js";
import { projects, nodes, entities, stripHtml } from "../db.js";
import { relevantEntities } from "../retrieval.js";

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

  // content is stored as HTML; the model should see plain prose
  const plainContent = stripHtml(node.content);
  const allEntities = entities.listByProject(projectId);

  let selected: Entity[];
  if (entityIds?.length) {
    selected = allEntities.filter((e) => entityIds.includes(e.id));
  } else {
    // union explicit name-matches with semantic retrieval (best-effort)
    const explicit = autoEntities(allEntities, node.synopsis, plainContent, instruction ?? "");
    const byId = new Map(explicit.map((e) => [e.id, e]));
    try {
      const query = `${node.title}. ${node.synopsis}. ${plainContent.slice(0, 1500)} ${instruction ?? ""}`;
      for (const e of await relevantEntities(projectId, query)) byId.set(e.id, e);
    } catch {
      /* embeddings unavailable — fall back to name-match only */
    }
    selected = [...byId.values()];
  }

  const prompt = buildDraftPrompt({
    project,
    node: { ...node, content: plainContent },
    mode,
    entities: selected,
    precedingText: plainContent,
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

/** Transcribe a handwriting image to text via a vision model. */
aiRoutes.post("/transcribe", async (c) => {
  const parsed = transcribeRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  try {
    const { text } = await generateText({
      model: getVisionModel(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcribe the handwriting in this image into plain text, exactly as written, preserving line breaks. Output only the transcription with no commentary or quotation marks.",
            },
            { type: "image", image: parsed.data.image },
          ],
        },
      ],
    });
    return c.json({ text: text.trim() });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
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
