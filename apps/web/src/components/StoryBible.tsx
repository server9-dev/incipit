import { useMemo, useState } from "react";
import {
  ENTITY_TYPE_LABELS,
  ENTITY_TEMPLATES,
  LONG_FIELDS,
  parseProfile,
  type Entity,
  type EntityType,
  type EntityProfile,
} from "@incipit/shared";

const TYPE_ORDER: EntityType[] = ["character", "location", "item", "lore", "term"];

type EntityPatch = Partial<Pick<Entity, "name" | "summary" | "notes" | "profile">>;

/** Read an image file, downscaling to a small JPEG data URL so portraits don't bloat the store. */
function readScaledImage(file: File, max = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const data = String(reader.result);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(data);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => resolve(data);
      img.src = data;
    };
    reader.readAsDataURL(file);
  });
}

type Tree = Entity & { children: Tree[] };

function buildTrees(entities: Entity[]): Map<string | null, Tree[]> {
  const map = new Map<string, Tree>();
  entities.forEach((e) => map.set(e.id, { ...e, children: [] }));
  const byParent = new Map<string | null, Tree[]>();
  for (const t of map.values()) {
    const pid = t.parentId && map.has(t.parentId) ? t.parentId : null;
    (byParent.get(pid) ?? byParent.set(pid, []).get(pid)!).push(t);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  // attach children
  for (const [pid, list] of byParent) {
    if (pid && map.has(pid)) map.get(pid)!.children = list;
  }
  return byParent;
}

type RowProps = {
  e: Tree;
  depth: number;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  childParent: string | null;
  setChildParent: (id: string | null) => void;
  childName: string;
  setChildName: (s: string) => void;
  onUpdate: (id: string, patch: EntityPatch) => void;
  onDelete: (id: string) => void;
  addChild: (parentId: string, type: EntityType) => void;
  entityNames: Map<string, string>;
  options: { id: string; name: string }[];
};

// Defined at module scope (not inside StoryBible) so its identity is stable
// across renders — otherwise every keystroke would remount the row and steal
// focus from the field being edited.
function EntityRow(props: RowProps) {
  const { e, depth, openId, setOpenId, childParent, setChildParent, childName, setChildName, onUpdate, onDelete, addChild, entityNames, options } = props;
  const open = openId === e.id;

  const profile = parseProfile(e.profile);
  const setProfile = (p: EntityProfile) => onUpdate(e.id, { profile: JSON.stringify(p) });
  const setFieldVal = (label: string, v: string) => setProfile({ ...profile, fields: { ...profile.fields, [label]: v } });
  const addRel = (id: string) => setProfile({ ...profile, relationships: [...profile.relationships, { id, label: "" }] });
  const setRelLabel = (i: number, label: string) =>
    setProfile({ ...profile, relationships: profile.relationships.map((r, idx) => (idx === i ? { ...r, label } : r)) });
  const removeRel = (i: number) => setProfile({ ...profile, relationships: profile.relationships.filter((_, idx) => idx !== i) });
  const relOptions = options.filter((o) => o.id !== e.id && !profile.relationships.some((r) => r.id === o.id));

  return (
    <div className="mb-1">
      <div className="rounded-lg border border-linesoft bg-surface" style={{ marginLeft: depth * 10 }}>
        <button
          onClick={() => setOpenId(open ? null : e.id)}
          className="flex w-full items-center justify-between px-2.5 py-1.5 text-left"
        >
          <span className="flex min-w-0 items-center gap-1">
            {depth > 0 && <span className="text-mute">↳</span>}
            <span className="truncate text-sm font-medium text-fg">{e.name}</span>
            {e.children.length > 0 && <span className="text-[10px] text-mute">({e.children.length})</span>}
          </span>
          <span className="text-xs text-mute">{open ? "−" : "+"}</span>
        </button>
        {open && (
          <div className="space-y-1.5 border-t border-linesoft p-2">
            <input
              value={e.name}
              onChange={(ev) => onUpdate(e.id, { name: ev.target.value })}
              className="w-full rounded border border-linesoft px-2 py-1 text-xs outline-none focus:border-brand"
            />
            <input
              value={e.summary}
              onChange={(ev) => onUpdate(e.id, { summary: ev.target.value })}
              placeholder="One-line summary (AI sees this)"
              className="w-full rounded border border-linesoft px-2 py-1 text-xs outline-none focus:border-brand"
            />
            <textarea
              value={e.notes}
              onChange={(ev) => onUpdate(e.id, { notes: ev.target.value })}
              placeholder="Details, backstory, traits…"
              rows={3}
              className="w-full resize-y rounded border border-linesoft px-2 py-1 text-xs outline-none focus:border-brand"
            />

            {/* portrait */}
            <div className="flex items-center gap-2 pt-1">
              {profile.image ? (
                <img src={profile.image} alt="" className="h-12 w-12 rounded border border-linesoft object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded border border-dashed border-linesoft text-lg text-mute">
                  ＋
                </div>
              )}
              <label className="cursor-pointer text-[11px] text-brand hover:underline">
                {profile.image ? "Change portrait" : "Add portrait"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(ev) => {
                    const f = ev.target.files?.[0];
                    ev.currentTarget.value = "";
                    if (f) void readScaledImage(f).then((img) => setProfile({ ...profile, image: img }));
                  }}
                />
              </label>
              {profile.image && (
                <button onClick={() => setProfile({ ...profile, image: "" })} className="text-[11px] text-mute hover:text-red-500">
                  Remove
                </button>
              )}
            </div>

            {/* templated profile fields */}
            <div className="space-y-1.5 border-t border-linesoft pt-2">
              {ENTITY_TEMPLATES[e.type].map((label) => (
                <label key={label} className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-mute">{label}</span>
                  {LONG_FIELDS.has(label) ? (
                    <textarea
                      value={profile.fields[label] ?? ""}
                      onChange={(ev) => setFieldVal(label, ev.target.value)}
                      rows={2}
                      className="mt-0.5 w-full resize-y rounded border border-linesoft px-2 py-1 text-xs outline-none focus:border-brand"
                    />
                  ) : (
                    <input
                      value={profile.fields[label] ?? ""}
                      onChange={(ev) => setFieldVal(label, ev.target.value)}
                      className="mt-0.5 w-full rounded border border-linesoft px-2 py-1 text-xs outline-none focus:border-brand"
                    />
                  )}
                </label>
              ))}
            </div>

            {/* relationships */}
            <div className="space-y-1 border-t border-linesoft pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-mute">Relationships</span>
              {profile.relationships.map((r, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input
                    value={r.label}
                    onChange={(ev) => setRelLabel(i, ev.target.value)}
                    placeholder="e.g. ally of"
                    className="w-24 shrink-0 rounded border border-linesoft px-1.5 py-1 text-[11px] outline-none focus:border-brand"
                  />
                  <button
                    onClick={() => setOpenId(r.id)}
                    className="min-w-0 flex-1 truncate text-left text-[11px] text-brand hover:underline"
                    title="Open this entity"
                  >
                    {entityNames.get(r.id) ?? "(deleted)"}
                  </button>
                  <button onClick={() => removeRel(i)} className="text-[11px] text-mute hover:text-red-500">
                    ✕
                  </button>
                </div>
              ))}
              {relOptions.length > 0 && (
                <select
                  value=""
                  onChange={(ev) => {
                    if (ev.target.value) addRel(ev.target.value);
                    ev.currentTarget.value = "";
                  }}
                  className="w-full rounded border border-linesoft bg-surface px-1.5 py-1 text-[11px] text-mute outline-none"
                >
                  <option value="">+ Link to another entity…</option>
                  {relOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setChildParent(childParent === e.id ? null : e.id);
                  setChildName("");
                }}
                className="text-[11px] text-brand hover:underline"
              >
                + sub-item
              </button>
              <button onClick={() => onDelete(e.id)} className="text-[11px] text-mute hover:text-red-500">
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
      {childParent === e.id && (
        <input
          autoFocus
          value={childName}
          onChange={(ev) => setChildName(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") addChild(e.id, e.type);
            if (ev.key === "Escape") setChildParent(null);
          }}
          onBlur={() => childName.trim() && addChild(e.id, e.type)}
          placeholder={`Add ${ENTITY_TYPE_LABELS[e.type].replace(/s$/, "").toLowerCase()} inside “${e.name}”…`}
          className="mb-1 w-full rounded border border-brand bg-surface px-2 py-1 text-xs outline-none"
          style={{ marginLeft: (depth + 1) * 10 }}
        />
      )}
      {e.children.map((c) => (
        <EntityRow key={c.id} {...props} e={c} depth={depth + 1} />
      ))}
    </div>
  );
}

export function StoryBible({
  entities,
  projectId,
  onCreate,
  onUpdate,
  onDelete,
  pinned,
  onTogglePin,
}: {
  entities: Entity[];
  projectId: string;
  onCreate: (type: EntityType, name: string, parentId?: string | null) => void;
  onUpdate: (id: string, patch: EntityPatch) => void;
  onDelete: (id: string) => void;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<EntityType>("character");
  // which entity is currently showing its "add sub-item" input
  const [childParent, setChildParent] = useState<string | null>(null);
  const [childName, setChildName] = useState("");

  void projectId;

  const trees = useMemo(() => buildTrees(entities), [entities]);
  const roots = trees.get(null) ?? [];
  const entityNames = useMemo(() => new Map(entities.map((e) => [e.id, e.name] as const)), [entities]);
  const options = useMemo(
    () => entities.map((e) => ({ id: e.id, name: e.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [entities],
  );

  function addChild(parentId: string, type: EntityType) {
    const name = childName.trim();
    if (!name) return;
    onCreate(type, name, parentId);
    setChildName("");
    setChildParent(null);
  }

  const rowProps = { openId, setOpenId, childParent, setChildParent, childName, setChildName, onUpdate, onDelete, addChild, entityNames, options };

  return (
    <>
      <div className="flex items-center justify-between border-b border-linesoft px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-mute">Story bible</span>
        <button
          onClick={onTogglePin}
          title={pinned ? "Unlock — auto-hide the story bible" : "Lock the story bible open"}
          className="text-xs text-mute hover:text-fg"
        >
          {pinned ? "🔒" : "🔓"}
        </button>
      </div>

      <div className="flex gap-1 border-b border-linesoft p-2">
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as EntityType)}
          className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs outline-none"
        >
          {TYPE_ORDER.map((t) => (
            <option key={t} value={t}>
              {ENTITY_TYPE_LABELS[t].replace(/s$/, "")}
            </option>
          ))}
        </select>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              onCreate(newType, newName.trim());
              setNewName("");
            }
          }}
          placeholder="Add name…"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-brand"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {TYPE_ORDER.map((type) => {
          const items = roots.filter((e) => e.type === type);
          if (!items.length) return null;
          return (
            <div key={type} className="mb-3">
              <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-mute">
                {ENTITY_TYPE_LABELS[type]}
              </div>
              {items.map((e) => (
                <EntityRow key={e.id} e={e} depth={0} {...rowProps} />
              ))}
            </div>
          );
        })}
        {entities.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-mute">
            Add characters, locations, and lore. The AI uses these to stay consistent when drafting.
            Open one and choose “+ sub-item” to nest details (e.g. a country → provinces → cities).
          </p>
        )}
      </div>
    </>
  );
}
