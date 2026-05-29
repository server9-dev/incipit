import type { Project, StoryNode } from "@incipit/shared";

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

  const walk = (node: TreeItem) => {
    if (node.type === "folder") out.push(`\n# ${node.title}`);
    else if (node.type === "chapter") out.push(`\n## ${node.title}`);
    else {
      out.push(`\n### ${node.title}`);
      const body = htmlToMarkdown(node.content);
      if (body) out.push(body);
    }
    node.children.forEach(walk);
  };
  buildTree(nodes).forEach(walk);
  return out.join("\n\n") + "\n";
}

export function downloadText(filename: string, text: string, mime = "text/markdown") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // must be in the DOM for the click to trigger a download in Edge/Firefox
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
