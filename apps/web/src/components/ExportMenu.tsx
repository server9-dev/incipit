import { useEffect, useRef, useState } from "react";
import type { Project, StoryNode } from "@incipit/shared";
import { manuscriptToMarkdown, manuscriptToText, manuscriptToHtml, downloadText } from "../exportText.js";
import { buildEpub, downloadBlob } from "../epub.js";

export function ExportMenu({
  project,
  nodes,
  onOpenBook,
}: {
  project: Project;
  nodes: StoryNode[];
  onOpenBook: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const base = project.title || "manuscript";

  async function run(fn: () => void | Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert("Export failed: " + e);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  const item = (label: string, hint: string, onClick: () => void) => (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex w-full items-center justify-between gap-6 px-3 py-2 text-left text-xs hover:bg-elevated disabled:opacity-50"
    >
      <span className="font-medium text-fg">{label}</span>
      <span className="text-mute">{hint}</span>
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Export the whole manuscript"
        className="rounded-md border border-line px-3 py-1 text-xs font-medium text-dim hover:bg-elevated"
      >
        {busy ? "Exporting…" : "⤓ Export ▾"}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-lg border border-line bg-surface shadow-2xl">
          {item("Markdown", ".md", () => run(() => downloadText(`${base}.md`, manuscriptToMarkdown(project, nodes))))}
          {item("Plain text", ".txt", () => run(() => downloadText(`${base}.txt`, manuscriptToText(project, nodes), "text/plain")))}
          {item("HTML", ".html", () => run(() => downloadText(`${base}.html`, manuscriptToHtml(project, nodes), "text/html")))}
          {item("EPUB", ".epub", () =>
            run(async () => {
              const blob = await buildEpub(project, nodes);
              downloadBlob(blob, `${base}.epub`);
            })
          )}
          <div className="border-t border-linesoft" />
          {item("PDF…", "via Book view", () => {
            setOpen(false);
            onOpenBook();
          })}
        </div>
      )}
    </div>
  );
}
