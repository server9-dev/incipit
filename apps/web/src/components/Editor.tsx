import { useRef, useState } from "react";
import {
  REFINE_LABELS,
  type StoryNode,
  type RefineAction,
} from "@firstdraft/shared";
import { draft as draftApi, refine as refineApi } from "../api.js";

const REFINE_ORDER: RefineAction[] = [
  "show_dont_tell",
  "tighten",
  "vary_rhythm",
  "sensory",
  "dialogue_polish",
  "rewrite",
  "expand",
  "proofread",
];

export function Editor({
  node,
  projectId,
  onContentChange,
  onSynopsisChange,
  onTitleChange,
}: {
  node: StoryNode;
  projectId: string;
  onContentChange: (v: string) => void;
  onSynopsisChange: (v: string) => void;
  onTitleChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function runDraft(mode: "draft" | "continue") {
    if (busy) return;
    setBusy(mode);
    try {
      if (mode === "draft") onContentChange("");
      let acc = mode === "continue" ? node.content : "";
      const base = mode === "continue" ? node.content + "\n\n" : "";
      let streamed = "";
      await draftApi({ projectId, nodeId: node.id, mode }, (chunk) => {
        streamed += chunk;
        acc = base + streamed;
        onContentChange(acc);
      });
    } catch (e) {
      console.error(e);
      alert("Draft failed: " + e);
    } finally {
      setBusy(null);
    }
  }

  async function runRefine(action: RefineAction) {
    const el = ref.current;
    if (!el || busy) return;
    let start = el.selectionStart;
    let end = el.selectionEnd;
    if (start === end) {
      start = 0;
      end = node.content.length;
    }
    const target = node.content.slice(start, end).trim();
    if (!target) return;
    const before = node.content.slice(0, start);
    const after = node.content.slice(end);

    setBusy(action);
    let acc = "";
    try {
      await refineApi({ action, text: target, projectId }, (chunk) => {
        acc += chunk;
        onContentChange(before + acc + after);
      });
    } catch (e) {
      onContentChange(before + target + after);
      console.error(e);
    } finally {
      setBusy(null);
    }
  }

  const isVerse = node.type === "poem";

  return (
    <div className="flex h-full flex-col">
      {/* title + brief */}
      <div className="border-b border-neutral-200 px-6 pt-4 pb-3">
        <input
          value={node.title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="w-full text-xl font-semibold text-neutral-900 outline-none"
        />
        <textarea
          value={node.synopsis}
          onChange={(e) => onSynopsisChange(e.target.value)}
          placeholder={isVerse ? "What is this poem about? (theme, image, form…)" : "Scene brief — what happens, who's present, the turn. The AI uses this to draft."}
          rows={2}
          className="mt-1 w-full resize-none rounded-md bg-neutral-50 px-2 py-1.5 text-sm text-neutral-600 outline-none focus:bg-neutral-100"
        />
      </div>

      {/* AI + refine toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-neutral-200 px-4 py-2">
        <button
          onClick={() => runDraft("draft")}
          disabled={!!busy}
          className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {busy === "draft" ? "Drafting…" : isVerse ? "Draft verse" : "Draft scene"}
        </button>
        <button
          onClick={() => runDraft("continue")}
          disabled={!!busy || !node.content.trim()}
          className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
        >
          {busy === "continue" ? "Continuing…" : "Continue"}
        </button>
        <span className="mx-1 h-4 w-px bg-neutral-200" />
        <span className="text-[11px] text-neutral-400">Refine selection:</span>
        {REFINE_ORDER.map((a) => (
          <button
            key={a}
            onClick={() => runRefine(a)}
            disabled={!!busy}
            className="rounded-md border border-neutral-300 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
          >
            {busy === a ? "…" : REFINE_LABELS[a]}
          </button>
        ))}
      </div>

      <textarea
        ref={ref}
        value={node.content}
        onChange={(e) => onContentChange(e.target.value)}
        placeholder={isVerse ? "Write your verse here, or hit Draft verse." : "Write here, or hit Draft scene to have the AI write from your brief and story bible. Select a passage to refine it."}
        className={`flex-1 resize-none px-8 py-6 leading-relaxed text-neutral-800 outline-none ${
          isVerse ? "font-serif whitespace-pre text-[15px]" : "text-[15px]"
        }`}
      />
    </div>
  );
}
