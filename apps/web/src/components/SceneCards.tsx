import { useMemo, useRef, useState } from "react";
import type { StoryNode } from "@incipit/shared";

/* ------------------------------------------------------------------ *
 * Scene cards — an index-card outliner that mirrors the user's
 * "Ultimate Scene Card" template: a header (act / scene / POV), an
 * alpha point, two colour-tagged subplots, and a 2×2 plot/story grid
 * (cause → effect, why-it-matters → realization). Cards are linked to
 * the manuscript: editing writes back to the scene node, dragging
 * reorders it, and "open" jumps to the prose.
 * ------------------------------------------------------------------ */

type Layout = "corkboard" | "grid" | "columns";
type Sections = { alpha: boolean; subplots: boolean; plot: boolean; story: boolean };

const LAYOUTS: { key: Layout; label: string }[] = [
  { key: "corkboard", label: "Corkboard by chapter" },
  { key: "grid", label: "One grid" },
  { key: "columns", label: "Columns by chapter" },
];

const SECTION_LABELS: { key: keyof Sections; label: string }[] = [
  { key: "alpha", label: "Alpha point" },
  { key: "subplots", label: "Subplots" },
  { key: "plot", label: "The plot" },
  { key: "story", label: "The story" },
];

// subplot thread colours — also used as the card's at-a-glance accent
const SUB_COLORS = ["#00D4FF", "#9B59B6", "#FF0080", "#F5A623", "#2ECC71", "#FF5E5E"];

/* ------------------------------- card data ------------------------------ */

type Subplot = { color: string; text: string };
type CardData = {
  alphaPoint: string;
  subplots: Subplot[];
  cause: string;
  effect: string;
  whyItMatters: string;
  realization: string;
};

const emptyCard = (): CardData => ({
  alphaPoint: "",
  subplots: [
    { color: SUB_COLORS[0]!, text: "" },
    { color: SUB_COLORS[1]!, text: "" },
  ],
  cause: "",
  effect: "",
  whyItMatters: "",
  realization: "",
});

function parseCard(s: string): CardData {
  const base = emptyCard();
  if (!s) return base;
  try {
    const o = JSON.parse(s) as Partial<CardData>;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    return {
      alphaPoint: str(o.alphaPoint),
      subplots:
        Array.isArray(o.subplots) && o.subplots.length
          ? o.subplots.map((p, i) => ({
              color: typeof p?.color === "string" ? p.color : SUB_COLORS[i % SUB_COLORS.length]!,
              text: str(p?.text),
            }))
          : base.subplots,
      cause: str(o.cause),
      effect: str(o.effect),
      whyItMatters: str(o.whyItMatters),
      realization: str(o.realization),
    };
  } catch {
    return base;
  }
}

/* ----------------------------- grouping/order --------------------------- */

type Group = { key: string; parentId: string | null; title: string; cards: StoryNode[] };

/** Walk the tree in manuscript order; bucket leaf scenes under their chapter
 *  (chapters appear even when empty so you can drop into them). */
function buildGroups(nodes: StoryNode[]): { groups: Group[]; flat: StoryNode[] } {
  const childrenOf = new Map<string | null, StoryNode[]>();
  for (const n of nodes) {
    const k = n.parentId ?? null;
    if (!childrenOf.has(k)) childrenOf.set(k, []);
    childrenOf.get(k)!.push(n);
  }
  for (const list of childrenOf.values()) list.sort((a, b) => a.order - b.order);
  const titleById = new Map(nodes.map((n) => [n.id, n.title] as const));

  const groups: Group[] = [];
  const byKey = new Map<string, Group>();
  const flat: StoryNode[] = [];
  const ensure = (parentId: string | null, title: string): Group => {
    const key = parentId ?? "__root__";
    let g = byKey.get(key);
    if (!g) {
      g = { key, parentId, title, cards: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    return g;
  };

  const walk = (parentId: string | null) => {
    for (const n of childrenOf.get(parentId) ?? []) {
      if (n.type === "chapter") {
        ensure(n.id, n.title); // surface empty chapters as drop targets
        walk(n.id);
      } else if (n.type === "folder") {
        walk(n.id);
      } else {
        const title = parentId == null ? "Top level" : titleById.get(parentId) ?? "Top level";
        ensure(parentId, title).cards.push(n);
        flat.push(n);
      }
    }
  };
  walk(null);
  return { groups, flat };
}

/* ------------------------------- component ------------------------------ */

export function SceneCards({
  nodes,
  selectedId,
  onJump,
  onMove,
  onPatch,
  onClose,
}: {
  nodes: StoryNode[];
  selectedId: string | null;
  onJump: (id: string) => void;
  onMove: (nodeId: string, parentId: string | null, index: number) => void;
  onPatch: (id: string, patch: Partial<StoryNode>) => void;
  onClose: () => void;
}) {
  const [layout, setLayoutState] = useState<Layout>(
    () => (localStorage.getItem("incipit-cards-layout") as Layout) || "corkboard",
  );
  const [reorder, setReorder] = useState(() => localStorage.getItem("incipit-cards-reorder") === "1");
  const [sections, setSections] = useState<Sections>(() => {
    const def: Sections = { alpha: true, subplots: true, plot: true, story: true };
    try {
      return { ...def, ...(JSON.parse(localStorage.getItem("incipit-cards-sections") || "{}") as Partial<Sections>) };
    } catch {
      return def;
    }
  });
  const setLayout = (l: Layout) => {
    setLayoutState(l);
    localStorage.setItem("incipit-cards-layout", l);
  };
  const toggleReorder = () =>
    setReorder((r) => {
      localStorage.setItem("incipit-cards-reorder", r ? "0" : "1");
      return !r;
    });
  const toggleSection = (k: keyof Sections) =>
    setSections((s) => {
      const next = { ...s, [k]: !s[k] };
      localStorage.setItem("incipit-cards-sections", JSON.stringify(next));
      return next;
    });

  const { groups, flat } = useMemo(() => buildGroups(nodes), [nodes]);
  const flatIndex = useMemo(() => new Map(flat.map((n, i) => [n.id, i] as const)), [flat]);
  const titleById = useMemo(() => new Map(nodes.map((n) => [n.id, n.title] as const)), [nodes]);

  /* ------------------------------ drag & drop ----------------------------- */
  const draggedRef = useRef<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [hint, setHint] = useState<{ id: string; zone: "before" | "after" } | null>(null);

  const siblingsOf = (parentId: string | null) =>
    nodes.filter((n) => n.parentId === parentId && n.id !== draggedRef.current).sort((a, b) => a.order - b.order);

  const endDrag = () => {
    draggedRef.current = null;
    setDragged(null);
    setHint(null);
  };
  const startDrag = (id: string) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    draggedRef.current = id;
    setDragged(id);
  };
  const onCardDragOver = (card: StoryNode, vertical: boolean) => (e: React.DragEvent) => {
    if (!draggedRef.current || draggedRef.current === card.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const r = e.currentTarget.getBoundingClientRect();
    const rel = vertical ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
    const zone: "before" | "after" = rel < 0.5 ? "before" : "after";
    if (hint?.id !== card.id || hint.zone !== zone) setHint({ id: card.id, zone });
  };
  const onCardDrop = (card: StoryNode) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const id = draggedRef.current;
    const zone = hint?.zone ?? "before";
    if (id && id !== card.id) {
      const sibs = siblingsOf(card.parentId);
      const t = sibs.findIndex((s) => s.id === card.id);
      if (t >= 0) onMove(id, card.parentId, zone === "before" ? t : t + 1);
    }
    endDrag();
  };
  const onGroupDrop = (parentId: string | null) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = draggedRef.current;
    if (id) onMove(id, parentId, siblingsOf(parentId).length); // append at the end
    endDrag();
  };
  const allowGroupDrop = (e: React.DragEvent) => {
    if (draggedRef.current) e.preventDefault();
  };

  /* -------------------------------- a card -------------------------------- */
  const renderCard = (card: StoryNode, vertical: boolean) => {
    const data = parseCard(card.card || "");
    const patchCard = (p: Partial<CardData>) => onPatch(card.id, { card: JSON.stringify({ ...data, ...p }) });
    const patchSubplot = (i: number, p: Partial<Subplot>) =>
      patchCard({ subplots: data.subplots.map((s, idx) => (idx === i ? { ...s, ...p } : s)) });
    const cycleColor = (i: number) => {
      const cur = SUB_COLORS.indexOf(data.subplots[i]!.color);
      patchSubplot(i, { color: SUB_COLORS[(cur + 1) % SUB_COLORS.length]! });
    };

    const sceneNo = (flatIndex.get(card.id) ?? 0) + 1;
    const chapter = card.parentId ? titleById.get(card.parentId) ?? "Top level" : "Top level";
    const accent = data.subplots[0]?.color ?? SUB_COLORS[0]!;
    const isSel = selectedId === card.id;
    const isDragged = dragged === card.id;
    const showHint = hint?.id === card.id ? hint.zone : null;

    const quad = (label: string, sub: string, value: string, set: (v: string) => void) => (
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-mute">{label}</div>
        <div className="text-[11px] font-medium text-dim">{sub}</div>
        <textarea
          value={value}
          onChange={(e) => set(e.target.value)}
          onDragStart={(e) => e.preventDefault()}
          rows={3}
          className="w-full flex-1 resize-none rounded bg-surface px-2 py-1 text-[12px] leading-snug text-fg outline-none focus:bg-elevated"
        />
      </div>
    );

    return (
      <div
        key={card.id}
        onDragOver={onCardDragOver(card, vertical)}
        onDrop={onCardDrop(card)}
        onDoubleClick={() => onJump(card.id)}
        title="Double-click to open this scene"
        className={`relative flex w-[340px] flex-col overflow-hidden rounded-lg border bg-void shadow-sm transition ${
          isSel ? "border-brand" : "border-line"
        } ${isDragged ? "opacity-40" : ""}`}
        style={{ borderLeft: `4px solid ${accent}` }}
      >
        {showHint === "before" && (
          <span className={`pointer-events-none absolute z-10 rounded bg-brand ${vertical ? "inset-x-2 -top-px h-0.5" : "inset-y-2 -left-px w-0.5"}`} />
        )}
        {showHint === "after" && (
          <span className={`pointer-events-none absolute z-10 rounded bg-brand ${vertical ? "inset-x-2 -bottom-px h-0.5" : "inset-y-2 -right-px w-0.5"}`} />
        )}

        {/* header */}
        <div className="flex items-start gap-2 border-b border-linesoft px-3 py-2">
          {reorder && (
            <span
              draggable
              onDragStart={startDrag(card.id)}
              onDragEnd={endDrag}
              title="Drag to reorder"
              className="mt-0.5 cursor-grab select-none text-mute hover:text-fg"
            >
              ⠿
            </span>
          )}
          <div className="min-w-0 flex-1">
            <input
              value={card.title}
              onChange={(e) => onPatch(card.id, { title: e.target.value })}
              onDragStart={(e) => e.preventDefault()}
              placeholder="Untitled scene"
              className="w-full bg-transparent text-sm font-semibold text-fg outline-none"
            />
            <div className="mt-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-mute">
              <span className="truncate">{chapter} · Scene {sceneNo}</span>
              <span>—</span>
              <input
                value={card.pov}
                onChange={(e) => onPatch(card.id, { pov: e.target.value })}
                onDragStart={(e) => e.preventDefault()}
                placeholder="POV"
                className="min-w-0 flex-1 bg-transparent uppercase tracking-wide text-dim outline-none placeholder:text-mute"
              />
            </div>
          </div>
          <button
            onClick={() => onJump(card.id)}
            title="Open this scene in the editor"
            className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-dim hover:bg-elevated"
          >
            Open ↗
          </button>
        </div>

        {/* alpha point + subplots */}
        {(sections.alpha || sections.subplots) && (
          <div className="space-y-1.5 border-b border-linesoft px-3 py-2">
            {sections.alpha && (
              <label className="flex items-baseline gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-mute">Alpha</span>
                <input
                  value={data.alphaPoint}
                  onChange={(e) => patchCard({ alphaPoint: e.target.value })}
                  onDragStart={(e) => e.preventDefault()}
                  placeholder="The scene's alpha point"
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-fg outline-none placeholder:text-mute"
                />
              </label>
            )}
            {sections.subplots &&
              data.subplots.map((sp, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    onClick={() => cycleColor(i)}
                    title="Click to change this subplot's colour"
                    className="h-3 w-3 shrink-0 rounded-full border border-line"
                    style={{ background: sp.color }}
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-mute">Subplot</span>
                  <input
                    value={sp.text}
                    onChange={(e) => patchSubplot(i, { text: e.target.value })}
                    onDragStart={(e) => e.preventDefault()}
                    placeholder="—"
                    className="min-w-0 flex-1 bg-transparent text-[12px] text-dim outline-none placeholder:text-mute"
                  />
                </div>
              ))}
          </div>
        )}

        {/* the plot: cause → effect */}
        {sections.plot && (
          <div className="flex border-b border-linesoft">
            <div className="flex w-14 shrink-0 items-center justify-center border-r border-linesoft px-1 text-center text-[9px] font-semibold uppercase leading-tight tracking-wide text-mute">
              The Plot
            </div>
            {quad("Cause", "What happens", data.cause, (v) => patchCard({ cause: v }))}
            <div className="w-px shrink-0 bg-linesoft" />
            {quad("Effect", "The consequence", data.effect, (v) => patchCard({ effect: v }))}
          </div>
        )}

        {/* the story: why it matters → realization */}
        {sections.story && (
          <div className="flex">
            <div className="flex w-14 shrink-0 items-center justify-center border-r border-linesoft px-1 text-center text-[9px] font-semibold uppercase leading-tight tracking-wide text-mute">
              The Story
            </div>
            {quad("Why it matters", "", data.whyItMatters, (v) => patchCard({ whyItMatters: v }))}
            <div className="w-px shrink-0 bg-linesoft" />
            {quad("The realization", "And so?", data.realization, (v) => patchCard({ realization: v }))}
          </div>
        )}
      </div>
    );
  };

  /* ------------------------------- the board ------------------------------ */
  const board = () => {
    if (flat.length === 0) {
      return (
        <div className="flex h-full items-center justify-center text-mute">
          No scenes yet — add scenes in the manuscript to see them here.
        </div>
      );
    }
    if (layout === "grid") {
      return <div className="flex flex-wrap content-start gap-3 p-4">{flat.map((c) => renderCard(c, false))}</div>;
    }
    if (layout === "columns") {
      return (
        <div className="flex h-full gap-3 overflow-x-auto p-4">
          {groups.map((g) => (
            <section
              key={g.key}
              onDragOver={allowGroupDrop}
              onDrop={onGroupDrop(g.parentId)}
              className="flex w-[356px] shrink-0 flex-col rounded-lg bg-surface/40 p-2"
            >
              <h3 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-dim">
                {g.title} <span className="text-mute">· {g.cards.length}</span>
              </h3>
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
                {g.cards.map((c) => renderCard(c, true))}
                {g.cards.length === 0 && (
                  <div className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-mute">
                    Drop scenes here
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      );
    }
    // corkboard — sections stacked, cards wrap within each chapter
    return (
      <div className="space-y-5 p-4">
        {groups.map((g) => (
          <section key={g.key} onDragOver={allowGroupDrop} onDrop={onGroupDrop(g.parentId)}>
            <h3 className="mb-2 border-b border-linesoft pb-1 text-xs font-semibold uppercase tracking-wide text-dim">
              {g.title} <span className="text-mute">· {g.cards.length}</span>
            </h3>
            <div className="flex flex-wrap gap-3">
              {g.cards.map((c) => renderCard(c, false))}
              {g.cards.length === 0 && (
                <div className="rounded-lg border border-dashed border-line px-6 py-4 text-center text-xs text-mute">
                  Drop scenes here
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void text-fg">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-linesoft px-4 py-2">
        <span className="text-sm font-semibold">Scene cards</span>
        <select
          value={layout}
          onChange={(e) => setLayout(e.target.value as Layout)}
          className="rounded border border-line bg-surface px-2 py-1 text-xs text-dim outline-none"
        >
          {LAYOUTS.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label}
            </option>
          ))}
        </select>

        <button
          onClick={toggleReorder}
          title={reorder ? "Cards are draggable — drag the grip to reorder the manuscript" : "Click cards to read; turn on to drag-reorder"}
          className={`rounded-md border px-3 py-1 text-xs font-medium ${
            reorder ? "border-brand bg-brand text-ink" : "border-line text-dim hover:bg-elevated"
          }`}
        >
          {reorder ? "Reorder: on" : "Reorder: off"}
        </button>

        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-mute">Show</span>
          {SECTION_LABELS.map((s) => (
            <button
              key={s.key}
              onClick={() => toggleSection(s.key)}
              className={`rounded border px-2 py-0.5 text-[11px] ${
                sections[s.key] ? "border-brand/60 bg-brand/10 text-fg" : "border-line text-mute hover:text-dim"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs text-mute">{flat.length} scenes</span>
        <button
          onClick={onClose}
          className="rounded-md border border-line px-3 py-1 text-xs font-medium text-dim hover:bg-elevated"
        >
          Close ✕
        </button>
      </div>

      {/* board */}
      <div className="min-h-0 flex-1 overflow-auto">{board()}</div>
    </div>
  );
}
