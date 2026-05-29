import type { Project, ProjectType, StoryNode, NodeType, Entity, EntityType } from "@incipit/shared";
import { projects, nodes, entities, settings } from "./store/db.js";
import { ingestStoryboard as ingest } from "./store/storyboard.js";
import { clientVision, effectiveConfig, connectionStatus, ollamaModels } from "./store/ai.js";

/*
 * Local API: same surface the components already use, but backed by the
 * in-browser store (IndexedDB) + client-side models instead of a Node server.
 * The app needs no server process.
 */

/* health */
export const fetchHealth = async () => ({
  ok: true,
  ai: await effectiveConfig(),
  connection: await connectionStatus(),
});

/* settings */
export type AppSettings = {
  provider: string;
  model: string;
  embedModel: string | null;
  visionModel: string;
  ollamaBaseUrl: string;
  hasOpenaiKey: boolean;
  hasAnthropicKey: boolean;
  hasGoogleKey: boolean;
  providers: string[];
  ollamaModels: string[];
  connection: { connected: boolean; detail: string };
};

export const getSettings = async (): Promise<AppSettings> => {
  const s = await settings.all();
  const cfg = await effectiveConfig();
  return {
    ...cfg,
    ollamaBaseUrl: s.ollamaBaseUrl || "http://localhost:11434/v1",
    hasOpenaiKey: !!s.openaiKey,
    hasAnthropicKey: !!s.anthropicKey,
    hasGoogleKey: !!s.googleKey,
    providers: ["ollama", "openai", "anthropic", "google"],
    ollamaModels: await ollamaModels(),
    connection: await connectionStatus(),
  };
};
export const updateSettings = async (patch: Record<string, string>) => {
  const next = { ...patch };
  if (next.provider) {
    if (next.model === undefined) next.model = "";
    if (next.embedModel === undefined) next.embedModel = "";
    if (next.visionModel === undefined) next.visionModel = "";
  }
  await settings.set(next);
  return { ok: true, connection: await connectionStatus() };
};

/* projects */
export const listProjects = () => projects.list();
export const createProject = (title: string, type: ProjectType) => projects.create(title, type);
export const deleteProject = (id: string) => projects.remove(id);
export const updateProject = (id: string, patch: Partial<Project>) =>
  projects.update(id, patch) as Promise<Project>;
export const fetchProjectFull = async (id: string) => {
  const project = await projects.get(id);
  if (!project) throw new Error("Not found");
  return { project, nodes: await nodes.listByProject(id), entities: await entities.listByProject(id) };
};
export const getStoryboard = async (id: string) => ({ storyboard: await projects.getStoryboard(id) });
export const saveStoryboard = (id: string, storyboard: string) => projects.setStoryboard(id, storyboard);
export const ingestStoryboard = (id: string, elements: readonly unknown[]) => ingest(id, elements as never);

/* nodes */
export const createNode = (input: { projectId: string; parentId: string | null; type: NodeType; title: string }) =>
  nodes.create(input);
export const updateNode = (
  id: string,
  patch: Partial<Pick<StoryNode, "title" | "synopsis" | "content" | "pov" | "epigraph" | "ink" | "order" | "parentId">>,
) => nodes.update(id, patch) as Promise<StoryNode>;
export const deleteNode = (id: string) => nodes.remove(id);
export const moveNode = async (id: string, parentId: string | null, index: number) => ({
  ok: await nodes.move(id, parentId, index),
});

/* entities */
export const createEntity = (input: { projectId: string; type: EntityType; name: string }) => entities.create(input);
export const updateEntity = (id: string, patch: Partial<Pick<Entity, "name" | "summary" | "notes">>) =>
  entities.update(id, patch) as Promise<Entity>;
export const deleteEntity = (id: string) => entities.remove(id);

/* vision (handwriting → text) */
export const transcribe = async (image: string) => ({ text: await clientVision(image) });
