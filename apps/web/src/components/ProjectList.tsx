import { useEffect, useRef, useState } from "react";
import { PROJECT_TYPE_LABELS, type Project, type ProjectType } from "@incipit/shared";
import { listProjects, createProject, deleteProject, createNode, updateNode } from "../api.js";
import { parseFile } from "../importDoc.js";

const TYPES = Object.keys(PROJECT_TYPE_LABELS) as ProjectType[];

export function ProjectList({ onOpen }: { onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ProjectType>("novel");
  const [importing, setImporting] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () => listProjects().then(setProjects);
  useEffect(() => {
    reload();
  }, []);

  async function create() {
    if (!title.trim()) return;
    const p = await createProject(title.trim(), type);
    setTitle("");
    onOpen(p.id);
  }

  async function importFile(file: File) {
    setImporting(`Reading ${file.name}…`);
    try {
      const { title: t, chapters } = await parseFile(file);
      setImporting(`Building ${chapters.length} chapter${chapters.length === 1 ? "" : "s"}…`);
      const p = await createProject(t || "Imported", "novel", false); // no scaffold
      for (const ch of chapters) {
        const chap = await createNode({ projectId: p.id, parentId: null, type: "chapter", title: ch.title });
        const scene = await createNode({ projectId: p.id, parentId: chap.id, type: "scene", title: "Text" });
        await updateNode(scene.id, { content: ch.html });
      }
      onOpen(p.id);
    } catch (e) {
      alert("Import failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setImporting("");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Your projects</h1>
      <p className="mt-1 text-sm text-dim">Local-first fiction studio — novels, short stories, and verse.</p>

      <div className="mt-6 flex gap-2 rounded-xl border border-linesoft bg-surface p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="New project title…"
          className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ProjectType)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {PROJECT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <button
          onClick={create}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-dark"
        >
          Create
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.markdown,.docx,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.currentTarget.value = "";
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={!!importing}
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-dim hover:bg-elevated disabled:opacity-50"
        >
          ⬆ Import a manuscript
        </button>
        <span className="text-xs text-mute">{importing || ".docx, .pdf, .md, .txt — split into chapters by headings / “Chapter N”"}</span>
      </div>

      <div className="mt-6 space-y-2">
        {projects.length === 0 && (
          <div className="rounded-xl border border-dashed border-line py-12 text-center text-mute">
            No projects yet — create your first above.
          </div>
        )}
        {projects.map((p) => (
          <div
            key={p.id}
            className="group flex items-center justify-between rounded-xl border border-linesoft px-4 py-3 hover:border-line"
          >
            <button onClick={() => onOpen(p.id)} className="flex-1 text-left">
              <div className="font-medium text-fg">{p.title}</div>
              <div className="text-xs text-dim">
                {PROJECT_TYPE_LABELS[p.type]} · updated {new Date(p.updatedAt).toLocaleDateString()}
              </div>
            </button>
            <button
              onClick={async () => {
                if (confirm(`Delete "${p.title}"? This cannot be undone.`)) {
                  await deleteProject(p.id);
                  reload();
                }
              }}
              className="ml-3 text-xs text-mute opacity-0 transition group-hover:opacity-100 hover:text-red-500"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
