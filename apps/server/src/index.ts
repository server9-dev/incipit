import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { templates } from "@firstdraft/shared";
import { activeConfig } from "./ai.js";
import { aiRoutes } from "./routes/ai.js";
import { documentRoutes } from "./routes/documents.js";

const app = new Hono();
app.use("*", cors());

app.get("/api/health", (c) => c.json({ ok: true, ai: activeConfig() }));
app.get("/api/templates", (c) => c.json(templates));

app.route("/api/ai", aiRoutes);
app.route("/api/documents", documentRoutes);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  const { provider, model } = activeConfig();
  console.log(`firstdraft server → http://localhost:${info.port}  (AI: ${provider}/${model})`);
});
