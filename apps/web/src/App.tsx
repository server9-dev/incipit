import { useEffect, useState } from "react";
import { fetchHealth } from "./api.js";
import { ProjectList } from "./components/ProjectList.js";
import { Workspace } from "./components/Workspace.js";

export default function App() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [model, setModel] = useState("connecting…");

  useEffect(() => {
    fetchHealth()
      .then((h) => setModel(`${h.ai.provider}/${h.ai.model}`))
      .catch(() => setModel("offline"));
  }, []);

  const online = model !== "offline" && model !== "connecting…";

  return (
    <div className="flex h-full flex-col bg-white text-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold tracking-tight">Incipit</span>
          <span className="text-xs text-neutral-400">fiction studio · local-first</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span className={`h-2 w-2 rounded-full ${online ? "bg-green-500" : "bg-red-500"}`} />
          {model}
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {projectId ? (
          <Workspace projectId={projectId} onExit={() => setProjectId(null)} />
        ) : (
          <ProjectList onOpen={setProjectId} />
        )}
      </div>
    </div>
  );
}
