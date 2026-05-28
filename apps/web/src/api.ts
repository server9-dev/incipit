import type {
  Project,
  ProjectType,
  StoryNode,
  NodeType,
  Entity,
  EntityType,
  RefineAction,
  OutlineFramework,
} from "@incipit/shared";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.text().catch(() => res.statusText)) || "Request failed");
  return res.json() as Promise<T>;
}

/* health */
export const fetchHealth = () =>
  fetch("/api/health").then(json<{ ok: boolean; ai: { provider: string; model: string } }>);

/* projects */
export const listProjects = () => fetch("/api/projects").then(json<Project[]>);
export const createProject = (title: string, type: ProjectType) =>
  fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, type }),
  }).then(json<Project>);
export const deleteProject = (id: string) => fetch(`/api/projects/${id}`, { method: "DELETE" });
export const updateProject = (id: string, patch: Partial<Project>) =>
  fetch(`/api/projects/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  }).then(json<Project>);
export const fetchProjectFull = (id: string) =>
  fetch(`/api/projects/${id}/full`).then(
    json<{ project: Project; nodes: StoryNode[]; entities: Entity[] }>,
  );

/* nodes */
export const createNode = (input: { projectId: string; parentId: string | null; type: NodeType; title: string }) =>
  fetch("/api/nodes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }).then(json<StoryNode>);
export const updateNode = (
  id: string,
  patch: Partial<Pick<StoryNode, "title" | "synopsis" | "content" | "order" | "parentId">>,
) =>
  fetch(`/api/nodes/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  }).then(json<StoryNode>);
export const deleteNode = (id: string) => fetch(`/api/nodes/${id}`, { method: "DELETE" });

/* entities */
export const createEntity = (input: { projectId: string; type: EntityType; name: string }) =>
  fetch("/api/entities", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }).then(json<Entity>);
export const updateEntity = (id: string, patch: Partial<Pick<Entity, "name" | "summary" | "notes">>) =>
  fetch(`/api/entities/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  }).then(json<Entity>);
export const deleteEntity = (id: string) => fetch(`/api/entities/${id}`, { method: "DELETE" });

/* streaming AI */
async function streamPost(path: string, body: unknown, onChunk: (t: string) => void) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error((await res.text().catch(() => res.statusText)) || "Request failed");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(dec.decode(value, { stream: true }));
  }
}

export const draft = (
  body: { projectId: string; nodeId: string; mode: "draft" | "continue"; instruction?: string },
  onChunk: (t: string) => void,
) => streamPost("/api/ai/draft", body, onChunk);

export const outline = (
  body: { projectId: string; framework: OutlineFramework; premise: string },
  onChunk: (t: string) => void,
) => streamPost("/api/ai/outline", body, onChunk);

export const refine = (
  body: { action: RefineAction; text: string; projectId?: string },
  onChunk: (t: string) => void,
) => streamPost("/api/ai/refine", body, onChunk);
