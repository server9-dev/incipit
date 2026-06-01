import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Project, StoryNode, ProjectFormat, BookFont, ChapterStyle, FolioPos } from "@incipit/shared";
import { parseFormat, FORMAT_THEMES, BOOK_FONTS, ORNAMENTS, FOLIO_OPTIONS } from "@incipit/shared";
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
  | { kind: "chapter" | "part"; title: string; pov?: string; epigraph?: string; num?: number }
  | { kind: "scene-break" }
  | { kind: "epigraph"; text: string }
  | { kind: "block"; html: string; first?: boolean; cont?: boolean }
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
  let chapNum = 0;
  // append blocks, tagging the first prose block after a chapter title (for drop caps)
  const pushBody = (blocks: Item[], markFirst: boolean) => {
    let marked = !markFirst;
    for (const b of blocks) {
      if (!marked && b.kind === "block") {
        b.first = true;
        marked = true;
      }
      items.push(b);
    }
  };
  const walk = (node: TreeItem) => {
    if (node.type === "folder") {
      items.push({ kind: "part", title: node.title });
      node.children.forEach(walk);
    } else if (node.type === "chapter") {
      chapNum += 1;
      items.push({ kind: "chapter", title: node.title, pov: node.pov, epigraph: node.epigraph, num: chapNum });
      let first = true;
      node.children.forEach((s, i) => {
        if (i > 0) items.push({ kind: "scene-break" });
        if (s.epigraph) items.push({ kind: "epigraph", text: s.epigraph });
        pushBody(blockItems(s.content), first);
        first = false;
      });
    } else {
      // standalone scene / poem (short story, poems): its own titled page
      items.push({ kind: "chapter", title: node.title, pov: node.pov, epigraph: node.epigraph });
      pushBody(blockItems(node.content), true);
    }
  };
  buildTree(nodes).forEach(walk);
  return items;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function itemHtml(item: Item, chapterTopPx: number, fmt: ProjectFormat): string {
  if (item.kind === "block") {
    // drop cap: tag the chapter's opening paragraph so CSS can enlarge its first letter
    if (item.first && fmt.dropCap) return item.html.replace(/^<p(\s|>)/i, '<p class="book-firstpara"$1');
    // a paragraph continued from the previous page keeps no first-line indent
    if (item.cont) return item.html.replace(/^<p(\s|>)/i, '<p class="book-cont"$1');
    return item.html;
  }
  if (item.kind === "fullbleed") return ""; // rendered as its own page, not in the flow
  if (item.kind === "scene-break") return `<div class="book-scene-break">${esc(fmt.ornament)}</div>`;
  if (item.kind === "epigraph") return `<div class="book-epigraph">${esc(item.text)}</div>`;
  const cls = item.kind === "part" ? "book-part-title" : "book-chap-title";
  const num =
    item.kind === "chapter" && fmt.chapterStyle === "numbered" && item.num
      ? `<div class="book-chap-num">${item.num}</div>`
      : "";
  const pov = item.pov ? `<div class="book-pov">${esc(item.pov)}</div>` : "";
  const epi = item.epigraph ? `<div class="book-epigraph">${esc(item.epigraph)}</div>` : "";
  return `<div style="padding-top:${chapterTopPx}px">${num}<div class="${cls}">${esc(item.title)}</div>${pov}${epi}</div>`;
}

/** A plain (no inline markup) paragraph we can break mid-way across a page. */
function splittablePara(html: string): { open: string; close: string; words: string[] } | null {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  if (doc.body.children.length !== 1) return null;
  const el = doc.body.children[0]!;
  if (el.tagName.toLowerCase() !== "p" || el.children.length > 0) return null; // markup → keep whole
  const words = (el.textContent ?? "").split(/\s+/).filter(Boolean);
  if (words.length < 8) return null; // too short to be worth splitting
  const attrs = Array.from(el.attributes)
    .map((a) => ` ${a.name}="${a.value.replace(/"/g, "&quot;")}"`)
    .join("");
  return { open: `<p${attrs}>`, close: "</p>", words };
}

/** Largest word count whose rendered height fits maxH (binary search). */
function fitWords(sp: { open: string; close: string; words: string[] }, maxH: number, measure: (html: string) => number): number {
  let lo = 1;
  let hi = sp.words.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const hgt = measure(`${sp.open}${sp.words.slice(0, mid).join(" ")}${sp.close}`);
    if (hgt <= maxH) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** Folio (page number) position — placement varies, "bo" alternates by page parity. */
function folioStyle(pos: FolioPos, pageNum: number, sideIn: number): CSSProperties | null {
  if (pos === "none") return null;
  const top = pos === "tc" || pos === "tr";
  let align: "left" | "center" | "right" = "center";
  if (pos === "br" || pos === "tr") align = "right";
  if (pos === "bo") align = pageNum % 2 === 1 ? "right" : "left"; // recto (odd) → outer right
  return {
    left: `${sideIn}in`,
    right: `${sideIn}in`,
    top: top ? "0.4in" : "auto",
    bottom: top ? "auto" : "0.4in",
    textAlign: align,
  };
}

export function BookView({
  project,
  nodes,
  onClose,
  onChange,
}: {
  project: Project;
  nodes: StoryNode[];
  onClose: () => void;
  onChange?: (patch: Partial<Project>) => void;
}) {
  const [trimIdx, setTrimIdx] = useState(3); // US Trade
  const [zoom, setZoom] = useState(0.85);
  const [pages, setPages] = useState<Item[][]>([]);
  const [exporting, setExporting] = useState(false);
  const [fmtOpen, setFmtOpen] = useState(false);
  const measureRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => buildItems(nodes), [nodes]);
  const trim = TRIMS[trimIdx]!;

  // current theme; seed the ornament from a legacy sceneBreak if the project predates themes
  const format = useMemo<ProjectFormat>(() => {
    const f = parseFormat(project.format);
    if (!project.format && project.sceneBreak) f.ornament = project.sceneBreak;
    return f;
  }, [project.format, project.sceneBreak]);

  const setFormat = (next: ProjectFormat) => onChange?.({ format: JSON.stringify(next) });
  const applyTheme = (key: string) => {
    const t = FORMAT_THEMES.find((x) => x.key === key);
    if (t) setFormat({ theme: t.key, ...t.format });
  };
  const setField = <K extends keyof ProjectFormat>(k: K, v: ProjectFormat[K]) =>
    setFormat({ ...format, [k]: v, theme: "custom" });

  const bodyStack = BOOK_FONTS[format.bodyFont].stack;
  const headStack = BOOK_FONTS[format.headingFont].stack;
  const proseClass = `book-prose chap-${format.chapterStyle}${format.dropCap ? " dropcap" : ""}`;
  const proseStyle = { fontFamily: bodyStack, "--book-head": headStack } as CSSProperties;

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

    // a local worklist so a split paragraph's remainder can be requeued
    const queue: Item[] = items.slice();
    let i = 0;
    while (i < queue.length) {
      const item = queue[i++]!;
      if (item.kind === "fullbleed") {
        flush();
        out.push([item]); // a full-bleed image is its own page
        continue;
      }
      if (item.kind === "chapter" || item.kind === "part") {
        flush();
        cur.push(item);
        h = measure(itemHtml(item, chapterTopPx, format));
        continue;
      }
      const eh = measure(itemHtml(item, chapterTopPx, format));
      const remaining = contentH - h;
      // try to break a too-tall paragraph at the line that crosses the page edge
      const sp = format.splitParagraphs && item.kind === "block" ? splittablePara(item.html) : null;
      if (eh > remaining && sp && remaining > 36) {
        const k = fitWords(sp, remaining, measure);
        if (k > 0 && k < sp.words.length) {
          const head = `${sp.open}${sp.words.slice(0, k).join(" ")}${sp.close}`;
          const tail = `${sp.open}${sp.words.slice(k).join(" ")}${sp.close}`;
          cur.push({ kind: "block", html: head, first: item.kind === "block" ? item.first : undefined });
          flush();
          queue.splice(i, 0, { kind: "block", html: tail, cont: true }); // continued on next page
          continue;
        }
      }
      if (eh > remaining && cur.length) flush();
      cur.push(item);
      h += eh;
    }
    flush();
    setPages(out);
  }, [items, contentW, contentH, chapterTopPx, format]);

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

  const themeKey = FORMAT_THEMES.some((t) => t.key === format.theme) ? format.theme : "custom";

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

        {onChange && (
          <div className="relative">
            <select
              value={themeKey}
              onChange={(e) => (e.target.value === "custom" ? setFmtOpen(true) : applyTheme(e.target.value))}
              className="rounded border border-line bg-surface px-2 py-1 text-xs text-fg outline-none"
              title="Formatting theme"
            >
              {FORMAT_THEMES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
            <button
              onClick={() => setFmtOpen((o) => !o)}
              className="ml-1 rounded border border-line px-2 py-1 text-xs text-dim hover:bg-elevated"
              title="Fine-tune formatting"
            >
              Aa ▾
            </button>
            {fmtOpen && (
              <div className="absolute left-0 z-40 mt-1 w-60 space-y-2 rounded-lg border border-line bg-surface p-3 text-xs shadow-2xl">
                <label className="flex items-center justify-between gap-2">
                  <span className="text-dim">Drop caps</span>
                  <input type="checkbox" checked={format.dropCap} onChange={(e) => setField("dropCap", e.target.checked)} />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-dim">Chapter heading</span>
                  <select
                    value={format.chapterStyle}
                    onChange={(e) => setField("chapterStyle", e.target.value as ChapterStyle)}
                    className="rounded border border-line bg-surface px-1 py-0.5 text-fg outline-none"
                  >
                    <option value="centered">Centered</option>
                    <option value="left">Left</option>
                    <option value="numbered">Numbered</option>
                    <option value="smallcaps">Small caps</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-dim">Scene break</span>
                  <select
                    value={format.ornament}
                    onChange={(e) => setField("ornament", e.target.value)}
                    className="rounded border border-line bg-surface px-1 py-0.5 text-fg outline-none"
                  >
                    {ORNAMENTS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-dim">Body font</span>
                  <select
                    value={format.bodyFont}
                    onChange={(e) => setField("bodyFont", e.target.value as BookFont)}
                    className="rounded border border-line bg-surface px-1 py-0.5 text-fg outline-none"
                  >
                    {(Object.keys(BOOK_FONTS) as BookFont[]).map((f) => (
                      <option key={f} value={f}>
                        {BOOK_FONTS[f].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-dim">Heading font</span>
                  <select
                    value={format.headingFont}
                    onChange={(e) => setField("headingFont", e.target.value as BookFont)}
                    className="rounded border border-line bg-surface px-1 py-0.5 text-fg outline-none"
                  >
                    {(Object.keys(BOOK_FONTS) as BookFont[]).map((f) => (
                      <option key={f} value={f}>
                        {BOOK_FONTS[f].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-dim">Page numbers</span>
                  <select
                    value={format.folio}
                    onChange={(e) => setField("folio", e.target.value as FolioPos)}
                    className="rounded border border-line bg-surface px-1 py-0.5 text-fg outline-none"
                  >
                    {FOLIO_OPTIONS.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-dim">Split paragraphs across pages</span>
                  <input
                    type="checkbox"
                    checked={format.splitParagraphs}
                    onChange={(e) => setField("splitParagraphs", e.target.checked)}
                  />
                </label>
                <button
                  onClick={() => setFmtOpen(false)}
                  className="w-full rounded border border-line py-1 text-dim hover:bg-elevated"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        )}

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
                    <div className={`${proseClass} h-full overflow-hidden`} style={proseStyle}>
                      {page.map((item, j) => (
                        <div key={j} dangerouslySetInnerHTML={{ __html: itemHtml(item, chapterTopPx, format) }} />
                      ))}
                    </div>
                    {(() => {
                      const fs = folioStyle(format.folio, i + 1, MARGIN.side);
                      return fs ? (
                        <div className="book-folio" style={fs}>
                          {i + 1}
                        </div>
                      ) : null;
                    })()}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* offscreen measurer — mirrors the page's font/theme so pagination matches */}
      <div
        ref={measureRef}
        className={`${proseClass} book-measure`}
        style={{ ...proseStyle, position: "absolute", left: -99999, top: 0, visibility: "hidden" }}
      />
    </div>
  );
}
