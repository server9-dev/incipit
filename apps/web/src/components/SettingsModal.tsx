import { useEffect, useState } from "react";
import { getSettings, updateSettings, type AppSettings } from "../api.js";
import { BROWSER_MODELS, DEFAULT_BROWSER_MODEL, browserEngineEnabled, getBrowserModelId, setBrowserEngine, webgpuAvailable } from "../browserModel.js";

const ENGINE_LABELS: Record<string, string> = {
  browser: "On-device (browser · WebGPU)",
  ollama: "Ollama (local)",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};

export function SettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState<AppSettings | null>(null);
  // a single choice — no separate provider + on-device toggle that could conflict
  const [engine, setEngine] = useState<string>(browserEngineEnabled() ? "browser" : "ollama");
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [embedModel, setEmbedModel] = useState("");
  const [visionModel, setVisionModel] = useState("");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("");
  const [browserModelId, setBrowserModelId] = useState(getBrowserModelId());
  const [saving, setSaving] = useState(false);
  const webgpu = webgpuAvailable();

  useEffect(() => {
    getSettings().then((d) => {
      setS(d);
      setEngine(browserEngineEnabled() ? "browser" : d.provider);
      setModel(d.model);
      setEmbedModel(d.embedModel ?? "");
      setVisionModel(d.visionModel);
      setOllamaBaseUrl(d.ollamaBaseUrl);
    });
  }, []);

  const isBrowser = engine === "browser";
  const isCloud = engine === "openai" || engine === "anthropic" || engine === "google";
  const keySet = engine === "openai" ? s?.hasOpenaiKey : engine === "anthropic" ? s?.hasAnthropicKey : engine === "google" ? s?.hasGoogleKey : false;
  const engineOptions = [...(webgpu ? ["browser"] : []), "ollama", "openai", "anthropic", "google"];

  async function save() {
    setSaving(true);
    try {
      if (isBrowser) {
        setBrowserEngine(true, browserModelId);
      } else {
        setBrowserEngine(false);
        const patch: Record<string, string> = { provider: engine, model, embedModel, visionModel, ollamaBaseUrl };
        if (key.trim()) {
          if (engine === "openai") patch.openaiKey = key.trim();
          if (engine === "anthropic") patch.anthropicKey = key.trim();
          if (engine === "google") patch.googleKey = key.trim();
        }
        await updateSettings(patch);
      }
      onSaved();
      onClose();
    } catch (e) {
      alert("Failed to save settings: " + e);
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full rounded-lg border border-line bg-surface2 px-3 py-2 text-sm text-fg outline-none focus:border-brand";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-linesoft px-5 py-3">
          <h2 className="font-semibold text-fg">AI engine</h2>
          <button onClick={onClose} className="text-mute hover:text-fg">✕</button>
        </div>

        <div className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-mute">Engine</label>
            <select value={engine} onChange={(e) => setEngine(e.target.value)} className={field}>
              {engineOptions.map((p) => (
                <option key={p} value={p}>{ENGINE_LABELS[p] ?? p}</option>
              ))}
            </select>
          </div>

          {isBrowser ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-mute">Model</label>
              <select value={browserModelId} onChange={(e) => setBrowserModelId(e.target.value)} className={field}>
                {BROWSER_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
                {!BROWSER_MODELS.some((m) => m.id === browserModelId) && <option value={DEFAULT_BROWSER_MODEL}>default</option>}
              </select>
              <p className="mt-1 text-[11px] text-mute">Runs fully in your browser on the GPU — no key, private, works offline. First use downloads ~1–2 GB, then it's cached.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-mute">Model</label>
                <input value={model} onChange={(e) => setModel(e.target.value)} list="ollama-models" placeholder="model id" className={field} />
                {engine === "ollama" && (s?.ollamaModels?.length ?? 0) > 0 && (
                  <datalist id="ollama-models">
                    {s!.ollamaModels.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                )}
              </div>
              {engine === "ollama" ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-mute">Ollama URL</label>
                  <input value={ollamaBaseUrl} onChange={(e) => setOllamaBaseUrl(e.target.value)} className={field} />
                  <p className="mt-1 text-[11px] text-mute">No API key needed. Runs locally via Ollama.</p>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-medium text-mute">
                    API key {keySet && <span className="text-green-500">· saved</span>}
                  </label>
                  <input
                    type="password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder={keySet ? "•••••••• (leave blank to keep)" : "paste your API key"}
                    className={field}
                  />
                  <p className="mt-1 text-[11px] text-mute">Stored locally on this device. Cloud keys need the desktop app.</p>
                </div>
              )}
            </>
          )}

          {!isBrowser && (
            <>
              <button onClick={() => setAdvanced((a) => !a)} className="text-[11px] text-mute hover:text-fg">
                {advanced ? "− Advanced" : "+ Advanced (embedding & vision models)"}
              </button>
              {advanced && (
                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-mute">Embedding model (story-bible search)</label>
                    <input value={embedModel} onChange={(e) => setEmbedModel(e.target.value)} placeholder="none" className={field} />
                    {isCloud && engine === "anthropic" && <p className="mt-1 text-[11px] text-mute">Anthropic has no embeddings — bible context uses name-matching.</p>}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-mute">Vision model (handwriting → text)</label>
                    <input value={visionModel} onChange={(e) => setVisionModel(e.target.value)} className={field} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-linesoft px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-mute hover:bg-elevated">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="rounded-md bg-brand px-4 py-1.5 text-xs font-medium text-ink hover:bg-brand-dark disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
