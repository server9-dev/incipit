import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { activeConfig } from "./ai.js";
import { aiRoutes } from "./routes/ai.js";
import { projectRoutes } from "./routes/projects.js";
import { nodeRoutes } from "./routes/nodes.js";
import { entityRoutes } from "./routes/entities.js";

const app = new Hono();
app.use("*", cors());

app.get("/api/health", (c) => c.json({ ok: true, ai: activeConfig() }));

app.route("/api/ai", aiRoutes);
app.route("/api/projects", projectRoutes);
app.route("/api/nodes", nodeRoutes);
app.route("/api/entities", entityRoutes);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  const { provider, model } = activeConfig();
  console.log(`incipit server → http://localhost:${info.port}  (AI: ${provider}/${model})`);
});
