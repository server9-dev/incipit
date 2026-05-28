import { useRef, useState } from "react";
import { REFINE_LABELS, type StoryNode, type RefineAction } from "@incipit/shared";
import { draft as draftApi, refine as refineApi } from "../api.js";
import { SuggestionReview } from "./SuggestionReview.js";

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

type Proposal = { from: number; to: number; original: string; proposed: string; label: string };

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
  const [gen, setGen] = useState<string | null>(null); // label of in-flight action
  const [stream, setStream] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);

  const busy = gen !== null;
  const isVerse = node.type === "poem";

  async function runDraft(mode: "draft" | "continue") {
    if (busy) return;
    const content = node.content;
    const empty = !content.trim();

    // first draft into an empty scene: low-friction, apply directly
    if (mode === "draft" && empty) {
      setGen("Drafting");
      setStream("");
      let acc = "";
      try {
        await draftApi({ projectId, nodeId: node.id, mode }, (ch) => {
          acc += ch;
          setStream(acc);
          onContentChange(acc);
        });
      } catch (e) {
        alert("Draft failed: " + e);
      } finally {
        setGen(null);
      }
      return;
    }

    const region =
      mode === "continue"
        ? { from: content.length, to: content.length, original: "" }
        : { from: 0, to: content.length, original: content };

    setGen(mode === "continue" ? "Continuing" : "Re-drafting");
    setStream("");
    let acc = "";
    try {
      await draftApi({ projectId, nodeId: node.id, mode }, (ch) => {
        acc += ch;
        setStream(acc);
      });
      const proposed = mode === "continue" ? (content.endsWith("\n") ? "" : "\n\n") + acc : acc;
      setProposal({ ...region, proposed, label: mode === "continue" ? "continuation" : "re-draft" });
    } catch (e) {
      alert("Draft failed: " + e);
    } finally {
      setGen(null);
    }
  }

  async function runRefine(action: RefineAction) {
    const el = ref.current;
    if (!el || busy) return;
    let from = el.selectionStart;
    let to = el.selectionEnd;
    if (from === to) {
      from = 0;
      to = node.content.length;
    }
    const original = node.content.slice(from, to);
    if (!original.trim()) return;

    setGen(REFINE_LABELS[action]);
    setStream("");
    let acc = "";
    try {
      await refineApi({ action, text: original, projectId }, (ch) => {
        acc += ch;
        setStream(acc);
      });
      setProposal({ from, to, original, proposed: acc, label: REFINE_LABELS[action] });
    } catch (e) {
      alert("Refine failed: " + e);
    } finally {
      setGen(null);
    }
  }

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

      {proposal ? (
        <SuggestionReview
          before={node.content.slice(0, proposal.from)}
          original={proposal.original}
          proposed={proposal.proposed}
          after={node.content.slice(proposal.to)}
          label={proposal.label}
          onApply={(final) => {
            onContentChange(final);
            setProposal(null);
          }}
          onCancel={() => setProposal(null)}
        />
      ) : busy && gen !== "Drafting" ? (
        <GeneratingView label={gen!} text={stream} />
      ) : (
        <>
          {/* AI + refine toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-neutral-200 px-4 py-2">
            <button
              onClick={() => runDraft("draft")}
              disabled={busy}
              className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              {gen === "Drafting" ? "Drafting…" : isVerse ? "Draft verse" : "Draft scene"}
            </button>
            <button
              onClick={() => runDraft("continue")}
              disabled={busy || !node.content.trim()}
              className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
            >
              Continue
            </button>
            <span className="mx-1 h-4 w-px bg-neutral-200" />
            <span className="text-[11px] text-neutral-400">Suggest on selection:</span>
            {REFINE_ORDER.map((a) => (
              <button
                key={a}
                onClick={() => runRefine(a)}
                disabled={busy}
                className="rounded-md border border-neutral-300 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
              >
                {REFINE_LABELS[a]}
              </button>
            ))}
          </div>

          <textarea
            ref={ref}
            value={node.content}
            onChange={(e) => onContentChange(e.target.value)}
            placeholder={isVerse ? "Write your verse here, or hit Draft verse." : "Write here, or hit Draft scene. Select a passage and pick a craft tool — edits come back as suggestions you can accept or reject."}
            className={`flex-1 resize-none px-8 py-6 font-garamond leading-relaxed text-neutral-800 outline-none ${
              isVerse ? "whitespace-pre text-[19px]" : "text-[19px]"
            }`}
          />
        </>
      )}
    </div>
  );
}

function GeneratingView({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-xs text-neutral-500">
        <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
        {label}… <span className="text-neutral-400">writing — you'll review the suggestion next</span>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6 font-garamond text-[19px] leading-relaxed whitespace-pre-wrap text-neutral-500">
        {text || "…"}
      </div>
    </div>
  );
}
