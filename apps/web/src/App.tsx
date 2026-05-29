import { useCallback, useEffect, useState } from "react";
import { fetchHealth } from "./api.js";
import { browserEngineEnabled, webgpuAvailable, getBrowserModelId } from "./browserModel.js";
import { ProjectList } from "./components/ProjectList.js";
import { Workspace } from "./components/Workspace.js";
import { SettingsModal } from "./components/SettingsModal.js";

export default function App() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [model, setModel] = useState("connecting…");
  const [connected, setConnected] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const refresh = useCallback(() => {
    // on-device browser model takes precedence and needs no server
    if (browserEngineEnabled() && webgpuAvailable()) {
      setModel(`browser/${getBrowserModelId().replace(/-q4f16_1-MLC$/, "")}`);
      setConnected(true);
      return;
    }
    fetchHealth()
      .then((h) => {
        setModel(`${h.ai.provider}/${h.ai.model}`);
        setConnected(h.connection.connected);
      })
      .catch(() => {
        setModel("offline");
        setConnected(false);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="flex h-full flex-col bg-ink text-fg">
      <header className="flex items-center justify-between border-b border-linesoft px-5 py-2">
        <div className="flex items-baseline gap-2">
          <span className="brand-gradient text-base font-semibold tracking-tight">Incipit</span>
          <span className="text-xs text-mute">fiction studio · local-first</span>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          title="AI model & provider settings"
          className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1 text-xs text-dim hover:bg-elevated"
        >
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          {connected ? "AI ready" : "Enable AI"}
          <span className="text-mute">⚙</span>
        </button>
      </header>

      <div className="min-h-0 flex-1">
        {projectId ? (
          <Workspace projectId={projectId} connected={connected} onExit={() => setProjectId(null)} />
        ) : (
          <ProjectList onOpen={setProjectId} />
        )}
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onSaved={refresh} />}
    </div>
  );
}
