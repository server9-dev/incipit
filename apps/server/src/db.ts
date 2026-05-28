import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { nanoid } from "nanoid";
import type { Doc } from "@firstdraft/shared";

const DB_PATH = process.env.DB_PATH ?? "./data/firstdraft.sqlite";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db: DatabaseType = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

type Row = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

const rowToDoc = (r: Row): Doc => ({
  id: r.id,
  title: r.title,
  content: JSON.parse(r.content),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const docs = {
  list(): Doc[] {
    const rows = db
      .prepare("SELECT * FROM documents ORDER BY updated_at DESC")
      .all() as Row[];
    return rows.map(rowToDoc);
  },

  get(id: string): Doc | undefined {
    const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as Row | undefined;
    return row ? rowToDoc(row) : undefined;
  },

  create(title: string, content: unknown): Doc {
    const now = new Date().toISOString();
    const id = nanoid();
    db.prepare(
      "INSERT INTO documents (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run(id, title, JSON.stringify(content ?? {}), now, now);
    return this.get(id)!;
  },

  update(id: string, patch: { title?: string; content?: unknown }): Doc | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const now = new Date().toISOString();
    db.prepare("UPDATE documents SET title = ?, content = ?, updated_at = ? WHERE id = ?").run(
      patch.title ?? existing.title,
      JSON.stringify(patch.content ?? existing.content),
      now,
      id,
    );
    return this.get(id);
  },

  remove(id: string): void {
    db.prepare("DELETE FROM documents WHERE id = ?").run(id);
  },
};
