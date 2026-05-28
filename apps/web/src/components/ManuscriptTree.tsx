import type { StoryNode, NodeType } from "@incipit/shared";

type TreeItem = StoryNode & { children: TreeItem[] };

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

// what you can add inside a node of a given type
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

function Row({
  item,
  depth,
  selectedId,
  onSelect,
  onAdd,
  onDelete,
}: {
  item: TreeItem;
  depth: number;
  selectedId: string | null;
  onSelect: (n: StoryNode) => void;
  onAdd: (parent: StoryNode, type: NodeType) => void;
  onDelete: (n: StoryNode) => void;
}) {
  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-md py-1 pr-1 text-sm ${
          selectedId === item.id ? "bg-neutral-900 text-white" : "hover:bg-neutral-200"
        }`}
        style={{ paddingLeft: depth * 14 + 6 }}
      >
        <span className="w-3 shrink-0 text-center text-xs opacity-60">{ICON[item.type]}</span>
        <button onClick={() => onSelect(item)} className="flex-1 truncate text-left">
          {item.title}
          {item.type !== "folder" && item.wordCount > 0 && (
            <span className={`ml-1 text-[10px] ${selectedId === item.id ? "text-neutral-300" : "text-neutral-400"}`}>
              {item.wordCount}w
            </span>
          )}
        </button>
        <button
          onClick={() => onDelete(item)}
          className={`px-1 text-xs opacity-0 transition group-hover:opacity-100 ${
            selectedId === item.id ? "text-neutral-300 hover:text-red-300" : "text-neutral-400 hover:text-red-500"
          }`}
          title="Delete"
        >
          ✕
        </button>
      </div>
      {item.children.map((c) => (
        <Row key={c.id} item={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} onAdd={onAdd} onDelete={onDelete} />
      ))}
      {CHILD_OPTIONS[item.type].length > 0 && (
        <div className="flex flex-wrap gap-1 pb-1" style={{ paddingLeft: (depth + 1) * 14 + 6 }}>
          {CHILD_OPTIONS[item.type].map((opt) => (
            <button
              key={opt.type}
              onClick={() => onAdd(item, opt.type)}
              className="text-[11px] text-neutral-400 hover:text-neutral-900"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ManuscriptTree({
  nodes,
  selectedId,
  onSelect,
  onAdd,
  onAddRoot,
  onDelete,
}: {
  nodes: StoryNode[];
  selectedId: string | null;
  onSelect: (n: StoryNode) => void;
  onAdd: (parent: StoryNode, type: NodeType) => void;
  onAddRoot: (type: NodeType) => void;
  onDelete: (n: StoryNode) => void;
}) {
  const tree = buildTree(nodes);
  return (
    <div className="flex-1 overflow-y-auto px-2 py-2">
      {tree.map((item) => (
        <Row key={item.id} item={item} depth={0} selectedId={selectedId} onSelect={onSelect} onAdd={onAdd} onDelete={onDelete} />
      ))}
      <div className="mt-2 flex flex-wrap gap-2 border-t border-neutral-200 px-1 pt-2">
        <button onClick={() => onAddRoot("folder")} className="text-[11px] text-neutral-400 hover:text-neutral-900">
          + Section
        </button>
        <button onClick={() => onAddRoot("chapter")} className="text-[11px] text-neutral-400 hover:text-neutral-900">
          + Chapter
        </button>
        <button onClick={() => onAddRoot("scene")} className="text-[11px] text-neutral-400 hover:text-neutral-900">
          + Scene
        </button>
        <button onClick={() => onAddRoot("poem")} className="text-[11px] text-neutral-400 hover:text-neutral-900">
          + Poem
        </button>
      </div>
    </div>
  );
}
