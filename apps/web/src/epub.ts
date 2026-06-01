import JSZip from "jszip";
import { parseFormat, BOOK_FONTS, type Project, type StoryNode, type ProjectFormat } from "@incipit/shared";
import { savePlatform } from "./save.js";

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

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** TipTap HTML → XHTML-safe body (self-close void tags). */
function toXhtml(html: string): string {
  return (html || "").replace(/<(br|hr|img)((?:[^>]*?))\/?>/gi, "<$1$2/>");
}

type Doc = { id: string; file: string; title: string; xhtml: string };

function pageXhtml(title: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${body}</body>
</html>`;
}

/** Tag the first paragraph of a chapter body so the drop-cap rule can target it. */
function markFirstP(html: string): string {
  return html.replace(/<p(\s|>)/i, '<p class="first"$1');
}

/** Flatten the manuscript into spine documents (one per chapter / part / standalone). */
function buildDocs(nodes: StoryNode[], fmt: ProjectFormat): Doc[] {
  const docs: Doc[] = [];
  let n = 0;
  let chap = 0;
  const add = (title: string, body: string, kind: string) => {
    n += 1;
    docs.push({ id: `${kind}${n}`, file: `${kind}${n}.xhtml`, title, xhtml: pageXhtml(title, body) });
  };
  const drop = (html: string) => (fmt.dropCap ? markFirstP(html) : html);
  const walk = (node: TreeItem) => {
    if (node.type === "folder") {
      add(node.title, `<h1 class="part">${esc(node.title)}</h1>`, "part");
      node.children.forEach(walk);
    } else if (node.type === "chapter") {
      chap += 1;
      const num = fmt.chapterStyle === "numbered" ? `<p class="chapnum">${chap}</p>` : "";
      const scenes = node.children
        .map((s, i) => (i > 0 ? `<hr class="scene"/>` : "") + toXhtml(s.content))
        .join("\n");
      add(node.title, `${num}<h1>${esc(node.title)}</h1>\n${drop(scenes)}`, "chap");
    } else {
      add(node.title, `<h1>${esc(node.title)}</h1>\n${drop(toXhtml(node.content))}`, "chap");
    }
  };
  buildTree(nodes).forEach(walk);
  return docs;
}

function styleFor(fmt: ProjectFormat): string {
  const body = BOOK_FONTS[fmt.bodyFont].stack;
  const head = BOOK_FONTS[fmt.headingFont].stack;
  const align = fmt.chapterStyle === "left" ? "left" : "center";
  const smallcaps = fmt.chapterStyle === "smallcaps" ? "font-variant: small-caps; letter-spacing: 0.06em;" : "";
  const ornament = fmt.ornament.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const dropcap = fmt.dropCap
    ? `p.first { text-indent: 0; }
p.first::first-letter { float: left; font-size: 3em; line-height: 0.72; padding: 0.05em 0.08em 0 0; font-weight: 600; font-family: ${head}; }`
    : "";
  return `body { font-family: ${body}; line-height: 1.4; margin: 1em; }
h1 { font-family: ${head}; text-align: ${align}; margin: 2em 0 1.2em; font-size: 1.5em; ${smallcaps} }
h1.part { font-size: 1.9em; }
.chapnum { font-family: ${head}; text-align: center; font-size: 2.4em; font-weight: 300; color: #9aa3ad; line-height: 1; margin: 1.5em 0 0; }
p { margin: 0; text-indent: 1.4em; text-align: justify; }
h1 + p, p:first-child { text-indent: 0; }
hr.scene { border: 0; text-align: center; margin: 1.2em 0; }
hr.scene:after { content: "${ornament}"; color: #666; }
blockquote { margin: 0.5em 1.2em; font-style: italic; }
mark { background: none; }
${dropcap}`;
}

export async function buildEpub(project: Project, nodes: StoryNode[]): Promise<Blob> {
  const fmt = parseFormat(project.format);
  if (!project.format && project.sceneBreak) fmt.ornament = project.sceneBreak; // honour legacy scene breaks
  const docs = buildDocs(nodes, fmt);
  const uid = `urn:uuid:${crypto.randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const zip = new JSZip();

  // mimetype must be first and uncompressed
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );

  const oebps = zip.folder("OEBPS")!;
  oebps.file("style.css", styleFor(fmt));
  docs.forEach((d) => oebps.file(d.file, d.xhtml));

  const manifestItems = docs
    .map((d) => `<item id="${d.id}" href="${d.file}" media-type="application/xhtml+xml"/>`)
    .join("\n    ");
  const spineItems = docs.map((d) => `<itemref idref="${d.id}"/>`).join("\n    ");

  oebps.file(
    "content.opf",
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${uid}</dc:identifier>
    <dc:title>${esc(project.title)}</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`,
  );

  const navLis = docs.map((d) => `<li><a href="${d.file}">${esc(d.title)}</a></li>`).join("\n      ");
  oebps.file(
    "nav.xhtml",
    pageXhtml(
      "Contents",
      `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
      ${navLis}
    </ol></nav>`,
    ),
  );

  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
}

export function downloadBlob(blob: Blob, filename: string) {
  void savePlatform(filename, blob);
}
