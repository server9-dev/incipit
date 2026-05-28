import { useState } from "react";
import { OUTLINE_FRAMEWORK_LABELS, type OutlineFramework } from "@firstdraft/shared";
import { outline as outlineApi } from "../api.js";

const FRAMEWORKS = Object.keys(OUTLINE_FRAMEWORK_LABELS) as OutlineFramework[];

export function OutlineModal({
  projectId,
  defaultPremise,
  onClose,
  onInsert,
}: {
  projectId: string;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold text-neutral-900">Outline · beat sheet</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900">✕</button>
        </div>

        <div className="space-y-3 p-5">
          <div className="flex gap-2">
            <select
              value={framework}
              onChange={(e) => setFramework(e.target.value as OutlineFramework)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
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
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              {busy ? "Generating…" : "Generate"}
            </button>
          </div>
          <textarea
            value={premise}
            onChange={(e) => setPremise(e.target.value)}
            placeholder="Premise / logline to outline from…"
            rows={2}
            className="w-full resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </div>

        {result && (
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-neutral-200 px-5 py-3">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-neutral-800">{result}</pre>
          </div>
        )}

        {result && !busy && (
          <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
            <button
              onClick={() => onInsert(`Outline · ${OUTLINE_FRAMEWORK_LABELS[framework]}`, result)}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Save as note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
