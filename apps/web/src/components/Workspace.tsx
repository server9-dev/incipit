import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Project, StoryNode, Entity, NodeType, EntityType } from "@incipit/shared";
import * as api from "../api.js";
import { ManuscriptTree } from "./ManuscriptTree.js";
import { SceneCards } from "./SceneCards.js";
import { Editor } from "./Editor.js";
import { StoryBible } from "./StoryBible.js";
import { OutlineModal } from "./OutlineModal.js";
import { ProjectSetup } from "./ProjectSetup.js";
import { BookView } from "./BookView.js";
import { ToolsMenu, type ToolState, type ToolActions } from "./ToolsMenu.js";
import { ExportMenu } from "./ExportMenu.js";
import { Sprint, hasActiveSprint } from "./Sprint.js";
import { Stats } from "./Stats.js";

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
  const [showCards, setShowCards] = useState(false);
  const [showSprint, setShowSprint] = useState(() => hasActiveSprint(projectId));
  const [showStats, setShowStats] = useState(false);
  const [toolState, setToolState] = useState<ToolState | null>(null);
  const toolActionsRef = useRef<ToolActions | null>(null);
  const [navPinned, setNavPinned] = useState(() => localStorage.getItem("incipit-nav-pinned") === "1");
  const [navHover, setNavHover] = useState(false);
  const [bibPinned, setBibPinned] = useState(() => localStorage.getItem("incipit-bib-pinned") !== "0");
  const [bibHover, setBibHover] = useState(false);
  useEffect(() => {
    localStorage.setItem("incipit-nav-pinned", navPinned ? "1" : "0");
  }, [navPinned]);
  useEffect(() => {
    localStorage.setItem("incipit-bib-pinned", bibPinned ? "1" : "0");
  }, [bibPinned]);
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

  async function addFrontMatter(title: string) {
    const n = await api.createNode({ projectId, parentId: null, type: "scene", title });
    await api.moveNode(n.id, null, 0); // front matter goes at the very top
    const { nodes: fresh } = await api.fetchProjectFull(projectId);
    setNodes(fresh);
    setSelectedId(n.id);
  }

  /* ----- project settings ----- */
  function patchProject(patch: Partial<Project>) {
    if (!project) return;
    setProject({ ...project, ...patch });
    api.updateProject(project.id, patch).catch(() => {});
  }

  /* ----- entities ----- */
  async function createEntity(type: EntityType, name: string, parentId: string | null = null) {
    const e = await api.createEntity({ projectId, type, name, parentId });
    setEntities((prev) => [...prev, e]);
  }
  // "Add to dictionary" from the editor → a project glossary term (story bible)
  async function addTerm(word: string, definition: string) {
    if (entities.some((e) => e.type === "term" && e.name.toLowerCase() === word.toLowerCase())) return;
    const e = await api.createEntity({ projectId, type: "term", name: word });
    const withDef = definition ? { ...e, summary: definition } : e;
    setEntities((prev) => [...prev, withDef]);
    if (definition) api.updateEntity(e.id, { summary: definition }).catch(() => {});
  }
  function patchEntity(id: string, patch: Partial<Entity>) {
    setEntities((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    const timers = entityTimers.current;
    if (timers.has(id)) clearTimeout(timers.get(id)!);
    timers.set(id, setTimeout(() => api.updateEntity(id, patch).catch(() => {}), 500));
  }
  async function removeEntity(id: string) {
    await api.deleteEntity(id); // cascades to descendants in the store
    const { entities: fresh } = await api.fetchProjectFull(projectId);
    setEntities(fresh);
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
          <span className="text-xs text-mute">{saving ? "saving…" : "saved ✓"}</span>
          <ExportMenu project={project} nodes={nodes} onOpenBook={() => setShowBook(true)} />
          <button
            onClick={() => setShowOutline(true)}
            className="rounded-md border border-line px-3 py-1 text-xs font-medium text-dim hover:bg-elevated"
          >
            Outline
          </button>
          <button
            onClick={() => setShowCards(true)}
            className="rounded-md border border-line px-3 py-1 text-xs font-medium text-dim hover:bg-elevated"
          >
            Scene cards
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
          <button
            onClick={() => setShowSprint(true)}
            className={`rounded-md border px-3 py-1 text-xs font-medium ${
              showSprint ? "border-brand text-brand" : "border-line text-dim hover:bg-elevated"
            }`}
          >
            Sprint
          </button>
          <button
            onClick={() => setShowStats(true)}
            className="rounded-md border border-line px-3 py-1 text-xs font-medium text-dim hover:bg-elevated"
          >
            Stats
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {(() => {
          const inner = (
            <>
              <div className="flex items-center justify-between border-b border-linesoft px-3 py-1.5">
                <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-mute">Navigation</span>
                <button
                  onClick={() => setNavPinned((p) => !p)}
                  title={navPinned ? "Unlock — auto-hide the sidebar" : "Lock the sidebar open"}
                  className="text-xs text-mute hover:text-fg"
                >
                  {navPinned ? "🔒" : "🔓"}
                </button>
              </div>
              <ProjectSetup project={project} onChange={patchProject} />
              <ToolsMenu state={toolState} actionsRef={toolActionsRef} />
              {/* gradient divider between the AI tools and the manuscript nav */}
              <div className="h-0.5 shrink-0" style={{ background: "linear-gradient(90deg, #00D4FF, #9B59B6, #FF0080)" }} />
              <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-mute">Manuscript</div>
              <ManuscriptTree
                nodes={nodes}
                selectedId={selectedId}
                onSelect={(n) => setSelectedId(n.id)}
                onAdd={addNode}
                onAddRoot={(type) => addNode(null, type)}
                onDelete={removeNode}
                onMove={moveNode}
                onRename={(id, title) => patchNodeLocal(id, { title })}
                onAddFrontMatter={addFrontMatter}
              />
            </>
          );
          if (navPinned) return <aside className="flex w-64 shrink-0 flex-col border-r border-linesoft bg-surface">{inner}</aside>;
          return (
            <>
              {/* collapsed: a thin gradient rail; hover to reveal the sidebar */}
              <div
                onMouseEnter={() => setNavHover(true)}
                title="Hover to open navigation"
                className="w-2 shrink-0 cursor-pointer"
                style={{ background: "linear-gradient(180deg, #00D4FF, #9B59B6, #FF0080)" }}
              />
              {/* stays mounted and slides on hover so it eases in/out instead of snapping */}
              <aside
                onMouseEnter={() => setNavHover(true)}
                onMouseLeave={() => setNavHover(false)}
                className={`absolute inset-y-0 left-0 z-20 flex w-64 flex-col border-r border-line bg-surface shadow-2xl transition duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  navHover ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-full opacity-0"
                }`}
              >
                {inner}
              </aside>
            </>
          );
        })()}

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
              onPovChange={(v) => patchNodeLocal(selected.id, { pov: v })}
              onEpigraphChange={(v) => patchNodeLocal(selected.id, { epigraph: v })}
              onInkSave={(v) => patchNodeLocal(selected.id, { ink: v })}
              onForceSave={() => void flushNode(selected.id)}
              onToolState={setToolState}
              toolActionsRef={toolActionsRef}
              onAddTerm={addTerm}
            />
          ) : selected ? (
            <FolderView
              node={selected}
              onTitle={(v) => patchNodeLocal(selected.id, { title: v })}
              onPov={(v) => patchNodeLocal(selected.id, { pov: v })}
              onEpigraph={(v) => patchNodeLocal(selected.id, { epigraph: v })}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-mute">
              Select or add a scene to start writing.
            </div>
          )}
        </main>

        {(() => {
          const bible = (
            <StoryBible
              entities={entities}
              projectId={projectId}
              onCreate={createEntity}
              onUpdate={patchEntity}
              onDelete={removeEntity}
              pinned={bibPinned}
              onTogglePin={() => setBibPinned((p) => !p)}
            />
          );
          if (bibPinned) return <aside className="flex w-72 shrink-0 flex-col border-l border-linesoft bg-surface">{bible}</aside>;
          return (
            <>
              {/* collapsed: a thin gradient rail on the right; hover to reveal the story bible */}
              <div
                onMouseEnter={() => setBibHover(true)}
                title="Hover to open the story bible"
                className="w-2 shrink-0 cursor-pointer"
                style={{ background: "linear-gradient(180deg, #FF0080, #9B59B6, #00D4FF)" }}
              />
              {/* stays mounted and slides on hover so it eases in/out instead of snapping */}
              <aside
                onMouseEnter={() => setBibHover(true)}
                onMouseLeave={() => setBibHover(false)}
                className={`absolute inset-y-0 right-0 z-20 flex w-72 flex-col border-l border-line bg-surface shadow-2xl transition duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  bibHover ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-full opacity-0"
                }`}
              >
                {bible}
              </aside>
            </>
          );
        })()}
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

      {showBook && <BookView project={project} nodes={nodes} onClose={() => setShowBook(false)} onChange={patchProject} />}

      {showSprint && (
        <Sprint
          projectId={projectId}
          liveWords={nodes.reduce((s, n) => s + n.wordCount, 0)}
          onClose={() => setShowSprint(false)}
        />
      )}

      {showStats && (
        <Stats
          projectId={projectId}
          totalWords={nodes.reduce((s, n) => s + n.wordCount, 0)}
          onClose={() => setShowStats(false)}
        />
      )}

      {showCards && (
        <SceneCards
          nodes={nodes}
          selectedId={selectedId}
          onJump={(id) => {
            setSelectedId(id);
            setShowCards(false);
          }}
          onMove={moveNode}
          onPatch={patchNodeLocal}
          onClose={() => setShowCards(false)}
        />
      )}

      {showStoryboard && (
        <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-void text-mute">Loading storyboard…</div>}>
          <StoryboardModal
            projectId={projectId}
            onClose={() => setShowStoryboard(false)}
            onIngested={async () => {
              const { nodes: fresh } = await api.fetchProjectFull(projectId);
              setNodes(fresh);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

function FolderView({
  node,
  onTitle,
  onPov,
  onEpigraph,
}: {
  node: StoryNode;
  onTitle: (v: string) => void;
  onPov: (v: string) => void;
  onEpigraph: (v: string) => void;
}) {
  return (
    <div className="max-w-2xl px-8 py-6">
      <input
        value={node.title}
        onChange={(e) => onTitle(e.target.value)}
        className="w-full bg-transparent text-xl font-semibold text-fg outline-none"
      />
      <p className="mt-1 text-sm text-mute">
        This is a {node.type}. Add and select a scene inside it to write.
      </p>
      {node.type === "chapter" && (
        <div className="mt-4 space-y-2">
          <input
            value={node.pov}
            onChange={(e) => onPov(e.target.value)}
            placeholder="POV (optional) — e.g. a character's name for multi-POV chapters"
            className="w-full rounded-md bg-surface px-3 py-2 text-sm text-dim outline-none focus:bg-elevated"
          />
          <textarea
            value={node.epigraph}
            onChange={(e) => onEpigraph(e.target.value)}
            placeholder="Epigraph — an opening quote/aside shown before this chapter in book view & export"
            rows={3}
            className="w-full resize-none rounded-md bg-surface px-3 py-2 text-sm italic text-dim outline-none focus:bg-elevated"
          />
        </div>
      )}
    </div>
  );
}
