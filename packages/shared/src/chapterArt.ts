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
  {
    key: "rule-thin",
    label: "Thin rule",
    svg: `<svg viewBox="0 0 240 10" xmlns="http://www.w3.org/2000/svg"><line x1="24" y1="5" x2="216" y2="5" stroke="currentColor" stroke-width="1.3"/></svg>`,
  },
  {
    key: "rule-tapered",
    label: "Tapered rule",
    svg: `<svg viewBox="0 0 240 12" xmlns="http://www.w3.org/2000/svg"><path d="M40 6 C80 3 160 3 200 6 C160 9 80 9 40 6 Z" fill="currentColor"/></svg>`,
  },
  {
    key: "dot-rule",
    label: "Dotted rule",
    svg: `<svg viewBox="0 0 240 12" xmlns="http://www.w3.org/2000/svg"><line x1="36" y1="6" x2="204" y2="6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="0.1 11"/></svg>`,
  },
  {
    key: "circle-rule",
    label: "Circle & rule",
    svg: `<svg viewBox="0 0 240 24" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.5"><line x1="20" y1="12" x2="104" y2="12"/><line x1="136" y1="12" x2="220" y2="12"/><circle cx="120" cy="12" r="5"/></g><circle cx="120" cy="12" r="1.8" fill="currentColor"/></svg>`,
  },
  {
    key: "star",
    label: "Star",
    svg: `<svg viewBox="0 0 240 28" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.4"><line x1="24" y1="14" x2="98" y2="14"/><line x1="142" y1="14" x2="216" y2="14"/></g><path d="M120 4 L122.35 10.76 L129.51 10.91 L123.8 15.24 L125.88 22.09 L120 18 L114.12 22.09 L116.2 15.24 L110.49 10.91 L117.65 10.76 Z" fill="currentColor"/></svg>`,
  },
  {
    key: "sparkle",
    label: "Sparkle",
    svg: `<svg viewBox="0 0 240 28" xmlns="http://www.w3.org/2000/svg"><path d="M120 3 L123 11 L131 14 L123 17 L120 25 L117 17 L109 14 L117 11 Z" fill="currentColor"/></svg>`,
  },
  {
    key: "sun",
    label: "Sun",
    svg: `<svg viewBox="0 0 240 34" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="120" cy="17" r="5"/><line x1="127.5" y1="17" x2="131" y2="17"/><line x1="112.5" y1="17" x2="109" y2="17"/><line x1="120" y1="9.5" x2="120" y2="6"/><line x1="120" y1="24.5" x2="120" y2="28"/><line x1="125.3" y1="11.7" x2="127.78" y2="9.22"/><line x1="114.7" y1="11.7" x2="112.22" y2="9.22"/><line x1="125.3" y1="22.3" x2="127.78" y2="24.78"/><line x1="114.7" y1="22.3" x2="112.22" y2="24.78"/></g></svg>`,
  },
  {
    key: "crescent",
    label: "Crescent moon",
    svg: `<svg viewBox="0 0 240 30" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M96 15 C76 9 64 9 44 15"/><path d="M144 15 C164 9 176 9 196 15"/></g><path d="M126 7 A8.5 8.5 0 1 0 126 23 A6 6 0 1 1 126 7 Z" fill="currentColor"/></svg>`,
  },
  {
    key: "vine",
    label: "Vine",
    svg: `<svg viewBox="0 0 240 22" xmlns="http://www.w3.org/2000/svg"><path d="M30 11 Q60 3 90 11 T150 11 T210 11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="120" cy="11" r="2" fill="currentColor"/></svg>`,
  },
  {
    key: "daisy",
    label: "Flower & rule",
    svg: `<svg viewBox="0 0 240 28" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.4"><line x1="24" y1="14" x2="96" y2="14"/><line x1="144" y1="14" x2="216" y2="14"/></g><g fill="currentColor"><circle cx="120" cy="9" r="2.1"/><circle cx="124.33" cy="11.5" r="2.1"/><circle cx="124.33" cy="16.5" r="2.1"/><circle cx="120" cy="19" r="2.1"/><circle cx="115.67" cy="16.5" r="2.1"/><circle cx="115.67" cy="11.5" r="2.1"/><circle cx="120" cy="14" r="1.3"/></g></svg>`,
  },
  {
    key: "clover",
    label: "Trefoil",
    svg: `<svg viewBox="0 0 240 30" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="120" cy="9" r="4.2"/><circle cx="112.5" cy="16" r="4.2"/><circle cx="127.5" cy="16" r="4.2"/><path d="M120 18 C120 22 120 24 120 27"/></g></svg>`,
  },
  {
    key: "scroll",
    label: "Scrollwork",
    svg: `<svg viewBox="0 0 240 22" xmlns="http://www.w3.org/2000/svg"><path d="M36 11 C52 3 60 19 76 11 C92 3 100 19 116 11 C118 10 122 10 124 11 C140 19 148 3 164 11 C180 19 188 3 204 11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  },
  {
    key: "chevrons",
    label: "Chevrons",
    svg: `<svg viewBox="0 0 240 22" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M98 15 l7 -7 7 7"/><path d="M113 15 l7 -7 7 7"/><path d="M128 15 l7 -7 7 7"/></g></svg>`,
  },
  {
    key: "lozenges",
    label: "Lozenge chain",
    svg: `<svg viewBox="0 0 240 20" xmlns="http://www.w3.org/2000/svg"><line x1="40" y1="10" x2="200" y2="10" stroke="currentColor" stroke-width="1"/><g fill="currentColor"><path d="M120 3 l6 7 -6 7 -6 -7 z"/><path d="M98 5 l4.5 5 -4.5 5 -4.5 -5 z"/><path d="M142 5 l4.5 5 -4.5 5 -4.5 -5 z"/></g></svg>`,
  },
];
