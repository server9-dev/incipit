import { nodes } from "./db.js";

/* frames → chapters (left→right), text cards → scenes (top→bottom);
   upsert by element id so re-running preserves prose. (Client port.) */

type El = {
  id: string; type: string; text?: string; name?: string;
  x?: number; y?: number; frameId?: string | null; containerId?: string | null; isDeleted?: boolean;
};
type ParsedScene = { originId: string; title: string; synopsis: string };
type ParsedChapter = { originId: string; title: string; scenes: ParsedScene[] };

function toScene(originId: string, text: string): ParsedScene {
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  return { originId, title: (lines[0] ?? "Untitled").slice(0, 80), synopsis: lines.slice(1).join(" ") };
}

function parseBoard(elements: El[]): ParsedChapter[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const frames = elements.filter((e) => e.type === "frame" && !e.isDeleted);
  const cards = elements
    .filter((e) => e.type === "text" && !e.isDeleted && e.text && e.text.trim())
    .map((t) => {
      let x = t.x ?? 0, y = t.y ?? 0, frameId = t.frameId ?? null;
      if (t.containerId && byId.has(t.containerId)) {
        const c = byId.get(t.containerId)!;
        x = c.x ?? x; y = c.y ?? y; frameId = c.frameId ?? frameId;
      }
      return { id: t.containerId || t.id, x, y, frameId, text: t.text!.trim() };
    });
  const chapters: ParsedChapter[] = [];
  for (const f of [...frames].sort((a, b) => (a.x ?? 0) - (b.x ?? 0))) {
    const scenes = cards.filter((c) => c.frameId === f.id).sort((a, b) => a.y - b.y);
    chapters.push({ originId: f.id, title: (f.name || "Chapter").slice(0, 80), scenes: scenes.map((c) => toScene(c.id, c.text)) });
  }
  const loose = cards.filter((c) => !c.frameId || !byId.has(c.frameId)).sort((a, b) => a.y - b.y);
  if (loose.length) chapters.push({ originId: "storyboard-loose", title: "Scenes", scenes: loose.map((c) => toScene(c.id, c.text)) });
  return chapters;
}

export async function ingestStoryboard(projectId: string, elements: El[]) {
  const chapters = parseBoard(elements);
  let created = 0, updated = 0;

  let rootId = await nodes.findIdByOrigin(projectId, "storyboard-root");
  if (!rootId) {
    rootId = (await nodes.create({ projectId, parentId: null, type: "folder", title: "Storyboard", originId: "storyboard-root" })).id;
    created++;
  }
  for (const ch of chapters) {
    let chId = await nodes.findIdByOrigin(projectId, ch.originId);
    if (chId) { await nodes.update(chId, { title: ch.title }); updated++; }
    else { chId = (await nodes.create({ projectId, parentId: rootId, type: "chapter", title: ch.title, originId: ch.originId })).id; created++; }
    for (const sc of ch.scenes) {
      const scId = await nodes.findIdByOrigin(projectId, sc.originId);
      if (scId) { await nodes.update(scId, { title: sc.title, synopsis: sc.synopsis }); updated++; }
      else {
        const c = await nodes.create({ projectId, parentId: chId, type: "scene", title: sc.title, originId: sc.originId });
        await nodes.update(c.id, { synopsis: sc.synopsis });
        created++;
      }
    }
  }
  return { chapters: chapters.length, scenes: chapters.reduce((s, c) => s + c.scenes.length, 0), created, updated };
}
