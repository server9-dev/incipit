function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Block-level HTML: blank-line-separated paragraphs (verse keeps line breaks). */
export function textToHtml(text: string, verse: boolean): string {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return "";
  return t
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").map(escapeHtml);
      return verse ? `<p>${lines.join("<br>")}</p>` : `<p>${lines.join(" ")}</p>`;
    })
    .join("");
}

/** Inline HTML: no block tags, single newlines become <br> (for in-paragraph edits). */
export function textToInlineHtml(text: string): string {
  return escapeHtml(text.replace(/\r\n/g, "\n").trim()).replace(/\n/g, "<br>");
}

const HTML_RE = /<\/?[a-z][\s\S]*?>/i;

/** Legacy nodes stored plain text; new content is HTML. Detect and normalize. */
export function initialHtml(content: string, verse: boolean): string {
  if (!content) return "";
  return HTML_RE.test(content) ? content : textToHtml(content, verse);
}
