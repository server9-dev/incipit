import Dexie, { type Table } from "dexie";
import {
  SCAFFOLDS,
  canContain,
  parseProfile,
  type Project,
  type ProjectType,
  type StoryNode,
  type NodeType,
  type Entity,
  type EntityType,
  type ScaffoldNode,
} from "@incipit/shared";

/* Client-side persistence (IndexedDB via Dexie) — replaces the Node server.
   Same domain types + semantics as the old apps/server so api.ts swaps cleanly. */

type ProjectRow = Project & { storyboard: string };
type NodeRow = StoryNode & { originId: string };
type EntityRow = Entity & { embedding: number[] | null };

/* One row per save that changed the word count — the time-series foundation
   that analytics, goals, and sprints all read from. `day` is the local
   calendar date (YYYY-MM-DD) so daily rollups are a simple indexed query. */
export type WritingLogRow = {
  id: string;
  projectId: string;
  nodeId: string;
  ts: string; // ISO timestamp of the save
  day: string; // local YYYY-MM-DD
  delta: number; // net word change for this save (can be negative)
  words: number; // resulting word count of the node
};

/* A completed writing sprint. Net words are derived from the live word total
   at start vs. finish, so a sprint needs no per-keystroke bookkeeping. */
export type SprintRow = {
  id: string;
  projectId: string;
  startTs: string;
  endTs: string;
  plannedSec: number; // chosen duration; 0 = open-ended
  wordGoal: number; // 0 = no goal
  words: number; // net words written during the sprint
  createdAt: string;
};

/* Per-project writing goals — one row keyed by projectId. */
export type GoalRow = {
  projectId: string;
  dailyTarget: number; // words/day, 0 = none
  deadline: string; // YYYY-MM-DD, "" = none
  totalTarget: number; // target manuscript size in words, 0 = none
  updatedAt: string;
};

class IncipitDB extends Dexie {
  projects!: Table<ProjectRow, string>;
  nodes!: Table<NodeRow, string>;
  entities!: Table<EntityRow, string>;
  settings!: Table<{ key: string; value: string }, string>;
  writingLog!: Table<WritingLogRow, string>;
  sprints!: Table<SprintRow, string>;
  goals!: Table<GoalRow, string>;

  constructor() {
    super("incipit");
    this.version(1).stores({
      projects: "id, updatedAt",
      nodes: "id, projectId, parentId, originId",
      entities: "id, projectId",
      settings: "key",
    });
    this.version(2).stores({
      writingLog: "id, projectId, day, ts, [projectId+day]",
      sprints: "id, projectId, startTs",
    });
    this.version(3).stores({
      goals: "projectId",
    });
  }
}

export const db = new IncipitDB();

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
/* Local calendar date (YYYY-MM-DD) — daily rollups key off the writer's own
   day boundary, not UTC. */
const fmtDay = (d: Date) =>
  `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
const localDay = (iso: string) => fmtDay(new Date(iso));
const shiftDay = (day: string, n: number) => {
  const [y, m, d] = day.split("-").map(Number);
  return fmtDay(new Date(y!, m! - 1, d! + n));
};
const stripHtml = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const countWords = (s: string) => {
  const t = stripHtml(s);
  return t ? t.split(/\s+/).length : 0;
};

const stripRow = <T extends object>(o: T, ...keys: string[]): T => {
  const c = { ...o } as Record<string, unknown>;
  for (const k of keys) delete c[k];
  return c as T;
};

/* ------------------------------- projects ------------------------------- */

async function instantiateScaffold(projectId: string, specs: ScaffoldNode[], parentId: string | null) {
  let order = 0;
  for (const spec of specs) {
    const t = now();
    const nid = id();
    await db.nodes.add({
      id: nid, projectId, parentId, type: spec.type, title: spec.title, synopsis: spec.synopsis ?? "",
      content: "", pov: "", epigraph: "", chapterArt: "", chapterArtWidth: 60, chapterArtRatio: 0, ink: "", card: "", order: order++, wordCount: 0, originId: "", createdAt: t, updatedAt: t,
    });
    if (spec.children?.length) await instantiateScaffold(projectId, spec.children, nid);
  }
}

export const projects = {
  async list(): Promise<Project[]> {
    const rows = await db.projects.orderBy("updatedAt").reverse().toArray();
    return rows.map((r) => stripRow(r, "storyboard"));
  },
  async get(pid: string): Promise<Project | undefined> {
    const r = await db.projects.get(pid);
    return r ? stripRow(r, "storyboard") : undefined;
  },
  async create(title: string, type: ProjectType, scaffold = true): Promise<Project> {
    const t = now();
    const p: ProjectRow = {
      id: id(), title, type, synopsis: "", pov: "", tense: "", genre: "", styleNotes: "",
      sceneBreak: "#", format: "", storyboard: "", createdAt: t, updatedAt: t,
    };
    await db.projects.add(p);
    if (scaffold) await instantiateScaffold(p.id, SCAFFOLDS[type] ?? [], null);
    return stripRow(p, "storyboard");
  },
  async update(pid: string, patch: Partial<Project>): Promise<Project | undefined> {
    const cur = await db.projects.get(pid);
    if (!cur) return undefined;
    const next = { ...cur, ...patch, id: cur.id, updatedAt: now() };
    await db.projects.put(next);
    return stripRow(next, "storyboard");
  },
  async remove(pid: string) {
    await db.transaction("rw", [db.projects, db.nodes, db.entities, db.writingLog, db.sprints, db.goals], async () => {
      await db.projects.delete(pid);
      await db.nodes.where("projectId").equals(pid).delete();
      await db.entities.where("projectId").equals(pid).delete();
      await db.writingLog.where("projectId").equals(pid).delete();
      await db.sprints.where("projectId").equals(pid).delete();
      await db.goals.delete(pid);
    });
  },
  async getStoryboard(pid: string): Promise<string> {
    return (await db.projects.get(pid))?.storyboard ?? "";
  },
  async setStoryboard(pid: string, json: string) {
    await db.projects.update(pid, { storyboard: json, updatedAt: now() });
  },
};

/* -------------------------------- nodes --------------------------------- */

const toNode = (r: NodeRow): StoryNode => stripRow(r, "originId");

export const nodes = {
  async listByProject(projectId: string): Promise<StoryNode[]> {
    const rows = await db.nodes.where("projectId").equals(projectId).toArray();
    rows.sort((a, b) => a.order - b.order);
    return rows.map(toNode);
  },
  async get(nid: string): Promise<StoryNode | undefined> {
    const r = await db.nodes.get(nid);
    return r ? toNode(r) : undefined;
  },
  async create(input: { projectId: string; parentId: string | null; type: NodeType; title: string; originId?: string }): Promise<StoryNode> {
    const sibs = await db.nodes.where("projectId").equals(input.projectId).filter((n) => n.parentId === input.parentId).toArray();
    const order = sibs.reduce((m, n) => Math.max(m, n.order), -1) + 1;
    const t = now();
    const row: NodeRow = {
      id: id(), projectId: input.projectId, parentId: input.parentId, type: input.type, title: input.title,
      synopsis: "", content: "", pov: "", epigraph: "", chapterArt: "", chapterArtWidth: 60, chapterArtRatio: 0, ink: "", card: "", order, wordCount: 0, originId: input.originId ?? "", createdAt: t, updatedAt: t,
    };
    await db.nodes.add(row);
    return toNode(row);
  },
  async update(nid: string, patch: Partial<Pick<StoryNode, "title" | "synopsis" | "content" | "pov" | "epigraph" | "chapterArt" | "chapterArtWidth" | "chapterArtRatio" | "ink" | "card" | "order" | "parentId">>): Promise<StoryNode | undefined> {
    const cur = await db.nodes.get(nid);
    if (!cur) return undefined;
    const content = patch.content ?? cur.content;
    const next: NodeRow = { ...cur, ...patch, content, wordCount: countWords(content), updatedAt: now() };
    await db.nodes.put(next);
    const delta = next.wordCount - cur.wordCount;
    if (delta !== 0) {
      await db.writingLog.add({
        id: id(), projectId: cur.projectId, nodeId: nid, ts: next.updatedAt,
        day: localDay(next.updatedAt), delta, words: next.wordCount,
      });
    }
    return toNode(next);
  },
  async remove(nid: string) {
    // cascade delete descendants
    await db.transaction("rw", db.nodes, async () => {
      const all = await db.nodes.where("projectId").equals((await db.nodes.get(nid))?.projectId ?? "").toArray();
      const kill = new Set([nid]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const n of all) if (n.parentId && kill.has(n.parentId) && !kill.has(n.id)) { kill.add(n.id); grew = true; }
      }
      await db.nodes.bulkDelete([...kill]);
    });
  },
  async findIdByOrigin(projectId: string, originId: string): Promise<string | undefined> {
    if (!originId) return undefined;
    const r = await db.nodes.where("projectId").equals(projectId).filter((n) => n.originId === originId).first();
    return r?.id;
  },
  async descendantIds(nid: string, projectId: string): Promise<Set<string>> {
    const all = await db.nodes.where("projectId").equals(projectId).toArray();
    const out = new Set<string>();
    const stack = [nid];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const n of all) if (n.parentId === cur && !out.has(n.id)) { out.add(n.id); stack.push(n.id); }
    }
    return out;
  },
  async move(nid: string, newParentId: string | null, index: number): Promise<boolean> {
    const node = await db.nodes.get(nid);
    if (!node || newParentId === nid) return false;
    const parentType = newParentId ? (await db.nodes.get(newParentId))?.type ?? null : null;
    if (newParentId && parentType === null) return false;
    if (!canContain(parentType, node.type)) return false;
    if (newParentId && (await this.descendantIds(nid, node.projectId)).has(newParentId)) return false;

    await db.transaction("rw", db.nodes, async () => {
      await db.nodes.update(nid, { parentId: newParentId, updatedAt: now() });
      const sibs = (await db.nodes.where("projectId").equals(node.projectId).toArray())
        .filter((n) => n.parentId === newParentId && n.id !== nid)
        .sort((a, b) => a.order - b.order)
        .map((n) => n.id);
      const at = Math.max(0, Math.min(index, sibs.length));
      sibs.splice(at, 0, nid);
      for (let i = 0; i < sibs.length; i++) await db.nodes.update(sibs[i]!, { order: i });
    });
    return true;
  },
};

/* ------------------------------- entities ------------------------------- */

const toEntity = (r: EntityRow): Entity => stripRow(r, "embedding");

export const entities = {
  async listByProject(projectId: string): Promise<Entity[]> {
    const rows = await db.entities.where("projectId").equals(projectId).toArray();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows.map(toEntity);
  },
  async get(eid: string): Promise<Entity | undefined> {
    const r = await db.entities.get(eid);
    return r ? toEntity(r) : undefined;
  },
  async create(input: { projectId: string; type: EntityType; name: string; parentId?: string | null; summary?: string; notes?: string }): Promise<Entity> {
    const t = now();
    const row: EntityRow = {
      id: id(), projectId: input.projectId, type: input.type, parentId: input.parentId ?? null, name: input.name,
      summary: input.summary ?? "", notes: input.notes ?? "", profile: "", embedding: null, createdAt: t, updatedAt: t,
    };
    await db.entities.add(row);
    return toEntity(row);
  },
  async update(eid: string, patch: Partial<Pick<Entity, "name" | "summary" | "notes" | "profile">>): Promise<Entity | undefined> {
    const cur = await db.entities.get(eid);
    if (!cur) return undefined;
    const next: EntityRow = { ...cur, ...patch, embedding: null, updatedAt: now() }; // clear cached vector
    await db.entities.put(next);
    return toEntity(next);
  },
  async remove(eid: string) {
    // cascade: remove the entity and all of its descendants
    const all = await db.entities.where("projectId").equals((await db.entities.get(eid))?.projectId ?? "").toArray();
    const byParent = new Map<string | null, string[]>();
    for (const r of all) {
      const k = r.parentId ?? null;
      (byParent.get(k) ?? byParent.set(k, []).get(k)!).push(r.id);
    }
    const doomed: string[] = [];
    const collect = (x: string) => {
      doomed.push(x);
      (byParent.get(x) ?? []).forEach(collect);
    };
    collect(eid);
    await db.entities.bulkDelete(doomed);
  },
  async embeddingRows(projectId: string): Promise<{ id: string; text: string; vec: number[] | null }[]> {
    const rows = await db.entities.where("projectId").equals(projectId).toArray();
    const nameById = new Map(rows.map((r) => [r.id, r.name]));
    return rows.map((r) => {
      const parent = r.parentId ? nameById.get(r.parentId) : null;
      const ctx = parent ? ` (part of ${parent})` : "";
      // fold the structured profile fields into the text the AI retrieves on
      const fields = Object.entries(parseProfile(r.profile).fields)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(". ");
      return { id: r.id, text: `${r.name}${ctx}. ${r.summary} ${r.notes} ${fields}`.trim(), vec: r.embedding };
    });
  },
  async setEmbedding(eid: string, vec: number[]) {
    await db.entities.update(eid, { embedding: vec });
  },
};

/* ------------------------------- settings ------------------------------- */

export const settings = {
  async all(): Promise<Record<string, string>> {
    const rows = await db.settings.toArray();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
  async set(patch: Record<string, string>) {
    await db.transaction("rw", db.settings, async () => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === "") await db.settings.delete(key);
        else await db.settings.put({ key, value });
      }
    });
  },
};

/* -------------------------------- stats --------------------------------- */

export type DayPoint = { day: string; words: number };
export type WritingSummary = {
  today: number; // net words written today
  total: number; // net words logged all-time
  streakDays: number; // consecutive days (up to today/yesterday) with positive net
  longestStreak: number; // longest run of consecutive positive days ever
  daysWritten: number; // distinct days with positive net
  bestDay: DayPoint | null;
};

/* Net words per local day, optionally scoped to a project and a start day.
   Streams rows so a long history doesn't materialize as one big array. */
async function aggregateByDay(projectId?: string, sinceDay?: string): Promise<Map<string, number>> {
  const coll = projectId ? db.writingLog.where("projectId").equals(projectId) : db.writingLog.toCollection();
  const map = new Map<string, number>();
  await coll.each((r) => {
    if (sinceDay && r.day < sinceDay) return;
    map.set(r.day, (map.get(r.day) ?? 0) + r.delta);
  });
  return map;
}

export const stats = {
  async today(projectId?: string): Promise<number> {
    const map = await aggregateByDay(projectId, localDay(now()));
    return map.get(localDay(now())) ?? 0;
  },

  async summary(projectId?: string): Promise<WritingSummary> {
    const map = await aggregateByDay(projectId);
    const todayKey = localDay(now());
    let total = 0;
    let daysWritten = 0;
    let bestDay: DayPoint | null = null;
    for (const [day, words] of map) {
      total += words;
      if (words > 0) {
        daysWritten++;
        if (!bestDay || words > bestDay.words) bestDay = { day, words };
      }
    }
    // streak: walk back from today (or yesterday, so today's blank page
    // doesn't read as a broken streak) while each day has positive net.
    let cursor = (map.get(todayKey) ?? 0) > 0 ? todayKey : shiftDay(todayKey, -1);
    let streakDays = 0;
    while ((map.get(cursor) ?? 0) > 0) {
      streakDays++;
      cursor = shiftDay(cursor, -1);
    }
    // longest streak: scan positive days in date order for the longest run of
    // calendar-adjacent days.
    const positiveDays = [...map.entries()].filter(([, w]) => w > 0).map(([d]) => d).sort();
    let longestStreak = 0;
    let run = 0;
    let prev = "";
    for (const d of positiveDays) {
      run = prev && shiftDay(prev, 1) === d ? run + 1 : 1;
      prev = d;
      if (run > longestStreak) longestStreak = run;
    }
    return { today: map.get(todayKey) ?? 0, total, streakDays, longestStreak, daysWritten, bestDay };
  },

  /* Consecutive days (up to today/yesterday) that met a daily word target. */
  async targetStreak(projectId: string | undefined, target: number): Promise<number> {
    if (target <= 0) return 0;
    const map = await aggregateByDay(projectId);
    const todayKey = localDay(now());
    let cursor = (map.get(todayKey) ?? 0) >= target ? todayKey : shiftDay(todayKey, -1);
    let n = 0;
    while ((map.get(cursor) ?? 0) >= target) {
      n++;
      cursor = shiftDay(cursor, -1);
    }
    return n;
  },

  /* Zero-filled daily series for the last `days` days, oldest → newest. */
  async series(projectId: string | undefined, days: number): Promise<DayPoint[]> {
    const todayKey = localDay(now());
    const from = shiftDay(todayKey, -(days - 1));
    const map = await aggregateByDay(projectId, from);
    const out: DayPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = shiftDay(todayKey, -i);
      out.push({ day, words: map.get(day) ?? 0 });
    }
    return out;
  },
};

/* -------------------------------- sprints ------------------------------- */

export const sprints = {
  async save(input: { projectId: string; startTs: string; endTs: string; plannedSec: number; wordGoal: number; words: number }): Promise<SprintRow> {
    const row: SprintRow = { id: id(), createdAt: now(), ...input };
    await db.sprints.add(row);
    return row;
  },
  async list(projectId: string, limit = 20): Promise<SprintRow[]> {
    const rows = await db.sprints.where("projectId").equals(projectId).toArray();
    rows.sort((a, b) => b.startTs.localeCompare(a.startTs));
    return rows.slice(0, limit);
  },
};

/* --------------------------------- goals -------------------------------- */

const emptyGoal = (projectId: string): GoalRow => ({ projectId, dailyTarget: 0, deadline: "", totalTarget: 0, updatedAt: "" });

export const goals = {
  async get(projectId: string): Promise<GoalRow> {
    return (await db.goals.get(projectId)) ?? emptyGoal(projectId);
  },
  async set(projectId: string, patch: Partial<Omit<GoalRow, "projectId" | "updatedAt">>): Promise<GoalRow> {
    const cur = await this.get(projectId);
    const next: GoalRow = { ...cur, ...patch, projectId, updatedAt: now() };
    await db.goals.put(next);
    return next;
  },
};
