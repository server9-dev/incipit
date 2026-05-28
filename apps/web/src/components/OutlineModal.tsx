import { useState } from "react";
import { OUTLINE_FRAMEWORK_LABELS, type OutlineFramework } from "@incipit/shared";
import { outline as outlineApi } from "../api.js";
import { localOutlineScaffold } from "../localcraft.js";

const FRAMEWORKS = Object.keys(OUTLINE_FRAMEWORK_LABELS) as OutlineFramework[];

export function OutlineModal({
  projectId,
  connected,
  defaultPremise,
  onClose,
  onInsert,
}: {
  projectId: string;
  connected: boolean;
  defaultPremise: string;
  onClose: () => void;
  onInsert: (title: string, content: string) => void;
}) {
  const [framework, setFramework] = useState<OutlineFramework>("three_act");
  const [premise, setPremise] = useState(defaultPremise);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (!premise.trim() || busy) return;
    // offline: drop in a fillable beat-sheet scaffold instead of generating
    if (!connected) {
      setResult(localOutlineScaffold(framework, premise));
      return;
    }
    setBusy(true);
    setResult("");
    let acc = "";
    try {
      await outlineApi({ projectId, framework, premise }, (chunk) => {
        acc += chunk;
        setResult(acc);
      });
    } catch (e) {
      setResult("Error: " + e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-linesoft px-5 py-3">
          <h2 className="font-semibold text-fg">Outline · beat sheet</h2>
          <button onClick={onClose} className="text-mute hover:text-fg">✕</button>
        </div>

        <div className="space-y-3 p-5">
          <div className="flex gap-2">
            <select
              value={framework}
              onChange={(e) => setFramework(e.target.value as OutlineFramework)}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {FRAMEWORKS.map((f) => (
                <option key={f} value={f}>
                  {OUTLINE_FRAMEWORK_LABELS[f]}
                </option>
              ))}
            </select>
            <button
              onClick={generate}
              disabled={busy || !premise.trim()}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-dark disabled:opacity-40"
            >
              {busy ? "Generating…" : connected ? "Generate" : "Scaffold (offline)"}
            </button>
          </div>
          <textarea
            value={premise}
            onChange={(e) => setPremise(e.target.value)}
            placeholder="Premise / logline to outline from…"
            rows={2}
            className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>

        {result && (
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-linesoft px-5 py-3">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-fg">{result}</pre>
          </div>
        )}

        {result && !busy && (
          <div className="flex justify-end gap-2 border-t border-linesoft px-5 py-3">
            <button
              onClick={() => onInsert(`Outline · ${OUTLINE_FRAMEWORK_LABELS[framework]}`, result)}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-dark"
            >
              Save as note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
