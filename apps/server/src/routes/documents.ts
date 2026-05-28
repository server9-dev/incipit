import { Hono } from "hono";
import { docs } from "../db.js";

export const documentRoutes = new Hono();

documentRoutes.get("/", (c) => c.json(docs.list()));

documentRoutes.get("/:id", (c) => {
  const doc = docs.get(c.req.param("id"));
  return doc ? c.json(doc) : c.json({ error: "Not found" }, 404);
});

documentRoutes.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { title?: string; content?: unknown };
  return c.json(docs.create(body.title ?? "Untitled", body.content ?? {}), 201);
});

documentRoutes.put("/:id", async (c) => {
  const body = (await c.req.json()) as { title?: string; content?: unknown };
  const doc = docs.update(c.req.param("id"), body);
  return doc ? c.json(doc) : c.json({ error: "Not found" }, 404);
});

documentRoutes.delete("/:id", (c) => {
  docs.remove(c.req.param("id"));
  return c.body(null, 204);
});
