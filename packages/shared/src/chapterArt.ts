/* ------------------------------------------------------------------ *
 * Chapter art — decorative headpiece shown above a chapter's title in
 * book view and exports. The art is stored on the node as either:
 *   - raw inline `<svg…>` markup (a bundled ornament; recolors to the
 *     text color via `currentColor` and scales crisply at any size), or
 *   - an uploaded image data URL (rendered as an <img>).
 * Shared so book view, EPUB, and HTML export render it identically.
 * ------------------------------------------------------------------ */

export type ChapterArtFields = {
  chapterArt?: string;
  chapterArtWidth?: number;
  chapterArtRatio?: number;
};

const clampWidth = (w: number | undefined): number => Math.min(100, Math.max(15, w || 60));

/** Is this art an inline ornament (vs. an uploaded image data URL)? */
export const isOrnamentMarkup = (art: string): boolean => art.trim().startsWith("<svg");

/**
 * Render chapter art as XHTML-safe markup (self-closed <img>, so it is valid
 * in both the book-view DOM and EPUB XHTML). Returns "" when there is no art.
 * `widthScale` (default 1) lets a smaller target — e.g. reflowable EPUB — cap
 * the on-page width without changing the stored value.
 */
export function chapterArtHtml(node: ChapterArtFields, widthScale = 1): string {
  const art = (node.chapterArt ?? "").trim();
  if (!art) return "";
  const w = Math.round(clampWidth(node.chapterArtWidth) * widthScale);
  if (isOrnamentMarkup(art)) {
    // Inline SVG: inherits text color (currentColor) and sizes from its viewBox.
    return `<div class="chapter-art chapter-art-svg" style="width:${w}%">${art}</div>`;
  }
  // Uploaded image: reserve height before decode via aspect-ratio so book-view
  // pagination measures the chapter heading correctly.
  const ratio = node.chapterArtRatio && node.chapterArtRatio > 0 ? `aspect-ratio:${node.chapterArtRatio};` : "";
  const src = art.replace(/"/g, "&quot;");
  return `<img class="chapter-art" alt="" style="width:${w}%;${ratio}" src="${src}"/>`;
}

/* ----------------------------- ornaments -------------------------------- *
 * A small starter set of original ornamental dividers/flourishes. Each is a
 * self-contained SVG drawn with `currentColor` so it takes on the book's text
 * color, with a viewBox (no fixed width/height) so it scales to any width.
 * Offered as built-in "examples" alongside the upload-your-own option.
 * ----------------------------------------------------------------------- */

export type Ornament = { key: string; label: string; svg: string };

export const CHAPTER_ORNAMENTS: Ornament[] = [
  {
    key: "rule-diamond",
    label: "Rule & diamond",
    svg: `<svg viewBox="0 0 240 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ornament"><g fill="none" stroke="currentColor" stroke-width="1.5"><line x1="20" y1="12" x2="104" y2="12"/><line x1="136" y1="12" x2="220" y2="12"/></g><path d="M120 4 L128 12 L120 20 L112 12 Z" fill="currentColor"/></svg>`,
  },
  {
    key: "swash",
    label: "Swash",
    svg: `<svg viewBox="0 0 240 40" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ornament"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M120 20 C100 4 70 4 52 16 C40 24 48 34 60 30 C70 27 66 16 52 16"/><path d="M120 20 C140 4 170 4 188 16 C200 24 192 34 180 30 C170 27 174 16 188 16"/></g><circle cx="120" cy="20" r="3.2" fill="currentColor"/></svg>`,
  },
  {
    key: "dots",
    label: "Three dots",
    svg: `<svg viewBox="0 0 240 16" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ornament"><g fill="currentColor"><circle cx="104" cy="8" r="3"/><circle cx="120" cy="8" r="3.6"/><circle cx="136" cy="8" r="3"/></g></svg>`,
  },
  {
    key: "leaf",
    label: "Leaf sprig",
    svg: `<svg viewBox="0 0 240 36" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ornament"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><line x1="40" y1="18" x2="100" y2="18"/><line x1="140" y1="18" x2="200" y2="18"/></g><g fill="currentColor"><path d="M120 6 C113 12 113 18 120 22 C127 18 127 12 120 6 Z"/><path d="M120 30 C115 26 115 22 120 19 C125 22 125 26 120 30 Z"/></g></svg>`,
  },
  {
    key: "fleuron",
    label: "Fleuron",
    svg: `<svg viewBox="0 0 240 44" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ornament"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M120 22 C108 10 92 10 86 22 C82 30 92 34 96 28 C99 24 94 20 90 22"/><path d="M120 22 C132 10 148 10 154 22 C158 30 148 34 144 28 C141 24 146 20 150 22"/><path d="M120 22 C116 30 116 38 120 42 C124 38 124 30 120 22"/></g></svg>`,
  },
  {
    key: "double-rule",
    label: "Double rule",
    svg: `<svg viewBox="0 0 240 14" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ornament"><g fill="none" stroke="currentColor"><line x1="30" y1="5" x2="210" y2="5" stroke-width="1.4"/><line x1="60" y1="9.5" x2="180" y2="9.5" stroke-width="1"/></g></svg>`,
  },
  {
    key: "asterism",
    label: "Asterism",
    svg: `<svg viewBox="0 0 240 30" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ornament"><g fill="currentColor"><path d="M120 4 l3 6 6 1 -4.5 4.5 1 6 -5.5-3 -5.5 3 1-6 -4.5-4.5 6-1 z"/><path d="M104 22 l2 4 4 0.6 -3 3 0.7 4 -3.7-2 -3.7 2 0.7-4 -3-3 4-0.6 z"/><path d="M136 22 l2 4 4 0.6 -3 3 0.7 4 -3.7-2 -3.7 2 0.7-4 -3-3 4-0.6 z"/></g></svg>`,
  },
  {
    key: "wings",
    label: "Winged rule",
    svg: `<svg viewBox="0 0 240 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ornament"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M120 12 C96 12 84 6 60 6 C84 9 96 12 60 18 C84 18 96 12 120 12"/><path d="M120 12 C144 12 156 6 180 6 C156 9 144 12 180 18 C156 18 144 12 120 12"/></g><circle cx="120" cy="12" r="2.6" fill="currentColor"/></svg>`,
  },
];
