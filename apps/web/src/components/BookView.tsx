import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Project, StoryNode } from "@incipit/shared";
import { buildEpub, downloadBlob } from "../epub.js";

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
  | { kind: "chapter" | "part"; title: string; pov?: string; epigraph?: string }
  | { kind: "scene-break" }
  | { kind: "epigraph"; text: string }
  | { kind: "block"; html: string }
  | { kind: "fullbleed"; src: string };

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

/** A content block, flagging full-bleed images so they become their own page. */
function blockItems(html: string): Item[] {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const els = Array.from(doc.body.children);
  if (!els.length) {
    const text = doc.body.textContent?.trim();
    return text ? [{ kind: "block", html: `<p>${text}</p>` }] : [];
  }
  return els.map((e): Item => {
    const img = e.tagName.toLowerCase() === "img" ? (e as HTMLImageElement) : e.querySelector("img");
    if (img && img.classList.contains("fullbleed")) return { kind: "fullbleed", src: img.getAttribute("src") || "" };
    return { kind: "block", html: e.outerHTML };
  });
}

function buildItems(nodes: StoryNode[]): Item[] {
  const items: Item[] = [];
  const walk = (node: TreeItem) => {
    if (node.type === "folder") {
      items.push({ kind: "part", title: node.title });
      node.children.forEach(walk);
    } else if (node.type === "chapter") {
      items.push({ kind: "chapter", title: node.title, pov: node.pov, epigraph: node.epigraph });
      node.children.forEach((s, i) => {
        if (i > 0) items.push({ kind: "scene-break" });
        if (s.epigraph) items.push({ kind: "epigraph", text: s.epigraph });
        items.push(...blockItems(s.content));
      });
    } else {
      // standalone scene / poem (short story, poems): its own titled page
      items.push({ kind: "chapter", title: node.title, pov: node.pov, epigraph: node.epigraph });
      items.push(...blockItems(node.content));
    }
  };
  buildTree(nodes).forEach(walk);
  return items;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function itemHtml(item: Item, chapterTopPx: number, sceneBreak: string): string {
  if (item.kind === "block") return item.html;
  if (item.kind === "fullbleed") return ""; // rendered as its own page, not in the flow
  if (item.kind === "scene-break") return `<div class="book-scene-break">${esc(sceneBreak)}</div>`;
  if (item.kind === "epigraph") return `<div class="book-epigraph">${esc(item.text)}</div>`;
  const cls = item.kind === "part" ? "book-part-title" : "book-chap-title";
  const pov = item.pov ? `<div class="book-pov">${esc(item.pov)}</div>` : "";
  const epi = item.epigraph ? `<div class="book-epigraph">${esc(item.epigraph)}</div>` : "";
  return `<div style="padding-top:${chapterTopPx}px"><div class="${cls}">${esc(item.title)}</div>${pov}${epi}</div>`;
}

export function BookView({ project, nodes, onClose }: { project: Project; nodes: StoryNode[]; onClose: () => void }) {
  const [trimIdx, setTrimIdx] = useState(3); // US Trade
  const [zoom, setZoom] = useState(0.85);
  const [pages, setPages] = useState<Item[][]>([]);
  const [exporting, setExporting] = useState(false);
  const measureRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => buildItems(nodes), [nodes]);
  const sceneBreak = project.sceneBreak || "#";
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
      if (item.kind === "fullbleed") {
        flush();
        out.push([item]); // a full-bleed image is its own page
        continue;
      }
      if (item.kind === "chapter" || item.kind === "part") {
        flush();
        cur.push(item);
        h = measure(itemHtml(item, chapterTopPx, sceneBreak));
        continue;
      }
      const eh = measure(itemHtml(item, chapterTopPx, sceneBreak));
      if (h + eh > contentH && cur.length) flush();
      cur.push(item);
      h += eh;
    }
    flush();
    setPages(out);
  }, [items, contentW, contentH, chapterTopPx, sceneBreak]);

  const pageW = trim.w * PPI;
  const pageH = trim.h * PPI;
  const totalWords = nodes.reduce((s, n) => s + n.wordCount, 0);

  function exportPdf() {
    const style = document.createElement("style");
    style.id = "book-print-page";
    style.textContent = `@page { size: ${trim.w}in ${trim.h}in; margin: 0; }`;
    document.head.appendChild(style);
    const cleanup = () => {
      style.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  async function exportEpub() {
    setExporting(true);
    try {
      const blob = await buildEpub(project, nodes);
      downloadBlob(blob, `${project.title || "manuscript"}.epub`);
    } catch (e) {
      alert("EPUB export failed: " + e);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="book-view-root fixed inset-0 z-50 flex flex-col bg-void">
      <div className="book-toolbar flex items-center gap-3 border-b border-linesoft bg-surface px-4 py-2">
        <span className="font-semibold text-fg">{project.title}</span>
        <span className="text-xs text-mute">Book view · {pages.length} pages · {totalWords.toLocaleString()} words</span>
        <select
          value={trimIdx}
          onChange={(e) => setTrimIdx(Number(e.target.value))}
          className="ml-2 rounded border border-line bg-surface px-2 py-1 text-xs text-fg outline-none"
        >
          {TRIMS.map((t, i) => (
            <option key={t.label} value={i}>{t.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 text-xs">
          <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} className="rounded border border-line px-2 py-1 text-dim hover:bg-elevated">−</button>
          <span className="w-10 text-center text-dim">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))} className="rounded border border-line px-2 py-1 text-dim hover:bg-elevated">+</button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={exportPdf} className="rounded-md border border-line px-3 py-1 text-xs font-medium text-dim hover:bg-elevated">
            PDF
          </button>
          <button onClick={exportEpub} disabled={exporting} className="rounded-md border border-line px-3 py-1 text-xs font-medium text-dim hover:bg-elevated disabled:opacity-50">
            {exporting ? "Exporting…" : "EPUB"}
          </button>
          <button onClick={onClose} className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-ink hover:bg-brand-dark">
            Close
          </button>
        </div>
      </div>

      <div className="book-scroll flex-1 overflow-auto py-8">
        <div className="flex flex-col items-center gap-6">
          {pages.length === 0 && <div className="mt-20 text-sm text-mute">Nothing to preview yet — write some prose first.</div>}
          {pages.map((page, i) => {
            const fb = page.length === 1 && page[0]!.kind === "fullbleed" ? (page[0] as Extract<Item, { kind: "fullbleed" }>) : null;
            const m = fb ? 0 : undefined;
            return (
              <div
                key={i}
                className="book-page bg-white shadow-lg"
                style={{
                  width: pageW,
                  height: pageH,
                  paddingTop: m ?? MARGIN.top * PPI,
                  paddingBottom: m ?? MARGIN.bottom * PPI,
                  paddingLeft: m ?? MARGIN.side * PPI,
                  paddingRight: m ?? MARGIN.side * PPI,
                  transform: `scale(${zoom})`,
                  transformOrigin: "top center",
                  marginBottom: pageH * (zoom - 1),
                }}
              >
                {fb ? (
                  <img src={fb.src} alt="" className="book-fullbleed" />
                ) : (
                  <>
                    <div className="book-prose h-full overflow-hidden">
                      {page.map((item, j) => (
                        <div key={j} dangerouslySetInnerHTML={{ __html: itemHtml(item, chapterTopPx, sceneBreak) }} />
                      ))}
                    </div>
                    <div className="book-folio">{i + 1}</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* offscreen measurer */}
      <div ref={measureRef} className="book-prose book-measure" style={{ position: "absolute", left: -99999, top: 0, visibility: "hidden" }} />
    </div>
  );
}
