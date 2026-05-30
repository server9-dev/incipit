import type { Project, StoryNode } from "@incipit/shared";
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

function inlineMd(node: Node): string {
  return Array.from(node.childNodes)
    .map((n) => {
      if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? "";
      const el = n as HTMLElement;
      const t = el.tagName.toLowerCase();
      const inner = inlineMd(el);
      if (t === "strong" || t === "b") return `**${inner}**`;
      if (t === "em" || t === "i") return `*${inner}*`;
      if (t === "s" || t === "del") return `~~${inner}~~`;
      if (t === "u") return inner;
      if (t === "mark") return `==${inner}==`;
      if (t === "br") return "\n";
      if (t === "img") return `![${(el as HTMLImageElement).alt || ""}](${el.getAttribute("src") || ""})`;
      return inner;
    })
    .join("");
}

/** Lightweight HTML (TipTap output) → Markdown. */
export function htmlToMarkdown(html: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = Array.from(doc.body.children).map((el) => {
    const t = el.tagName.toLowerCase();
    if (t === "h1") return `# ${inlineMd(el)}`;
    if (t === "h2") return `## ${inlineMd(el)}`;
    if (t === "h3") return `### ${inlineMd(el)}`;
    if (t === "blockquote") return inlineMd(el).split("\n").map((l) => `> ${l}`).join("\n");
    if (t === "ul") return Array.from(el.children).map((li) => `- ${inlineMd(li)}`).join("\n");
    if (t === "ol") return Array.from(el.children).map((li, i) => `${i + 1}. ${inlineMd(li)}`).join("\n");
    if (t === "img") return `![${(el as HTMLImageElement).alt || ""}](${el.getAttribute("src") || ""})`;
    return inlineMd(el);
  });
  // legacy plain-text nodes (no HTML tags)
  if (blocks.length === 0 && doc.body.textContent?.trim()) return doc.body.textContent.trim();
  return blocks.join("\n\n");
}

/** Whole manuscript → a single Markdown document. */
export function manuscriptToMarkdown(project: Project, nodes: StoryNode[]): string {
  const out: string[] = [`# ${project.title}`];
  if (project.synopsis) out.push(`_${project.synopsis}_`);

  const epi = (s: string) => s.split("\n").map((l) => `> ${l}`).join("\n");
  const walk = (node: TreeItem) => {
    if (node.type === "folder") out.push(`\n# ${node.title}`);
    else if (node.type === "chapter") {
      out.push(`\n## ${node.title}`);
      if (node.pov) out.push(`*— ${node.pov}*`);
      if (node.epigraph) out.push(epi(node.epigraph));
    } else {
      out.push(`\n### ${node.title}`);
      if (node.pov) out.push(`*— ${node.pov}*`);
      if (node.epigraph) out.push(epi(node.epigraph));
      const body = htmlToMarkdown(node.content);
      if (body) out.push(body);
    }
    node.children.forEach(walk);
  };
  buildTree(nodes).forEach(walk);
  return out.join("\n\n") + "\n";
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Whole manuscript → plain text (titles + de-formatted prose). */
export function manuscriptToText(project: Project, nodes: StoryNode[]): string {
  const out: string[] = [project.title.toUpperCase()];
  if (project.synopsis) out.push(project.synopsis);
  const bodyText = (html: string) => {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    return Array.from(doc.body.children)
      .map((el) => (el.textContent ?? "").trim())
      .filter(Boolean)
      .join("\n\n") || (doc.body.textContent ?? "").trim();
  };
  const walk = (node: TreeItem) => {
    if (node.type === "folder") out.push(`\n\n${node.title.toUpperCase()}`);
    else {
      out.push(`\n\n${node.title}`);
      if (node.pov) out.push(`— ${node.pov}`);
      if (node.epigraph) out.push(node.epigraph);
      if (node.type !== "chapter") {
        const body = bodyText(node.content);
        if (body) out.push(body);
      }
    }
    node.children.forEach(walk);
  };
  buildTree(nodes).forEach(walk);
  return out.join("\n") + "\n";
}

/** Whole manuscript → a styled, self-contained HTML document. */
export function manuscriptToHtml(project: Project, nodes: StoryNode[]): string {
  const body: string[] = [`<h1 class="title">${escHtml(project.title)}</h1>`];
  if (project.synopsis) body.push(`<p class="synopsis">${escHtml(project.synopsis)}</p>`);
  const walk = (node: TreeItem) => {
    if (node.type === "folder") body.push(`<h1 class="part">${escHtml(node.title)}</h1>`);
    else {
      body.push(`<h2 class="chapter">${escHtml(node.title)}</h2>`);
      if (node.pov) body.push(`<p class="pov">— ${escHtml(node.pov)}</p>`);
      if (node.epigraph) body.push(`<blockquote class="epigraph">${escHtml(node.epigraph)}</blockquote>`);
      if (node.type !== "chapter" && node.content) body.push(`<div class="scene">${node.content}</div>`);
    }
    node.children.forEach(walk);
  };
  buildTree(nodes).forEach(walk);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${escHtml(project.title)}</title>
<style>
  body { font-family: "EB Garamond", Georgia, serif; max-width: 40rem; margin: 3rem auto; padding: 0 1.5rem; line-height: 1.6; color: #1a1a1a; }
  .title { text-align: center; font-size: 2.2rem; }
  .synopsis { text-align: center; font-style: italic; color: #555; }
  .part { text-align: center; margin-top: 4rem; font-size: 1.8rem; }
  .chapter { text-align: center; margin-top: 3rem; font-weight: 600; }
  .pov { text-align: center; font-style: italic; color: #555; margin-top: -0.5rem; }
  .epigraph { font-style: italic; color: #444; text-align: center; border: none; }
  .scene p { text-indent: 1.5em; margin: 0; text-align: justify; }
  .scene p:first-child { text-indent: 0; }
  img { max-width: 100%; height: auto; display: block; margin: 1em auto; }
</style></head>
<body>
${body.join("\n")}
</body></html>
`;
}

export function downloadText(filename: string, text: string, mime = "text/markdown") {
  void savePlatform(filename, text, mime);
}
