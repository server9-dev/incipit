import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Project, StoryNode, Entity, NodeType, EntityType } from "@incipit/shared";
import * as api from "../api.js";
import { ManuscriptTree } from "./ManuscriptTree.js";
import { Editor } from "./Editor.js";
import { StoryBible } from "./StoryBible.js";
import { OutlineModal } from "./OutlineModal.js";
import { ProjectSetup } from "./ProjectSetup.js";
import { BookView } from "./BookView.js";

// Excalidraw is heavy — load it only when the storyboard opens
const StoryboardModal = lazy(() => import("./StoryboardModal.js").then((m) => ({ default: m.StoryboardModal })));

export function Workspace({ projectId, connected, onExit }: { projectId: string; connected: boolean; onExit: () => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [nodes, setNodes] = useState<StoryNode[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showOutline, setShowOutline] = useState(false);
  const [showBook, setShowBook] = useState(false);
  const [showStoryboard, setShowStoryboard] = useState(false);
  const [saving, setSaving] = useState(false);

  const nodeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const nodePending = useRef<Map<string, Partial<StoryNode>>>(new Map());
  const entityTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    api.fetchProjectFull(projectId).then(({ project, nodes, entities }) => {
      setProject(project);
      setNodes(nodes);
      setEntities(entities);
      const firstLeaf = nodes.find((n) => n.type === "scene" || n.type === "poem") ?? nodes[0];
      setSelectedId(firstLeaf?.id ?? null);
    });
  }, [projectId]);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  /* ----- node editing with debounced, patch-accumulating persistence ----- */
  async function flushNode(id: string) {
    const timers = nodeTimers.current;
    if (timers.has(id)) {
      clearTimeout(timers.get(id)!);
      timers.delete(id);
    }
    const patch = nodePending.current.get(id);
    if (!patch) return;
    nodePending.current.delete(id);
    const cur = (await api.updateNode(id, patch).catch(() => null)) as StoryNode | null;
    if (cur) setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, wordCount: cur.wordCount } : n)));
    if (nodePending.current.size === 0) setSaving(false);
  }

  function patchNodeLocal(id: string, patch: Partial<StoryNode>) {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    nodePending.current.set(id, { ...nodePending.current.get(id), ...patch });
    const timers = nodeTimers.current;
    if (timers.has(id)) clearTimeout(timers.get(id)!);
    setSaving(true);
    timers.set(id, setTimeout(() => void flushNode(id), 600));
  }

  async function addNode(parent: StoryNode | null, type: NodeType) {
    const titleByType: Record<NodeType, string> = {
      folder: "New Section",
      chapter: "New Chapter",
      scene: "New Scene",
      poem: "New Poem",
    };
    const n = await api.createNode({ projectId, parentId: parent?.id ?? null, type, title: titleByType[type] });
    setNodes((prev) => [...prev, n]);
    if (type === "scene" || type === "poem") setSelectedId(n.id);
  }

  async function removeNode(node: StoryNode) {
    if (!confirm(`Delete "${node.title}" and everything inside it?`)) return;
    await api.deleteNode(node.id);
    const { nodes: fresh } = await api.fetchProjectFull(projectId);
    setNodes(fresh);
    if (!fresh.some((n) => n.id === selectedId)) {
      setSelectedId(fresh.find((n) => n.type === "scene" || n.type === "poem")?.id ?? null);
    }
  }

  async function moveNode(nodeId: string, parentId: string | null, index: number) {
    await api.moveNode(nodeId, parentId, index);
    const { nodes: fresh } = await api.fetchProjectFull(projectId);
    setNodes(fresh);
  }

  /* ----- project settings ----- */
  function patchProject(patch: Partial<Project>) {
    if (!project) return;
    setProject({ ...project, ...patch });
    api.updateProject(project.id, patch).catch(() => {});
  }

  /* ----- entities ----- */
  async function createEntity(type: EntityType, name: string) {
    const e = await api.createEntity({ projectId, type, name });
    setEntities((prev) => [...prev, e]);
  }
  function patchEntity(id: string, patch: Partial<Entity>) {
    setEntities((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    const timers = entityTimers.current;
    if (timers.has(id)) clearTimeout(timers.get(id)!);
    timers.set(id, setTimeout(() => api.updateEntity(id, patch).catch(() => {}), 500));
  }
  async function removeEntity(id: string) {
    await api.deleteEntity(id);
    setEntities((prev) => prev.filter((e) => e.id !== id));
  }

  async function insertOutline(title: string, content: string) {
    const n = await api.createNode({ projectId, parentId: null, type: "scene", title });
    const saved = await api.updateNode(n.id, { content });
    setNodes((prev) => [...prev, { ...n, content, wordCount: saved.wordCount }]);
    setSelectedId(n.id);
    setShowOutline(false);
  }

  if (!project) return <div className="p-10 text-mute">Loading…</div>;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-linesoft px-4 py-2">
        <div className="flex items-center gap-3">
          <button onClick={onExit} className="text-sm text-dim hover:text-fg">
            ← Projects
          </button>
          <input
            value={project.title}
            onChange={(e) => patchProject({ title: e.target.value })}
            className="text-sm font-semibold text-fg outline-none"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-mute">{saving ? "saving…" : "saved"}</span>
          <button
            onClick={() => setShowOutline(true)}
            className="rounded-md border border-line px-3 py-1 text-xs font-medium text-dim hover:bg-elevated"
          >
            Outline
          </button>
          <button
            onClick={() => setShowStoryboard(true)}
            className="rounded-md border border-line px-3 py-1 text-xs font-medium text-dim hover:bg-elevated"
          >
            Storyboard
          </button>
          <button
            onClick={() => setShowBook(true)}
            className="rounded-md border border-line px-3 py-1 text-xs font-medium text-dim hover:bg-elevated"
          >
            Book view
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 flex-col border-r border-linesoft bg-surface">
          <ProjectSetup project={project} onChange={patchProject} />
          <div className="border-t border-linesoft px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-mute">
            Manuscript
          </div>
          <ManuscriptTree
            nodes={nodes}
            selectedId={selectedId}
            onSelect={(n) => setSelectedId(n.id)}
            onAdd={addNode}
            onAddRoot={(type) => addNode(null, type)}
            onDelete={removeNode}
            onMove={moveNode}
          />
        </aside>

        <main className="min-h-0 flex-1">
          {selected && selected.type !== "folder" && selected.type !== "chapter" ? (
            <Editor
              key={selected.id}
              node={selected}
              project={project}
              entities={entities}
              connected={connected}
              onContentChange={(v) => patchNodeLocal(selected.id, { content: v })}
              onSynopsisChange={(v) => patchNodeLocal(selected.id, { synopsis: v })}
              onTitleChange={(v) => patchNodeLocal(selected.id, { title: v })}
              onInkSave={(v) => patchNodeLocal(selected.id, { ink: v })}
              onForceSave={() => void flushNode(selected.id)}
            />
          ) : selected ? (
            <FolderView node={selected} onTitle={(v) => patchNodeLocal(selected.id, { title: v })} />
          ) : (
            <div className="flex h-full items-center justify-center text-mute">
              Select or add a scene to start writing.
            </div>
          )}
        </main>

        <StoryBible
          entities={entities}
          projectId={projectId}
          onCreate={createEntity}
          onUpdate={patchEntity}
          onDelete={removeEntity}
        />
      </div>

      {showOutline && (
        <OutlineModal
          project={project}
          connected={connected}
          defaultPremise={project.synopsis}
          onClose={() => setShowOutline(false)}
          onInsert={insertOutline}
        />
      )}

      {showBook && <BookView project={project} nodes={nodes} onClose={() => setShowBook(false)} />}

      {showStoryboard && (
        <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-void text-mute">Loading storyboard…</div>}>
          <StoryboardModal projectId={projectId} onClose={() => setShowStoryboard(false)} />
        </Suspense>
      )}
    </div>
  );
}

function FolderView({ node, onTitle }: { node: StoryNode; onTitle: (v: string) => void }) {
  return (
    <div className="px-8 py-6">
      <input
        value={node.title}
        onChange={(e) => onTitle(e.target.value)}
        className="text-xl font-semibold text-fg outline-none"
      />
      <p className="mt-2 text-sm text-mute">
        This is a {node.type}. Add and select a scene inside it to write.
      </p>
    </div>
  );
}
