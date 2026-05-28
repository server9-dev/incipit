import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Project, StoryNode } from "@incipit/shared";

/* Standard US trim sizes (inches). */
const TRIMS = [
  { label: 'Mass Market — 4.25 × 6.87"', w: 4.25, h: 6.87 },
  { label: 'Novella — 5 × 8"', w: 5, h: 8 },
  { label: 'Digest — 5.5 × 8.5"', w: 5.5, h: 8.5 },
  { label: 'US Trade — 6 × 9"', w: 6, h: 9 },
  { label: 'Royal — 6.14 × 9.21"', w: 6.14, h: 9.21 },
  { label: 'A5 — 5.83 × 8.27"', w: 5.83, h: 8.27 },
];

const PPI = 96; // layout pixels per inch (zoom is purely visual)
const MARGIN = { top: 0.75, bottom: 0.85, side: 0.7 }; // inches
const CHAPTER_TOP = 1.1; // inches of space above a chapter title

type Item =
  | { kind: "chapter" | "part"; title: string }
  | { kind: "scene-break" }
  | { kind: "block"; html: string };

type TreeItem = StoryNode & { children: TreeItem[] };

function buildTree(nodes: StoryNode[]): TreeItem[] {
  const map = new Map<string, TreeItem>();
  nodes.forEach((n) => map.set(n.id, { ...n, children: [] }));
  const roots: TreeItem[] = [];
  for (const it of map.values()) {
    if (it.parentId && map.has(it.parentId)) map.get(it.parentId)!.children.push(it);
    else roots.push(it);
  }
  const sort = (l: TreeItem[]) => {
    l.sort((a, b) => a.order - b.order);
    l.forEach((i) => sort(i.children));
  };
  sort(roots);
  return roots;
}

function contentBlocks(html: string): string[] {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const els = Array.from(doc.body.children);
  if (els.length) return els.map((e) => e.outerHTML);
  const text = doc.body.textContent?.trim();
  return text ? [`<p>${text}</p>`] : [];
}

function buildItems(nodes: StoryNode[]): Item[] {
  const items: Item[] = [];
  const walk = (node: TreeItem) => {
    if (node.type === "folder") {
      items.push({ kind: "part", title: node.title });
      node.children.forEach(walk);
    } else if (node.type === "chapter") {
      items.push({ kind: "chapter", title: node.title });
      const scenes = node.children;
      scenes.forEach((s, i) => {
        if (i > 0) items.push({ kind: "scene-break" });
        contentBlocks(s.content).forEach((html) => items.push({ kind: "block", html }));
      });
    } else {
      // standalone scene / poem (short story, poems): its own titled page
      items.push({ kind: "chapter", title: node.title });
      contentBlocks(node.content).forEach((html) => items.push({ kind: "block", html }));
    }
  };
  buildTree(nodes).forEach(walk);
  return items;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function itemHtml(item: Item, chapterTopPx: number): string {
  if (item.kind === "block") return item.html;
  if (item.kind === "scene-break") return `<div class="book-scene-break">#</div>`;
  const cls = item.kind === "part" ? "book-part-title" : "book-chap-title";
  return `<div style="padding-top:${chapterTopPx}px"><div class="${cls}">${esc(item.title)}</div></div>`;
}

export function BookView({ project, nodes, onClose }: { project: Project; nodes: StoryNode[]; onClose: () => void }) {
  const [trimIdx, setTrimIdx] = useState(3); // US Trade
  const [zoom, setZoom] = useState(0.85);
  const [pages, setPages] = useState<Item[][]>([]);
  const measureRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => buildItems(nodes), [nodes]);
  const trim = TRIMS[trimIdx]!;

  const contentW = (trim.w - 2 * MARGIN.side) * PPI;
  const contentH = (trim.h - MARGIN.top - MARGIN.bottom) * PPI;
  const chapterTopPx = CHAPTER_TOP * PPI;

  // Paginate: measure each item's height at the page content width, greedily fill.
  useLayoutEffect(() => {
    const m = measureRef.current;
    if (!m) return;
    m.style.width = `${contentW}px`;
    const measure = (html: string) => {
      m.innerHTML = html;
      return (m.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;
    };

    const out: Item[][] = [];
    let cur: Item[] = [];
    let h = 0;
    const flush = () => {
      if (cur.length) out.push(cur);
      cur = [];
      h = 0;
    };
    for (const item of items) {
      if (item.kind === "chapter" || item.kind === "part") {
        flush();
        cur.push(item);
        h = measure(itemHtml(item, chapterTopPx));
        continue;
      }
      const eh = measure(itemHtml(item, chapterTopPx));
      if (h + eh > contentH && cur.length) flush();
      cur.push(item);
      h += eh;
    }
    flush();
    setPages(out);
  }, [items, contentW, contentH, chapterTopPx]);

  const pageW = trim.w * PPI;
  const pageH = trim.h * PPI;
  const totalWords = nodes.reduce((s, n) => s + n.wordCount, 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-100">
      <div className="flex items-center gap-3 border-b border-neutral-300 bg-white px-4 py-2">
        <span className="font-semibold text-neutral-900">{project.title}</span>
        <span className="text-xs text-neutral-400">Book view · {pages.length} pages · {totalWords.toLocaleString()} words</span>
        <select
          value={trimIdx}
          onChange={(e) => setTrimIdx(Number(e.target.value))}
          className="ml-2 rounded border border-neutral-300 bg-white px-2 py-1 text-xs outline-none"
        >
          {TRIMS.map((t, i) => (
            <option key={t.label} value={i}>{t.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 text-xs">
          <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100">−</button>
          <span className="w-10 text-center text-neutral-500">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))} className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100">+</button>
        </div>
        <button onClick={onClose} className="ml-auto rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700">
          Close
        </button>
      </div>

      <div className="flex-1 overflow-auto py-8">
        <div className="flex flex-col items-center gap-6">
          {pages.length === 0 && <div className="mt-20 text-sm text-neutral-400">Nothing to preview yet — write some prose first.</div>}
          {pages.map((page, i) => (
            <div
              key={i}
              className="book-page bg-white shadow-lg"
              style={{
                width: pageW,
                height: pageH,
                paddingTop: MARGIN.top * PPI,
                paddingBottom: MARGIN.bottom * PPI,
                paddingLeft: MARGIN.side * PPI,
                paddingRight: MARGIN.side * PPI,
                transform: `scale(${zoom})`,
                transformOrigin: "top center",
                marginBottom: pageH * (zoom - 1), // collapse the gap left by scaling
              }}
            >
              <div className="book-prose h-full overflow-hidden">
                {page.map((item, j) => (
                  <div key={j} dangerouslySetInnerHTML={{ __html: itemHtml(item, chapterTopPx) }} />
                ))}
              </div>
              <div className="book-folio">{i + 1}</div>
            </div>
          ))}
        </div>
      </div>

      {/* offscreen measurer */}
      <div ref={measureRef} className="book-prose" style={{ position: "absolute", left: -99999, top: 0, visibility: "hidden" }} />
    </div>
  );
}
