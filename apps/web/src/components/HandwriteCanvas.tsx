import { useEffect, useRef, useState } from "react";

type Pt = { x: number; y: number };
type Stroke = Pt[];
export type Ink = { w: number; h: number; strokes: Stroke[] };

/**
 * Pen/touch/mouse ink capture. Preserves the original strokes (via onSaveInk)
 * and can rasterize to a PNG for vision-model transcription (via onTranscribe).
 */
export function HandwriteCanvas({
  initial,
  paper,
  busy,
  connected,
  onSaveInk,
  onTranscribe,
  onOcr,
  onClose,
}: {
  initial: Ink | null;
  paper: { bg: string; fg: string };
  busy: boolean;
  connected: boolean;
  onSaveInk: (ink: Ink) => void;
  onTranscribe: (pngDataUrl: string) => void;
  onOcr: (pngDataUrl: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const strokes = useRef<Stroke[]>(initial?.strokes ? structuredClone(initial.strokes) : []);
  const drawing = useRef<Stroke | null>(null);
  const [hasInk, setHasInk] = useState((initial?.strokes?.length ?? 0) > 0);

  const inkColor = paper.bg.toLowerCase() === "#16161e" ? "#e6e6ea" : "#1a1a1a";

  function fit() {
    const c = canvasRef.current;
    const wrap = wrapRef.current;
    if (!c || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = wrap.clientWidth * dpr;
    c.height = wrap.clientHeight * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  function redraw() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, c.width / dpr, c.height / dpr);
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const s of strokes.current) {
      if (s.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s[0]!.x, s[0]!.y);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i]!.x, s[i]!.y);
      ctx.stroke();
    }
  }

  useEffect(() => {
    fit();
    const onResize = () => fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pt = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drawing.current = [pt(e)];
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    drawing.current.push(pt(e));
    const ctx = canvasRef.current!.getContext("2d")!;
    const s = drawing.current;
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s[s.length - 2]!.x, s[s.length - 2]!.y);
    ctx.lineTo(s[s.length - 1]!.x, s[s.length - 1]!.y);
    ctx.stroke();
  };
  const up = () => {
    if (drawing.current && drawing.current.length > 1) {
      strokes.current.push(drawing.current);
      setHasInk(true);
    }
    drawing.current = null;
  };

  function clear() {
    strokes.current = [];
    setHasInk(false);
    redraw();
  }

  function currentInk(): Ink {
    const wrap = wrapRef.current!;
    return { w: wrap.clientWidth, h: wrap.clientHeight, strokes: strokes.current };
  }

  /** Render strokes onto a white PNG (black ink) for OCR, regardless of paper. */
  function toPng(): string {
    const wrap = wrapRef.current!;
    const scale = 2;
    const off = document.createElement("canvas");
    off.width = wrap.clientWidth * scale;
    off.height = wrap.clientHeight * scale;
    const ctx = off.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, off.width, off.height);
    ctx.scale(scale, scale);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const s of strokes.current) {
      if (s.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s[0]!.x, s[0]!.y);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i]!.x, s[i]!.y);
      ctx.stroke();
    }
    return off.toDataURL("image/png");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-linesoft bg-surface px-4 py-2">
        <span className="text-xs text-mute">Handwriting — draw with pen, touch, or mouse</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={clear} disabled={!hasInk || busy} className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-dim hover:bg-elevated disabled:opacity-40">
            Clear
          </button>
          <button onClick={() => onSaveInk(currentInk())} disabled={busy} className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-dim hover:bg-elevated disabled:opacity-40">
            Save ink
          </button>
          <button
            onClick={() => {
              onSaveInk(currentInk());
              onOcr(toPng());
            }}
            disabled={!hasInk || busy}
            title="Offline OCR (Tesseract) — best for neat printing; downloads ~12MB once"
            className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-dim hover:bg-elevated disabled:opacity-40"
          >
            OCR (offline)
          </button>
          <button
            onClick={() => {
              onSaveInk(currentInk());
              onTranscribe(toPng());
            }}
            disabled={!hasInk || busy || !connected}
            title={connected ? "Transcribe with the connected vision model (better for cursive)" : "Needs a vision model — connect one in settings, or use offline OCR"}
            className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-ink hover:bg-brand-dark disabled:opacity-40"
          >
            {busy ? "Transcribing…" : "Transcribe → text"}
          </button>
          <button onClick={onClose} disabled={busy} className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-mute hover:bg-elevated disabled:opacity-40">
            Close
          </button>
        </div>
      </div>
      <div ref={wrapRef} className="relative flex-1" style={{ background: paper.bg }}>
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          className="absolute inset-0 h-full w-full"
          style={{ touchAction: "none", cursor: "crosshair" }}
        />
      </div>
    </div>
  );
}
