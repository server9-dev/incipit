import { useEffect, useState } from "react";
import { getSettings, updateSettings, type AppSettings } from "../api.js";

const PROVIDER_LABELS: Record<string, string> = {
  ollama: "Ollama (local)",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};

export function SettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState<AppSettings | null>(null);
  const [provider, setProvider] = useState("ollama");
  const [model, setModel] = useState("");
  const [key, setKey] = useState(""); // new key for the selected provider
  const [advanced, setAdvanced] = useState(false);
  const [embedModel, setEmbedModel] = useState("");
  const [visionModel, setVisionModel] = useState("");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings().then((d) => {
      setS(d);
      setProvider(d.provider);
      setModel(d.model);
      setEmbedModel(d.embedModel ?? "");
      setVisionModel(d.visionModel);
      setOllamaBaseUrl(d.ollamaBaseUrl);
    });
  }, []);

  const keySet =
    provider === "openai" ? s?.hasOpenaiKey : provider === "anthropic" ? s?.hasAnthropicKey : provider === "google" ? s?.hasGoogleKey : false;

  async function save() {
    setSaving(true);
    const patch: Record<string, string> = { provider, model, embedModel, visionModel, ollamaBaseUrl };
    if (key.trim()) {
      if (provider === "openai") patch.openaiKey = key.trim();
      if (provider === "anthropic") patch.anthropicKey = key.trim();
      if (provider === "google") patch.googleKey = key.trim();
    }
    try {
      await updateSettings(patch);
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
          <h2 className="font-semibold text-fg">AI model &amp; provider</h2>
          <button onClick={onClose} className="text-mute hover:text-fg">✕</button>
        </div>

        <div className="space-y-3 p-5">
          {s && (
            <div className="flex items-center gap-2 text-xs">
              <span className={`h-2 w-2 rounded-full ${s.connection.connected ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-dim">{s.connection.detail}</span>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-mute">Provider</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className={field}>
              {(s?.providers ?? ["ollama"]).map((p) => (
                <option key={p} value={p}>{PROVIDER_LABELS[p] ?? p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-mute">Model</label>
            <input value={model} onChange={(e) => setModel(e.target.value)} list="ollama-models" placeholder="model id" className={field} />
            {provider === "ollama" && (s?.ollamaModels?.length ?? 0) > 0 && (
              <datalist id="ollama-models">
                {s!.ollamaModels.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            )}
          </div>

          {provider === "ollama" ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-mute">Ollama URL</label>
              <input value={ollamaBaseUrl} onChange={(e) => setOllamaBaseUrl(e.target.value)} className={field} />
              <p className="mt-1 text-[11px] text-mute">No API key needed. Runs fully local.</p>
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
              <p className="mt-1 text-[11px] text-mute">Stored locally on this machine. No GPU required.</p>
            </div>
          )}

          <button onClick={() => setAdvanced((a) => !a)} className="text-[11px] text-mute hover:text-fg">
            {advanced ? "− Advanced" : "+ Advanced (embedding & vision models)"}
          </button>
          {advanced && (
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-mute">Embedding model (story-bible search)</label>
                <input value={embedModel} onChange={(e) => setEmbedModel(e.target.value)} placeholder="none" className={field} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-mute">Vision model (handwriting → text)</label>
                <input value={visionModel} onChange={(e) => setVisionModel(e.target.value)} className={field} />
              </div>
            </div>
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
