import { Hono } from "hono";
import { z } from "zod";
import { nodeTypeSchema } from "@incipit/shared";
import { nodes } from "../db.js";

export const nodeRoutes = new Hono();

const createSchema = z.object({
  projectId: z.string(),
  parentId: z.string().nullable(),
  type: nodeTypeSchema,
  title: z.string().min(1),
});
nodeRoutes.post("/", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  return c.json(nodes.create(parsed.data), 201);
});

nodeRoutes.get("/:id", (c) => {
  const n = nodes.get(c.req.param("id"));
  return n ? c.json(n) : c.json({ error: "Not found" }, 404);
});

nodeRoutes.put("/:id", async (c) => {
  const n = nodes.update(c.req.param("id"), await c.req.json());
  return n ? c.json(n) : c.json({ error: "Not found" }, 404);
});

nodeRoutes.delete("/:id", (c) => {
  nodes.remove(c.req.param("id"));
  return c.body(null, 204);
});
