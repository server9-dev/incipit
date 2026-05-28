import { useMemo, useState } from "react";
import { buildSegments, resolveSegments, countChanges, type Segment } from "../diff.js";

export function SuggestionReview({
  before = "",
  original,
  proposed,
  after = "",
  label,
  paper = { bg: "#ffffff", fg: "#1a1a1a" },
  onApply,
  onCancel,
}: {
  before?: string;
  original: string;
  proposed: string;
  after?: string;
  label: string;
  paper?: { bg: string; fg: string };
  /** receives the resolved text (before + resolved region + after) */
  onApply: (finalContent: string) => void;
  onCancel: () => void;
}) {
  const initial = useMemo(() => buildSegments(original, proposed), [original, proposed]);
  const [segments, setSegments] = useState<Segment[]>(initial);

  const total = countChanges(segments);
  const accepted = segments.filter((s) => s.kind === "change" && s.status === "accepted").length;

  const setStatus = (id: number, status: "accepted" | "rejected") =>
    setSegments((prev) => prev.map((s) => (s.kind === "change" && s.id === id ? { ...s, status } : s)));

  const setAll = (status: "accepted" | "rejected") =>
    setSegments((prev) => prev.map((s) => (s.kind === "change" ? { ...s, status } : s)));

  const apply = () => onApply(before + resolveSegments(segments) + after);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-linesoft bg-surface2 px-4 py-2">
        <span className="text-xs font-medium text-brand">
          Reviewing {label} · {total} change{total === 1 ? "" : "s"} · {accepted} accepted
        </span>
        <div className="ml-auto flex gap-1.5">
          <button onClick={() => setAll("accepted")} className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-dim hover:bg-elevated">
            Accept all
          </button>
          <button onClick={() => setAll("rejected")} className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-dim hover:bg-elevated">
            Reject all
          </button>
          <button onClick={onCancel} className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-mute hover:bg-elevated">
            Cancel
          </button>
          <button onClick={apply} className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-ink hover:bg-brand-dark">
            Apply
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto px-8 py-6 font-garamond text-[19px] leading-relaxed"
        style={{ background: paper.bg, color: paper.fg }}
      >
        <span className="whitespace-pre-wrap opacity-50">{before}</span>
        {segments.map((s, i) => {
          if (s.kind === "context") return <span key={i} className="whitespace-pre-wrap">{s.text}</span>;
          return <ChangeHunk key={s.id} seg={s} onAccept={() => setStatus(s.id, "accepted")} onReject={() => setStatus(s.id, "rejected")} />;
        })}
        <span className="whitespace-pre-wrap opacity-50">{after}</span>
      </div>
    </div>
  );
}

function ChangeHunk({
  seg,
  onAccept,
  onReject,
}: {
  seg: Extract<Segment, { kind: "change" }>;
  onAccept: () => void;
  onReject: () => void;
}) {
  const rejected = seg.status === "rejected";
  return (
    <span className="group relative inline">
      {/* removed text: struck when its deletion is accepted, normal when rejected */}
      {seg.removed && (
        <span className={`whitespace-pre-wrap ${rejected ? "" : "bg-red-100 text-red-700 line-through decoration-red-400"}`}>
          {seg.removed}
        </span>
      )}
      {/* added text: shown when accepted, struck/faded when rejected */}
      {seg.added && (
        <span className={`whitespace-pre-wrap ${rejected ? "opacity-40 line-through" : "bg-green-100 text-green-800"}`}>
          {seg.added}
        </span>
      )}
      {/* inline accept/reject controls */}
      <span className="relative -top-0.5 mx-0.5 inline-flex select-none gap-0.5 align-middle text-[11px]">
        <button
          onClick={onReject}
          title="Reject"
          className={`rounded px-1 leading-none ${rejected ? "bg-neutral-700 text-white" : "bg-black/10 text-neutral-500 hover:bg-black/20"}`}
        >
          ✗
        </button>
        <button
          onClick={onAccept}
          title="Accept"
          className={`rounded px-1 leading-none ${!rejected ? "bg-green-600 text-white" : "bg-black/10 text-neutral-500 hover:bg-green-200"}`}
        >
          ✓
        </button>
      </span>
    </span>
  );
}
