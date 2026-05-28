import { useEffect, useState } from "react";
import { PROJECT_TYPE_LABELS, type Project, type ProjectType } from "@firstdraft/shared";
import { listProjects, createProject, deleteProject } from "../api.js";

const TYPES = Object.keys(PROJECT_TYPE_LABELS) as ProjectType[];

export function ProjectList({ onOpen }: { onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ProjectType>("novel");

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

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Your projects</h1>
      <p className="mt-1 text-sm text-neutral-500">Local-first fiction studio — novels, short stories, and verse.</p>

      <div className="mt-6 flex gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="New project title…"
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ProjectType)}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {PROJECT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <button
          onClick={create}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Create
        </button>
      </div>

      <div className="mt-6 space-y-2">
        {projects.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 py-12 text-center text-neutral-400">
            No projects yet — create your first above.
          </div>
        )}
        {projects.map((p) => (
          <div
            key={p.id}
            className="group flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3 hover:border-neutral-400"
          >
            <button onClick={() => onOpen(p.id)} className="flex-1 text-left">
              <div className="font-medium text-neutral-900">{p.title}</div>
              <div className="text-xs text-neutral-500">
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
              className="ml-3 text-xs text-neutral-400 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
