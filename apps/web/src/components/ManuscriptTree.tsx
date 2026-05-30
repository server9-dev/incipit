import { useMemo, useRef, useState } from "react";
import { allowedChildTypes, canContain, type StoryNode, type NodeType } from "@incipit/shared";

type TreeItem = StoryNode & { children: TreeItem[] };
type Zone = "before" | "after" | "inside";
type DropHint = { id: string; zone: Zone };
type DropTarget = { parentId: string | null; index: number; zone: Zone };

function buildTree(nodes: StoryNode[]): TreeItem[] {
  const map = new Map<string, TreeItem>();
  nodes.forEach((n) => map.set(n.id, { ...n, children: [] }));
  const roots: TreeItem[] = [];
  for (const item of map.values()) {
    if (item.parentId && map.has(item.parentId)) map.get(item.parentId)!.children.push(item);
    else roots.push(item);
  }
  const sort = (list: TreeItem[]) => {
    list.sort((a, b) => a.order - b.order);
    list.forEach((i) => sort(i.children));
  };
  sort(roots);
  return roots;
}

const CHILD_OPTIONS: Record<NodeType, { type: NodeType; label: string }[]> = {
  folder: [
    { type: "chapter", label: "+ Chapter" },
    { type: "folder", label: "+ Section" },
    { type: "poem", label: "+ Poem" },
  ],
  chapter: [{ type: "scene", label: "+ Scene" }],
  scene: [],
  poem: [],
};

const ICON: Record<NodeType, string> = { folder: "▸", chapter: "▤", scene: "·", poem: "❧" };

export function ManuscriptTree({
  nodes,
  selectedId,
  onSelect,
  onAdd,
  onAddRoot,
  onDelete,
  onMove,
  onRename,
  onAddFrontMatter,
}: {
  nodes: StoryNode[];
  selectedId: string | null;
  onSelect: (n: StoryNode) => void;
  onAdd: (parent: StoryNode, type: NodeType) => void;
  onAddRoot: (type: NodeType) => void;
  onDelete: (n: StoryNode) => void;
  onMove: (nodeId: string, parentId: string | null, index: number) => void;
  onRename: (id: string, title: string) => void;
  onAddFrontMatter: (title: string) => void;
}) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const [draggedId, setDraggedId] = useState<string | null>(null); // for the dragging row's dimming
  const draggedIdRef = useRef<string | null>(null); // read synchronously during dragover (state lags a render)
  const [hint, setHint] = useState<DropHint | null>(null);

  const descendantsOf = (id: string): Set<string> => {
    const out = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const n of nodes)
        if (n.parentId === cur && !out.has(n.id)) {
          out.add(n.id);
          stack.push(n.id);
        }
    }
    return out;
  };

  /** Resolve where a drop on `item` at vertical ratio `rel` would land. */
  const computeDrop = (item: StoryNode, rel: number): DropTarget | null => {
    const draggedId = draggedIdRef.current; // live value, not the lagging state
    if (!draggedId || draggedId === item.id) return null;
    const dragged = byId.get(draggedId);
    if (!dragged) return null;
    if (descendantsOf(draggedId).has(item.id)) return null; // into own subtree

    const canInside = allowedChildTypes(item.type).length > 0 && canContain(item.type, dragged.type);
    const zone: Zone = canInside ? (rel < 0.3 ? "before" : rel > 0.7 ? "after" : "inside") : rel < 0.5 ? "before" : "after";

    const intoEnd = (parentId: string): DropTarget => ({
      parentId,
      index: nodes.filter((n) => n.parentId === parentId && n.id !== draggedId).length,
      zone: "inside",
    });

    if (zone === "inside") return intoEnd(item.id);

    const parentId = item.parentId;
    const parentType = parentId ? (byId.get(parentId)?.type ?? null) : null;
    if (!canContain(parentType, dragged.type)) return canInside ? intoEnd(item.id) : null;

    const sibs = nodes.filter((n) => n.parentId === parentId && n.id !== draggedId).sort((a, b) => a.order - b.order);
    const t = sibs.findIndex((s) => s.id === item.id);
    return { parentId, index: zone === "before" ? t : t + 1, zone };
  };

  const relOf = (e: React.DragEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return (e.clientY - r.top) / r.height;
  };

  const onRowDragOver = (item: StoryNode) => (e: React.DragEvent) => {
    const drop = computeDrop(item, relOf(e));
    if (!drop) {
      if (hint) setHint(null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (hint?.id !== item.id || hint.zone !== drop.zone) setHint({ id: item.id, zone: drop.zone });
  };

  const onRowDrop = (item: StoryNode) => (e: React.DragEvent) => {
    const drop = computeDrop(item, relOf(e));
    e.preventDefault();
    const dragId = draggedIdRef.current;
    if (drop && dragId) onMove(dragId, drop.parentId, drop.index);
    draggedIdRef.current = null;
    setDraggedId(null);
    setHint(null);
  };

  return (
    <div className="flex-1 overflow-y-auto px-2 py-2">
      {tree.map((item) => (
        <Row
          key={item.id}
          item={item}
          depth={0}
          selectedId={selectedId}
          draggedId={draggedId}
          hint={hint}
          onSelect={onSelect}
          onAdd={onAdd}
          onDelete={onDelete}
          onRename={onRename}
          onDragStart={(id) => {
            draggedIdRef.current = id;
            setDraggedId(id);
          }}
          onDragEnd={() => {
            draggedIdRef.current = null;
            setDraggedId(null);
            setHint(null);
          }}
          onRowDragOver={onRowDragOver}
          onRowDrop={onRowDrop}
        />
      ))}
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-linesoft px-1 pt-2">
        {(["folder", "chapter", "scene", "poem"] as NodeType[]).map((t) => (
          <button key={t} onClick={() => onAddRoot(t)} className="text-[11px] text-mute hover:text-fg">
            + {t === "folder" ? "Section" : t[0]!.toUpperCase() + t.slice(1)}
          </button>
        ))}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onAddFrontMatter(e.target.value);
            e.currentTarget.value = "";
          }}
          className="rounded border border-linesoft bg-surface px-1 py-0.5 text-[11px] text-mute outline-none"
          title="Add front matter to the top of the manuscript"
        >
          <option value="">+ Front matter…</option>
          {["Title Page", "Copyright", "Dedication", "Acknowledgements", "Prologue"].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Row({
  item,
  depth,
  selectedId,
  draggedId,
  hint,
  onSelect,
  onAdd,
  onDelete,
  onRename,
  onDragStart,
  onDragEnd,
  onRowDragOver,
  onRowDrop,
}: {
  item: TreeItem;
  depth: number;
  selectedId: string | null;
  draggedId: string | null;
  hint: DropHint | null;
  onSelect: (n: StoryNode) => void;
  onAdd: (parent: StoryNode, type: NodeType) => void;
  onDelete: (n: StoryNode) => void;
  onRename: (id: string, title: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onRowDragOver: (item: StoryNode) => (e: React.DragEvent) => void;
  onRowDrop: (item: StoryNode) => (e: React.DragEvent) => void;
}) {
  const selected = selectedId === item.id;
  const dragging = draggedId === item.id;
  const showHint = hint?.id === item.id ? hint.zone : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const beginRename = () => {
    setDraft(item.title);
    setEditing(true);
  };
  const commitRename = () => {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== item.title) onRename(item.id, t);
  };

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", item.id);
          onDragStart(item.id);
        }}
        onDragEnd={onDragEnd}
        onDragOver={onRowDragOver(item)}
        onDrop={onRowDrop(item)}
        className={`group relative flex items-center gap-1 rounded-md py-1 pr-1 text-sm ${
          selected ? "bg-brand text-ink" : "hover:bg-elevated"
        } ${dragging ? "opacity-40" : ""} ${showHint === "inside" ? "ring-2 ring-brand" : ""}`}
        style={{ paddingLeft: depth * 14 + 6 }}
      >
        {showHint === "before" && <span className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded bg-brand" />}
        {showHint === "after" && <span className="pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded bg-brand" />}
        <span className="w-3 shrink-0 cursor-grab text-center text-xs opacity-60">{ICON[item.type]}</span>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditing(false);
            }}
            onDragStart={(e) => e.preventDefault()}
            className="flex-1 rounded bg-surface px-1 text-sm text-fg outline-none ring-1 ring-brand"
          />
        ) : (
          <button
            onClick={() => onSelect(item)}
            onDoubleClick={beginRename}
            title="Double-click to rename"
            className="flex-1 truncate text-left"
          >
            {item.title}
            {item.type !== "folder" && item.wordCount > 0 && (
              <span className={`ml-1 text-[10px] ${selected ? "text-ink/70" : "text-mute"}`}>{item.wordCount}w</span>
            )}
          </button>
        )}
        <button
          onClick={() => onDelete(item)}
          className={`px-1 text-xs opacity-0 transition group-hover:opacity-100 ${
            selected ? "text-ink/70 hover:text-red-300" : "text-mute hover:text-red-500"
          }`}
          title="Delete"
        >
          ✕
        </button>
      </div>

      {item.children.map((c) => (
        <Row
          key={c.id}
          item={c}
          depth={depth + 1}
          selectedId={selectedId}
          draggedId={draggedId}
          hint={hint}
          onSelect={onSelect}
          onAdd={onAdd}
          onDelete={onDelete}
          onRename={onRename}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onRowDragOver={onRowDragOver}
          onRowDrop={onRowDrop}
        />
      ))}

      {CHILD_OPTIONS[item.type].length > 0 && (
        <div className="flex flex-wrap gap-1 pb-1" style={{ paddingLeft: (depth + 1) * 14 + 6 }}>
          {CHILD_OPTIONS[item.type].map((opt) => (
            <button key={opt.type} onClick={() => onAdd(item, opt.type)} className="text-[11px] text-mute hover:text-fg">
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
