import { useEffect, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { getStoryboard, saveStoryboard, ingestStoryboard } from "../api.js";

/**
 * Per-project Excalidraw storyboard. The scene persists and auto-saves on
 * change (debounced) so edits are restored next time. "Send to manuscript"
 * turns frames→chapters and text cards→scenes (upsert by element id).
 */
export function StoryboardModal({
  projectId,
  onClose,
  onIngested,
}: {
  projectId: string;
  onClose: () => void;
  onIngested: () => void;
}) {
  const [initialData, setInitialData] = useState<{ elements: unknown[]; files: unknown } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiRef = useRef<{ getSceneElements: () => readonly unknown[] } | null>(null);

  async function sendToManuscript() {
    if (!apiRef.current || ingesting) return;
    setIngesting(true);
    try {
      const elements = apiRef.current.getSceneElements();
      const r = await ingestStoryboard(projectId, elements);
      onIngested();
      alert(`Sent to manuscript: ${r.chapters} chapter(s), ${r.scenes} scene(s) — ${r.created} created, ${r.updated} updated.`);
    } catch (e) {
      alert("Ingest failed: " + e);
    } finally {
      setIngesting(false);
    }
  }

  useEffect(() => {
    getStoryboard(projectId)
      .then(({ storyboard }) => {
        try {
          const parsed = storyboard ? JSON.parse(storyboard) : null;
          setInitialData(parsed && parsed.elements ? { elements: parsed.elements, files: parsed.files ?? {} } : { elements: [], files: {} });
        } catch {
          setInitialData({ elements: [], files: {} });
        }
        setLoaded(true);
      })
      .catch(() => {
        setInitialData({ elements: [], files: {} });
        setLoaded(true);
      });
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [projectId]);

  function onChange(elements: readonly unknown[], _appState: unknown, files: unknown) {
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveStoryboard(projectId, JSON.stringify({ elements, files }))
        .then(() => setSaved(true))
        .catch(() => {});
    }, 800);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void">
      <div className="flex items-center gap-3 border-b border-linesoft bg-surface px-4 py-2">
        <span className="font-semibold text-fg">Storyboard</span>
        <span className="text-xs text-mute">Frames → chapters, text cards → scenes</span>
        <span className="text-xs text-mute">{saved ? "saved" : "saving…"}</span>
        <button
          onClick={sendToManuscript}
          disabled={ingesting}
          title="Create/update chapters & scenes from this board (keeps prose you've written)"
          className="ml-auto rounded-md border border-line px-3 py-1 text-xs font-medium text-dim hover:bg-elevated disabled:opacity-50"
        >
          {ingesting ? "Sending…" : "Send to manuscript →"}
        </button>
        <button onClick={onClose} className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-ink hover:bg-brand-dark">
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {loaded && initialData && (
          <Excalidraw
            excalidrawAPI={(api) => (apiRef.current = api)}
            initialData={{ elements: initialData.elements as never, files: initialData.files as never, scrollToContent: true }}
            onChange={onChange}
            theme="dark"
          />
        )}
      </div>
    </div>
  );
}
