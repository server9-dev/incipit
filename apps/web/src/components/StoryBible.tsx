import { useState } from "react";
import { ENTITY_TYPE_LABELS, type Entity, type EntityType } from "@firstdraft/shared";

const TYPE_ORDER: EntityType[] = ["character", "location", "item", "lore"];

export function StoryBible({
  entities,
  projectId,
  onCreate,
  onUpdate,
  onDelete,
}: {
  entities: Entity[];
  projectId: string;
  onCreate: (type: EntityType, name: string) => void;
  onUpdate: (id: string, patch: Partial<Pick<Entity, "name" | "summary" | "notes">>) => void;
  onDelete: (id: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<EntityType>("character");

  void projectId;

  return (
    <aside className="flex h-full w-72 flex-col border-l border-neutral-200 bg-neutral-50">
      <div className="border-b border-neutral-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        Story bible
      </div>

      <div className="flex gap-1 border-b border-neutral-200 p-2">
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as EntityType)}
          className="rounded-md border border-neutral-300 bg-white px-1.5 py-1 text-xs outline-none"
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
          className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs outline-none focus:border-neutral-900"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {TYPE_ORDER.map((type) => {
          const items = entities.filter((e) => e.type === type);
          if (!items.length) return null;
          return (
            <div key={type} className="mb-3">
              <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {ENTITY_TYPE_LABELS[type]}
              </div>
              {items.map((e) => (
                <div key={e.id} className="mb-1 rounded-lg border border-neutral-200 bg-white">
                  <button
                    onClick={() => setOpenId(openId === e.id ? null : e.id)}
                    className="flex w-full items-center justify-between px-2.5 py-1.5 text-left"
                  >
                    <span className="truncate text-sm font-medium text-neutral-800">{e.name}</span>
                    <span className="text-xs text-neutral-400">{openId === e.id ? "−" : "+"}</span>
                  </button>
                  {openId === e.id && (
                    <div className="space-y-1.5 border-t border-neutral-100 p-2">
                      <input
                        value={e.name}
                        onChange={(ev) => onUpdate(e.id, { name: ev.target.value })}
                        className="w-full rounded border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-neutral-900"
                      />
                      <input
                        value={e.summary}
                        onChange={(ev) => onUpdate(e.id, { summary: ev.target.value })}
                        placeholder="One-line summary (AI sees this)"
                        className="w-full rounded border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-neutral-900"
                      />
                      <textarea
                        value={e.notes}
                        onChange={(ev) => onUpdate(e.id, { notes: ev.target.value })}
                        placeholder="Details, backstory, traits…"
                        rows={3}
                        className="w-full resize-y rounded border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-neutral-900"
                      />
                      <button onClick={() => onDelete(e.id)} className="text-[11px] text-neutral-400 hover:text-red-500">
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
        {entities.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-neutral-400">
            Add characters, locations, and lore. The AI uses these to stay consistent when drafting.
          </p>
        )}
      </div>
    </aside>
  );
}
