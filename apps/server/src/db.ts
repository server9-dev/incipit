import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { nanoid } from "nanoid";
import {
  SCAFFOLDS,
  canContain,
  type Project,
  type ProjectType,
  type StoryNode,
  type NodeType,
  type Entity,
  type EntityType,
  type ScaffoldNode,
} from "@incipit/shared";

const DB_PATH = process.env.DB_PATH ?? "./data/incipit.sqlite";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db: DatabaseType = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    type        TEXT NOT NULL,
    synopsis    TEXT NOT NULL DEFAULT '',
    pov         TEXT NOT NULL DEFAULT '',
    tense       TEXT NOT NULL DEFAULT '',
    genre       TEXT NOT NULL DEFAULT '',
    style_notes TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS nodes (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id   TEXT REFERENCES nodes(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    synopsis    TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL DEFAULT '',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    word_count  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS entities (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    name        TEXT NOT NULL,
    summary     TEXT NOT NULL DEFAULT '',
    notes       TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_nodes_project ON nodes(project_id);
  CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project_id);
`);

const now = () => new Date().toISOString();
const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/* ---------------------------- projects ---------------------------- */

type ProjectRow = {
  id: string; title: string; type: string; synopsis: string; pov: string;
  tense: string; genre: string; style_notes: string; created_at: string; updated_at: string;
};
const toProject = (r: ProjectRow): Project => ({
  id: r.id, title: r.title, type: r.type as ProjectType, synopsis: r.synopsis,
  pov: r.pov, tense: r.tense, genre: r.genre, styleNotes: r.style_notes,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

function instantiateScaffold(projectId: string, specs: ScaffoldNode[], parentId: string | null) {
  specs.forEach((spec, i) => {
    const id = nanoid();
    const t = now();
    db.prepare(
      `INSERT INTO nodes (id, project_id, parent_id, type, title, synopsis, content, sort_order, word_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '', ?, 0, ?, ?)`,
    ).run(id, projectId, parentId, spec.type, spec.title, spec.synopsis ?? "", i, t, t);
    if (spec.children?.length) instantiateScaffold(projectId, spec.children, id);
  });
}

export const projects = {
  list(): Project[] {
    return (db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all() as ProjectRow[]).map(toProject);
  },
  get(id: string): Project | undefined {
    const r = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
    return r ? toProject(r) : undefined;
  },
  create(title: string, type: ProjectType): Project {
    const id = nanoid();
    const t = now();
    db.prepare(
      "INSERT INTO projects (id, title, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run(id, title, type, t, t);
    instantiateScaffold(id, SCAFFOLDS[type] ?? [], null);
    return this.get(id)!;
  },
  update(id: string, patch: Partial<Project>): Project | undefined {
    const cur = this.get(id);
    if (!cur) return undefined;
    db.prepare(
      `UPDATE projects SET title=?, synopsis=?, pov=?, tense=?, genre=?, style_notes=?, updated_at=? WHERE id=?`,
    ).run(
      patch.title ?? cur.title, patch.synopsis ?? cur.synopsis, patch.pov ?? cur.pov,
      patch.tense ?? cur.tense, patch.genre ?? cur.genre, patch.styleNotes ?? cur.styleNotes, now(), id,
    );
    return this.get(id);
  },
  remove(id: string) {
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  },
};

/* ----------------------------- nodes ------------------------------ */

type NodeRow = {
  id: string; project_id: string; parent_id: string | null; type: string; title: string;
  synopsis: string; content: string; sort_order: number; word_count: number;
  created_at: string; updated_at: string;
};
const toNode = (r: NodeRow): StoryNode => ({
  id: r.id, projectId: r.project_id, parentId: r.parent_id, type: r.type as NodeType,
  title: r.title, synopsis: r.synopsis, content: r.content, order: r.sort_order,
  wordCount: r.word_count, createdAt: r.created_at, updatedAt: r.updated_at,
});

export const nodes = {
  listByProject(projectId: string): StoryNode[] {
    return (
      db.prepare("SELECT * FROM nodes WHERE project_id = ? ORDER BY sort_order ASC").all(projectId) as NodeRow[]
    ).map(toNode);
  },
  get(id: string): StoryNode | undefined {
    const r = db.prepare("SELECT * FROM nodes WHERE id = ?").get(id) as NodeRow | undefined;
    return r ? toNode(r) : undefined;
  },
  create(input: { projectId: string; parentId: string | null; type: NodeType; title: string }): StoryNode {
    const id = nanoid();
    const t = now();
    const max = db
      .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM nodes WHERE project_id = ? AND parent_id IS ?")
      .get(input.projectId, input.parentId) as { m: number };
    db.prepare(
      `INSERT INTO nodes (id, project_id, parent_id, type, title, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.projectId, input.parentId, input.type, input.title, max.m + 1, t, t);
    return this.get(id)!;
  },
  update(id: string, patch: Partial<Pick<StoryNode, "title" | "synopsis" | "content" | "order" | "parentId">>): StoryNode | undefined {
    const cur = this.get(id);
    if (!cur) return undefined;
    const content = patch.content ?? cur.content;
    db.prepare(
      `UPDATE nodes SET title=?, synopsis=?, content=?, sort_order=?, parent_id=?, word_count=?, updated_at=? WHERE id=?`,
    ).run(
      patch.title ?? cur.title, patch.synopsis ?? cur.synopsis, content,
      patch.order ?? cur.order, patch.parentId !== undefined ? patch.parentId : cur.parentId,
      countWords(content), now(), id,
    );
    return this.get(id);
  },
  remove(id: string) {
    db.prepare("DELETE FROM nodes WHERE id = ?").run(id);
  },

  /** All descendant ids of a node (for cycle prevention). */
  descendantIds(id: string): Set<string> {
    const out = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      const kids = db.prepare("SELECT id FROM nodes WHERE parent_id = ?").all(cur) as { id: string }[];
      for (const k of kids)
        if (!out.has(k.id)) {
          out.add(k.id);
          stack.push(k.id);
        }
    }
    return out;
  },

  /**
   * Move a node under `newParentId` at position `index` among its new
   * siblings, reindexing the whole sibling group atomically. No-ops (returns
   * false) on a type-rule violation or a cycle.
   */
  move(id: string, newParentId: string | null, index: number): boolean {
    const node = this.get(id);
    if (!node) return false;
    if (newParentId === id) return false;

    const parentType = newParentId ? (this.get(newParentId)?.type ?? null) : null;
    if (newParentId && parentType === null) return false; // parent vanished
    if (!canContain(parentType, node.type)) return false;
    if (newParentId && this.descendantIds(id).has(newParentId)) return false; // cycle

    const tx = db.transaction(() => {
      db.prepare("UPDATE nodes SET parent_id = ?, updated_at = ? WHERE id = ?").run(newParentId, now(), id);
      const sibs = (
        db
          .prepare("SELECT id FROM nodes WHERE project_id = ? AND parent_id IS ? AND id != ? ORDER BY sort_order ASC")
          .all(node.projectId, newParentId, id) as { id: string }[]
      ).map((r) => r.id);
      const at = Math.max(0, Math.min(index, sibs.length));
      sibs.splice(at, 0, id);
      sibs.forEach((sid, i) => db.prepare("UPDATE nodes SET sort_order = ? WHERE id = ?").run(i, sid));
    });
    tx();
    return true;
  },
};

/* ---------------------------- entities ---------------------------- */

type EntityRow = {
  id: string; project_id: string; type: string; name: string; summary: string;
  notes: string; created_at: string; updated_at: string;
};
const toEntity = (r: EntityRow): Entity => ({
  id: r.id, projectId: r.project_id, type: r.type as EntityType, name: r.name,
  summary: r.summary, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
});

export const entities = {
  listByProject(projectId: string): Entity[] {
    return (
      db.prepare("SELECT * FROM entities WHERE project_id = ? ORDER BY name ASC").all(projectId) as EntityRow[]
    ).map(toEntity);
  },
  get(id: string): Entity | undefined {
    const r = db.prepare("SELECT * FROM entities WHERE id = ?").get(id) as EntityRow | undefined;
    return r ? toEntity(r) : undefined;
  },
  create(input: { projectId: string; type: EntityType; name: string; summary?: string; notes?: string }): Entity {
    const id = nanoid();
    const t = now();
    db.prepare(
      `INSERT INTO entities (id, project_id, type, name, summary, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.projectId, input.type, input.name, input.summary ?? "", input.notes ?? "", t, t);
    return this.get(id)!;
  },
  update(id: string, patch: Partial<Pick<Entity, "name" | "summary" | "notes">>): Entity | undefined {
    const cur = this.get(id);
    if (!cur) return undefined;
    db.prepare("UPDATE entities SET name=?, summary=?, notes=?, updated_at=? WHERE id=?").run(
      patch.name ?? cur.name, patch.summary ?? cur.summary, patch.notes ?? cur.notes, now(), id,
    );
    return this.get(id);
  },
  remove(id: string) {
    db.prepare("DELETE FROM entities WHERE id = ?").run(id);
  },
};
