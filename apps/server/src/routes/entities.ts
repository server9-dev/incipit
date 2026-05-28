import { Hono } from "hono";
import { z } from "zod";
import { entityTypeSchema } from "@firstdraft/shared";
import { entities } from "../db.js";

export const entityRoutes = new Hono();

const createSchema = z.object({
  projectId: z.string(),
  type: entityTypeSchema,
  name: z.string().min(1),
  summary: z.string().optional(),
  notes: z.string().optional(),
});
entityRoutes.post("/", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  return c.json(entities.create(parsed.data), 201);
});

entityRoutes.put("/:id", async (c) => {
  const e = entities.update(c.req.param("id"), await c.req.json());
  return e ? c.json(e) : c.json({ error: "Not found" }, 404);
});

entityRoutes.delete("/:id", (c) => {
  entities.remove(c.req.param("id"));
  return c.body(null, 204);
});
