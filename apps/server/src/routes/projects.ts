import { Hono } from "hono";
import { z } from "zod";
import { projectTypeSchema } from "@incipit/shared";
import { projects, nodes, entities } from "../db.js";
import { ingestStoryboard } from "../storyboard.js";

export const projectRoutes = new Hono();

projectRoutes.get("/", (c) => c.json(projects.list()));

const createSchema = z.object({ title: z.string().min(1), type: projectTypeSchema });
projectRoutes.post("/", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  return c.json(projects.create(parsed.data.title, parsed.data.type), 201);
});

projectRoutes.get("/:id", (c) => {
  const p = projects.get(c.req.param("id"));
  return p ? c.json(p) : c.json({ error: "Not found" }, 404);
});

/** Full project payload for the editor: project + tree + bible. */
projectRoutes.get("/:id/full", (c) => {
  const id = c.req.param("id");
  const project = projects.get(id);
  if (!project) return c.json({ error: "Not found" }, 404);
  return c.json({ project, nodes: nodes.listByProject(id), entities: entities.listByProject(id) });
});

projectRoutes.put("/:id", async (c) => {
  const p = projects.update(c.req.param("id"), await c.req.json());
  return p ? c.json(p) : c.json({ error: "Not found" }, 404);
});

projectRoutes.get("/:id/storyboard", (c) => {
  if (!projects.get(c.req.param("id"))) return c.json({ error: "Not found" }, 404);
  return c.json({ storyboard: projects.getStoryboard(c.req.param("id")) });
});

projectRoutes.put("/:id/storyboard", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { storyboard?: string };
  projects.setStoryboard(c.req.param("id"), body.storyboard ?? "");
  return c.json({ ok: true });
});

/** Turn the board's frames/cards into chapters/scenes (upsert by element id). */
projectRoutes.post("/:id/storyboard/ingest", async (c) => {
  const id = c.req.param("id");
  if (!projects.get(id)) return c.json({ error: "Not found" }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { elements?: unknown[] };
  const summary = ingestStoryboard(id, (body.elements ?? []) as never);
  return c.json(summary);
});

projectRoutes.delete("/:id", (c) => {
  projects.remove(c.req.param("id"));
  return c.body(null, 204);
});
