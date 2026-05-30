/*
 * Import a manuscript from .txt / .md / .docx / .pdf and split it into chapters
 * using structure (Word/Markdown headings, or "Chapter N" / "Part" lines).
 * All client-side + lazy-loaded. No model needed — deterministic and offline.
 */

export type ImportedChapter = { title: string; html: string };
export type Imported = { title: string; chapters: ImportedChapter[] };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** plain text → paragraph HTML (blank-line separated). */
function paragraphsToHtml(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => `<p>${esc(b).replace(/\n/g, " ")}</p>`)
    .join("\n");
}

const CHAPTER_RE = /^\s*(chapter|part|prologue|epilogue|book)\b/i;
const MD_HEADING_RE = /^#{1,3}\s+(.+)$/;

/** Split plain text into chapters on Markdown headings or "Chapter/Part/…" lines. */
function splitText(text: string): ImportedChapter[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const chapters: ImportedChapter[] = [];
  let title = "";
  let buf: string[] = [];
  const flush = () => {
    const html = paragraphsToHtml(buf.join("\n"));
    if (html || title) chapters.push({ title: title || "Beginning", html });
    buf = [];
  };
  for (const line of lines) {
    const md = MD_HEADING_RE.exec(line);
    if (md) {
      flush();
      title = md[1]!.trim();
      continue;
    }
    if (CHAPTER_RE.test(line) && line.trim().length < 60) {
      flush();
      title = line.trim();
      continue;
    }
    buf.push(line);
  }
  flush();
  return chapters.length ? chapters : [{ title: "Imported", html: paragraphsToHtml(text) }];
}

/** Split HTML (from Word) into chapters on h1/h2/h3; fall back to text rules. */
function splitHtml(html: string): ImportedChapter[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const els = Array.from(doc.body.children);
  const chapters: ImportedChapter[] = [];
  let title = "";
  let parts: string[] = [];
  const flush = () => {
    if (parts.length || title) chapters.push({ title: title || "Beginning", html: parts.join("\n") });
    parts = [];
  };
  let sawHeading = false;
  for (const el of els) {
    const tag = el.tagName.toLowerCase();
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      sawHeading = true;
      flush();
      title = el.textContent?.trim() || "Untitled";
    } else {
      parts.push(el.outerHTML);
    }
  }
  flush();
  // no headings in the doc → try the "Chapter N" text rules on the plain text
  if (!sawHeading) return splitText(doc.body.textContent ?? "");
  return chapters;
}

async function pdfToText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    out.push(text);
  }
  return out.join("\n\n");
}

export async function parseFile(file: File): Promise<Imported> {
  const name = file.name;
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  const title = name.replace(/\.[^.]+$/, "");

  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const convert = (mammoth as unknown as { convertToHtml?: typeof import("mammoth").convertToHtml }).convertToHtml
      ?? (mammoth as { default?: { convertToHtml: typeof import("mammoth").convertToHtml } }).default!.convertToHtml;
    const { value } = await convert({ arrayBuffer: await file.arrayBuffer() });
    return { title, chapters: splitHtml(value) };
  }
  if (ext === "pdf") {
    return { title, chapters: splitText(await pdfToText(await file.arrayBuffer())) };
  }
  // txt, md, markdown, or anything else readable as text
  return { title, chapters: splitText(await file.text()) };
}
