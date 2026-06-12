import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle, FontFamily } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { typographyExtension } from "../typography.js";
import { REFINE_LABELS, parseFormat, BOOK_FONTS, CHAPTER_ORNAMENTS, isOrnamentMarkup, type Project, type StoryNode, type Entity, type RefineAction } from "@incipit/shared";
import { transcribe as transcribeApi } from "../api.js";
import { draftStream, refineStream } from "../clientai.js";
import { SuggestionReview } from "./SuggestionReview.js";
import { HandwriteCanvas, type Ink } from "./HandwriteCanvas.js";
import { initialHtml, textToHtml, textToInlineHtml } from "../richtext.js";
import { LOCAL_REFINE } from "../localcraft.js";
import { useDictation } from "../useDictation.js";
import { useWhisperDictation } from "../whisperDictation.js";
import { useLiveDictation } from "../useLiveDictation.js";
import {
  spellcheckExtension,
  loadDictionary,
  refreshSpellcheck,
  addCustomWord,
  spellcheckEnabled,
  setSpellcheckEnabled,
  suggest,
} from "../spellcheck.js";
import { useRef } from "react";
import type { ToolState, ToolActions } from "./ToolsMenu.js";
import type { MutableRefObject } from "react";

const FONTS = [
  { label: "Garamond", value: "" }, // editor default (EB Garamond)
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times", value: '"Times New Roman", Times, serif' },
  { label: "Sans", value: "Helvetica, Arial, sans-serif" },
  { label: "Mono", value: '"Courier New", monospace' },
];

const HIGHLIGHTS = ["#fef08a", "#bbf7d0", "#fbcfe8", "#bfdbfe"];

// Image node + a `fullBleed` flag (rendered as class="fullbleed") → full-page image in book view
const ImageNode = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fullBleed: {
        default: false,
        parseHTML: (el: HTMLElement) => el.classList.contains("fullbleed"),
        renderHTML: (attrs: { fullBleed?: boolean }) => (attrs.fullBleed ? { class: "fullbleed" } : {}),
      },
    };
  },
});

/* ---- images (stored inline as base64 data URLs) ---- */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function insertImageFile(editor: TiptapEditor, file: File) {
  if (!file.type.startsWith("image/")) return;
  const src = await fileToDataUrl(file);
  editor.chain().focus().setImage({ src }).run();
}
function pickImage(editor: TiptapEditor) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) void insertImageFile(editor, f);
  };
  input.click();
}

/* ---- chapter art (decorative headpiece above a chapter title) ---- */
/** Load an uploaded image, downscale to a sane max size, and return a data URL
 *  plus its aspect ratio (so book-view pagination can reserve height pre-decode). */
async function loadChapterArt(file: File): Promise<{ art: string; ratio: number } | null> {
  if (!file.type.startsWith("image/")) return null;
  const dataUrl = await fileToDataUrl(file);
  const img = new globalThis.Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = rej;
    img.src = dataUrl;
  });
  const ratio = img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0;
  const MAX = 1400; // longest side
  const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight || 1));
  // SVG uploads scale losslessly — keep them as-is; otherwise downscale via canvas.
  if (file.type === "image/svg+xml" || scale >= 1) return { art: dataUrl, ratio };
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { art: dataUrl, ratio };
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // preserve alpha for PNGs; JPEG (smaller) for opaque photos
  const out = file.type === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
  return { art: out, ratio };
}

function pickChapterArt(onPick: (r: { art: string; ratio: number }) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const r = await loadChapterArt(f);
    if (r) onPick(r);
  };
  input.click();
}

type Paper = { label: string; bg: string; fg: string };
const PAPERS: Record<string, Paper> = {
  white: { label: "White", bg: "#ffffff", fg: "#1a1a1a" },
  cream: { label: "Cream", bg: "#faf3e3", fg: "#2b2620" },
  sepia: { label: "Sepia", bg: "#f1e7d0", fg: "#3a3225" },
  manila: { label: "Manila", bg: "#e9dcbe", fg: "#2c2616" },
  gray: { label: "Gray", bg: "#ececed", fg: "#1a1a1a" },
  night: { label: "Night", bg: "#16161e", fg: "#d9d9e0" },
};

type Proposal = {
  from: number;
  to: number;
  original: string;
  proposed: string;
  label: string;
  block: boolean; // insert as paragraphs vs inline
};

/** Chapter-art controls for the setup panel: upload your own or pick a built-in
 *  ornament, preview it, resize it, or remove it. */
function ChapterArtRow({ node, onChapterArt }: { node: StoryNode; onChapterArt: (patch: Partial<StoryNode>) => void }) {
  const [palette, setPalette] = useState(false);
  const art = node.chapterArt || "";
  const width = node.chapterArtWidth || 60;
  const isSvg = art ? isOrnamentMarkup(art) : false;

  const setArt = (a: string, ratio: number) => {
    onChapterArt({ chapterArt: a, chapterArtRatio: ratio });
    setPalette(false);
  };

  return (
    <div className="mt-1.5 border-t border-linesoft pt-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-mute" title="A decorative image or ornament shown above the chapter title in book view & export">
          Chapter art
        </span>
        {!art && (
          <>
            <button
              type="button"
              onClick={() => pickChapterArt(({ art: a, ratio }) => setArt(a, ratio))}
              className="rounded-md bg-surface px-2 py-1 text-xs text-dim hover:bg-elevated"
            >
              Upload image…
            </button>
            <button
              type="button"
              onClick={() => setPalette((v) => !v)}
              className="rounded-md bg-surface px-2 py-1 text-xs text-dim hover:bg-elevated"
            >
              Ornaments
            </button>
          </>
        )}
        {art && (
          <>
            <div className="flex min-w-0 flex-1 items-center justify-center rounded-md bg-white px-2 py-1.5 text-[#1a1a1a]">
              {isSvg ? (
                <div className="chapter-art-svg" style={{ width: `${width}%`, maxHeight: 40 }} dangerouslySetInnerHTML={{ __html: art }} />
              ) : (
                <img src={art} alt="" style={{ width: `${width}%`, maxHeight: 56, objectFit: "contain" }} />
              )}
            </div>
            <label className="flex items-center gap-1 text-xs text-mute" title="Art width (% of the text block)">
              <input
                type="range"
                min={15}
                max={100}
                value={width}
                onChange={(e) => onChapterArt({ chapterArtWidth: Number(e.target.value) })}
                className="w-24"
              />
              <span className="w-8 tabular-nums text-right">{width}%</span>
            </label>
            <button type="button" onClick={() => pickChapterArt(({ art: a, ratio }) => setArt(a, ratio))} className="rounded-md bg-surface px-2 py-1 text-xs text-dim hover:bg-elevated">
              Replace
            </button>
            <button type="button" onClick={() => setPalette((v) => !v)} className="rounded-md bg-surface px-2 py-1 text-xs text-dim hover:bg-elevated">
              Ornaments
            </button>
            <button
              type="button"
              onClick={() => onChapterArt({ chapterArt: "", chapterArtRatio: 0 })}
              className="rounded-md bg-surface px-2 py-1 text-xs text-dim hover:bg-elevated"
            >
              Remove
            </button>
          </>
        )}
      </div>
      {palette && (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-md bg-surface p-1.5 sm:grid-cols-4">
          {CHAPTER_ORNAMENTS.map((o) => (
            <button
              key={o.key}
              type="button"
              title={o.label}
              onClick={() => setArt(o.svg, 0)}
              className="chapter-art-svg flex items-center justify-center rounded bg-white px-2 py-2 text-[#1a1a1a] hover:ring-2 hover:ring-brand"
              dangerouslySetInnerHTML={{ __html: o.svg }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Editor({
  node,
  project,
  entities,
  connected,
  onContentChange,
  onSynopsisChange,
  onTitleChange,
  onPovChange,
  onEpigraphChange,
  onChapterArt,
  onInkSave,
  onForceSave,
  onToolState,
  toolActionsRef,
  onAddTerm,
}: {
  node: StoryNode;
  project: Project;
  entities: Entity[];
  connected: boolean;
  onContentChange: (v: string) => void;
  onSynopsisChange: (v: string) => void;
  onTitleChange: (v: string) => void;
  onPovChange: (v: string) => void;
  onEpigraphChange: (v: string) => void;
  onChapterArt: (patch: Partial<StoryNode>) => void;
  onInkSave: (ink: string) => void;
  onForceSave: () => void;
  onToolState: (s: ToolState | null) => void;
  toolActionsRef: MutableRefObject<ToolActions | null>;
  onAddTerm: (word: string, definition: string) => void;
}) {
  const projectId = project.id;
  const isVerse = node.type === "poem";
  const [gen, setGen] = useState<string | null>(null);
  const [stream, setStream] = useState("");
  const [progress, setProgress] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const onProgress = (p: { progress: number; text: string }) =>
    setProgress(p.progress >= 1 ? "" : `Loading on-device model… ${Math.round(p.progress * 100)}%`);
  const [paperKey, setPaperKey] = useState<string>(() => localStorage.getItem("incipit-paper") || "white");
  const paper = PAPERS[paperKey] ?? PAPERS.white!;
  useEffect(() => {
    localStorage.setItem("incipit-paper", paperKey);
  }, [paperKey]);
  // "Manuscript view": paint the project's book theme (fonts, drop caps, indents)
  // onto the writing surface so the page looks like the finished book as you type.
  const format = useMemo(() => parseFormat(project.format), [project.format]);
  const [manuscript, setManuscript] = useState(() => localStorage.getItem("incipit-manuscript") !== "0");
  useEffect(() => {
    localStorage.setItem("incipit-manuscript", manuscript ? "1" : "0");
  }, [manuscript]);
  const [handwriting, setHandwriting] = useState(false);
  const [spellOn, setSpellOn] = useState(spellcheckEnabled());
  const [spellMenu, setSpellMenu] = useState<{
    x: number;
    y: number;
    word: string;
    from: number;
    to: number;
    suggestions: string[];
    flagged: boolean; // true = misspelled (offer corrections); false = a word the user deliberately selected
    phase: "menu" | "define";
    def: string;
  } | null>(null);

  // story-bible names (and their word parts) count as "known" words so they
  // aren't flagged. Kept in a ref so the spellcheck plugin always reads current.
  const extraWordsRef = useRef<Set<string>>(new Set());
  extraWordsRef.current = useMemo(() => {
    const s = new Set<string>();
    for (const e of entities) for (const part of e.name.split(/\s+/)) if (part) s.add(part.toLowerCase());
    return s;
  }, [entities]);

  const initialInk = useMemo<Ink | null>(() => {
    try {
      return node.ink ? (JSON.parse(node.ink) as Ink) : null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      typographyExtension,
      Highlight.configure({ multicolor: true }),
      TextStyle,
      FontFamily,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      ImageNode.configure({ allowBase64: true, inline: false }),
      spellcheckExtension(() => extraWordsRef.current),
      Placeholder.configure({
        placeholder: isVerse
          ? "Write your verse here, or hit Draft verse."
          : "Write here, or hit Draft scene. Select a passage and pick a craft tool — edits come back as suggestions you can accept or reject.",
      }),
    ],
    content: initialHtml(node.content, isVerse),
    onUpdate: ({ editor }) => onContentChange(editor.getHTML()),
    // spellcheck:"false" disables the browser's native checker — we run our own
    // so character names etc. can be added to the dictionary.
    editorProps: { attributes: { class: `incipit-prose font-garamond ${isVerse ? "verse" : ""}`, spellcheck: "false" } },
  });

  // Cmd/Ctrl+S → flush save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onForceSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onForceSave]);

  // paste / drop an image into the editor → inline base64
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const imgFrom = (list?: FileList | null) => [...(list ?? [])].find((f) => f.type.startsWith("image/"));
    const onPaste = (e: ClipboardEvent) => {
      const f = imgFrom(e.clipboardData?.files);
      if (f) {
        e.preventDefault();
        void insertImageFile(editor, f);
      }
    };
    const onDrop = (e: DragEvent) => {
      const f = imgFrom(e.dataTransfer?.files);
      if (f) {
        e.preventDefault();
        void insertImageFile(editor, f);
      }
    };
    dom.addEventListener("paste", onPaste);
    dom.addEventListener("drop", onDrop);
    return () => {
      dom.removeEventListener("paste", onPaste);
      dom.removeEventListener("drop", onDrop);
    };
  }, [editor]);

  // load the dictionary once (when spellcheck is on) and underline unknowns
  useEffect(() => {
    if (!editor || !spellOn) return;
    let alive = true;
    void loadDictionary().then(() => {
      if (alive && editor && !editor.isDestroyed) refreshSpellcheck(editor);
    });
    return () => {
      alive = false;
    };
  }, [editor, spellOn]);

  // right-click a flagged word — or any word you've selected — → dictionary menu.
  // Working off the selection (not just the red underline) means words spelled
  // like real English but used specially (names, coined terms) can be added too.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const open = (e: MouseEvent) => {
      // 1) a flagged (misspelled) word under the cursor → offer corrections too
      const el = (e.target as HTMLElement)?.closest?.(".spell-error") as HTMLElement | null;
      if (el) {
        const word = el.textContent || "";
        let from: number;
        try {
          from = editor.view.posAtDOM(el, 0);
        } catch {
          return;
        }
        e.preventDefault();
        setSpellMenu({ x: e.clientX, y: e.clientY, word, from, to: from + word.length, suggestions: suggest(word), flagged: true, phase: "menu", def: "" });
        return;
      }
      // 2) otherwise, a non-empty text selection → add that word/phrase as-is
      const { from, to, empty } = editor.view.state.selection;
      if (empty) return; // no selection → let the native menu (copy/paste) show
      const word = editor.state.doc.textBetween(from, to, " ").trim();
      if (!word || /\s/.test(word) || word.length > 40) return; // keep it to a single word/term
      e.preventDefault();
      setSpellMenu({ x: e.clientX, y: e.clientY, word, from, to, suggestions: [], flagged: false, phase: "menu", def: "" });
    };
    const onCtx = (e: MouseEvent) => open(e);
    dom.addEventListener("contextmenu", onCtx);
    return () => dom.removeEventListener("contextmenu", onCtx);
  }, [editor]);

  // story-bible names changed → re-evaluate which words are flagged
  useEffect(() => {
    if (editor && spellOn) refreshSpellcheck(editor);
  }, [editor, entities, spellOn]);

  // dismiss the spellcheck menu on any outside click
  useEffect(() => {
    if (!spellMenu) return;
    const close = () => setSpellMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [spellMenu]);

  function replaceWord(from: number, to: number, text: string) {
    editor?.chain().focus().insertContentAt({ from, to }, text).run();
    setSpellMenu(null);
  }
  function ignoreWord(word: string) {
    addCustomWord(word); // personal, global — known everywhere, no definition
    setSpellMenu(null);
    if (editor) refreshSpellcheck(editor);
  }
  function saveTerm(word: string, def: string) {
    onAddTerm(word, def.trim()); // → project glossary (story bible)
    addCustomWord(word); // also mark known immediately
    setSpellMenu(null);
    if (editor) refreshSpellcheck(editor);
  }

  function toggleSpellcheck() {
    const next = !spellOn;
    setSpellcheckEnabled(next);
    setSpellOn(next);
    if (editor) refreshSpellcheck(editor);
  }

  const insertSpoken = (text: string) => editor?.chain().focus().insertContent(text.replace(/\s+$/, "") + " ").run();
  const dictation = useDictation(insertSpoken);
  const live = useLiveDictation(insertSpoken);
  const whisper = useWhisperDictation(insertSpoken);
  // Web Speech is the live path in a real browser; in the desktop WebView (where
  // it has no backend) fall back to on-device streaming Whisper for "Dictate".
  const liveMode = !dictation.supported && live.supported;

  const busy = gen !== null;

  async function runDraft(mode: "draft" | "continue") {
    if (busy || !editor) return;
    const docSize = editor.state.doc.content.size;
    const empty = editor.getText().trim() === "";

    const plain = editor.getText();

    if (mode === "draft" && empty) {
      setGen("Drafting");
      setStream("");
      let acc = "";
      try {
        await draftStream({ project, node, mode, plain, entities }, (ch) => {
          acc += ch;
          setStream(acc);
        }, onProgress);
        editor.chain().focus().setContent(textToHtml(acc, isVerse)).run();
      } catch (e) {
        alert("Draft failed: " + e);
      } finally {
        setGen(null);
        setProgress("");
      }
      return;
    }

    const range = mode === "continue" ? { from: docSize, to: docSize } : { from: 0, to: docSize };
    const original = mode === "continue" ? "" : plain;

    setGen(mode === "continue" ? "Continuing" : "Re-drafting");
    setStream("");
    let acc = "";
    try {
      await draftStream({ project, node, mode, plain, entities }, (ch) => {
        acc += ch;
        setStream(acc);
      }, onProgress);
      setProposal({ ...range, original, proposed: acc, label: mode === "continue" ? "continuation" : "re-draft", block: true });
    } catch (e) {
      alert("Draft failed: " + e);
    } finally {
      setGen(null);
      setProgress("");
    }
  }

  async function runRefine(action: RefineAction) {
    if (busy || !editor) return;
    const sel = editor.state.selection;
    const wholeDoc = sel.empty;
    const from = wholeDoc ? 0 : sel.from;
    const to = wholeDoc ? editor.state.doc.content.size : sel.to;
    const original = wholeDoc ? editor.getText() : editor.state.doc.textBetween(from, to, "\n");
    if (!original.trim()) return;

    // offline: only the heuristic refines work, and they run locally + instantly
    if (!connected) {
      const local = LOCAL_REFINE[action];
      if (!local) {
        alert(`"${REFINE_LABELS[action]}" needs a model. Connect one in settings (top-right), or use Proofread / Tighten offline.`);
        return;
      }
      setProposal({ from, to, original, proposed: local(original), label: `${REFINE_LABELS[action]} (offline)`, block: wholeDoc });
      return;
    }

    setGen(REFINE_LABELS[action]);
    setStream("");
    let acc = "";
    try {
      await refineStream({ project, action, text: original }, (ch) => {
        acc += ch;
        setStream(acc);
      }, onProgress);
      setProposal({ from, to, original, proposed: acc, label: REFINE_LABELS[action], block: wholeDoc });
    } catch (e) {
      alert("Refine failed: " + e);
    } finally {
      setGen(null);
      setProgress("");
    }
  }

  async function runTranscribe(png: string) {
    if (busy || !editor) return;
    setGen("Transcribing");
    setStream("");
    try {
      const { text } = await transcribeApi(png);
      if (text.trim()) {
        const end = editor.state.doc.content.size;
        setProposal({ from: end, to: end, original: "", proposed: text, label: "handwriting", block: true });
      }
      setHandwriting(false);
    } catch (e) {
      alert("Transcription failed (need a vision model — add an API key or pull one): " + e);
    } finally {
      setGen(null);
    }
  }

  async function runOcr(png: string) {
    if (busy || !editor) return;
    setGen("Reading (OCR)");
    setStream("");
    try {
      const { recognize } = await import("tesseract.js");
      const { data } = await recognize(png, "eng");
      const text = (data.text || "").trim();
      if (text) {
        const end = editor.state.doc.content.size;
        setProposal({ from: end, to: end, original: "", proposed: text, label: "handwriting (OCR)", block: true });
      } else {
        alert("OCR found no text. Tesseract works best on neat printing — for cursive, a vision model does better.");
      }
      setHandwriting(false);
    } catch (e) {
      alert("OCR failed: " + e);
    } finally {
      setGen(null);
    }
  }

  function applyProposal(resolved: string) {
    if (!editor || !proposal) return;
    const html = proposal.block ? textToHtml(resolved, isVerse) : textToInlineHtml(resolved);
    editor.chain().focus().insertContentAt({ from: proposal.from, to: proposal.to }, html).run();
    setProposal(null);
  }

  // expose actions to the sidebar Tools menu (latest closures; ref write, no re-render)
  useEffect(() => {
    toolActionsRef.current = {
      draft: runDraft,
      refine: runRefine,
      handwrite: () => setHandwriting(true),
      dictate: liveMode ? live.toggle : dictation.toggle,
      whisper: whisper.toggle,
    };
  });

  // push tool state when it changes (bounded — only on real state changes)
  const hasContent = !!editor && editor.getText().trim() !== "";
  useEffect(() => {
    onToolState({
      busy,
      connected,
      hasContent,
      hasInk: !!node.ink,
      isVerse,
      drafting: gen === "Drafting",
      dictating: dictation.active || live.active,
      dictationSupported: dictation.supported || live.supported,
      whisperRecording: whisper.recording,
      whisperBusy: whisper.busy,
      whisperSupported: whisper.supported,
    });
  }, [busy, connected, hasContent, node.ink, isVerse, gen, dictation.active, dictation.supported, live.active, live.supported, whisper.recording, whisper.busy, whisper.supported, onToolState]);

  useEffect(
    () => () => {
      onToolState(null);
      toolActionsRef.current = null;
    },
    [onToolState, toolActionsRef],
  );

  return (
    <div className="flex h-full flex-col">
      {/* title + brief */}
      <div className="border-b border-linesoft px-6 pt-4 pb-3">
        <input
          value={node.title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="w-full text-xl font-semibold text-fg outline-none"
        />
        <textarea
          value={node.synopsis}
          onChange={(e) => onSynopsisChange(e.target.value)}
          placeholder={isVerse ? "What is this poem about? (theme, image, form…)" : "Scene brief — what happens, who's present, the turn. The AI uses this to draft."}
          rows={2}
          className="mt-1 w-full resize-none rounded-md bg-surface px-2 py-1.5 text-sm text-dim outline-none focus:bg-elevated"
        />
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            value={node.pov}
            onChange={(e) => onPovChange(e.target.value)}
            placeholder="POV (optional)"
            className="w-44 rounded-md bg-surface px-2 py-1 text-xs text-dim outline-none focus:bg-elevated"
            title="POV character / label — shown in book view, useful for multi-POV stories"
          />
          <input
            value={node.epigraph}
            onChange={(e) => onEpigraphChange(e.target.value)}
            placeholder="Epigraph — an opening quote/aside (optional)"
            className="min-w-0 flex-1 rounded-md bg-surface px-2 py-1 text-xs italic text-dim outline-none focus:bg-elevated"
            title="A quote or aside shown before the prose in book view & export"
          />
        </div>
        {node.type !== "folder" && <ChapterArtRow node={node} onChapterArt={onChapterArt} />}
      </div>

      {proposal ? (
        <SuggestionReview
          original={proposal.original}
          proposed={proposal.proposed}
          label={proposal.label}
          paper={paper}
          onApply={applyProposal}
          onCancel={() => setProposal(null)}
        />
      ) : busy && gen !== "Drafting" ? (
        <GeneratingView label={gen!} text={stream} progress={progress} paper={paper} />
      ) : handwriting ? (
        <HandwriteCanvas
          initial={initialInk}
          paper={paper}
          busy={busy}
          connected={connected}
          onSaveInk={(ink) => onInkSave(JSON.stringify(ink))}
          onTranscribe={runTranscribe}
          onOcr={runOcr}
          onClose={() => setHandwriting(false)}
        />
      ) : (
        <>
          {editor && (
            <FormatBar
              editor={editor}
              onSave={onForceSave}
              paperKey={paperKey}
              onPaper={setPaperKey}
              spellOn={spellOn}
              onToggleSpell={toggleSpellcheck}
              manuscript={manuscript}
              onToggleManuscript={() => setManuscript((m) => !m)}
            />
          )}
          {(dictation.active || live.active) && (
            <div className="flex items-center gap-2 border-b border-linesoft bg-surface px-4 py-1.5 text-xs">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="text-dim">
                {live.active
                  ? live.progress ||
                    (live.busy ? "Transcribing your last phrase…" : "Listening on-device — speak, then pause and it types the phrase.")
                  : "Listening… speak and it types into the page."}
              </span>
              {dictation.active && dictation.interim && <span className="truncate italic text-mute">{dictation.interim}</span>}
            </div>
          )}
          {(whisper.recording || whisper.busy) && (
            <div className="flex items-center gap-2 border-b border-linesoft bg-surface px-4 py-1.5 text-xs">
              <span className={`h-2 w-2 rounded-full ${whisper.recording ? "animate-pulse bg-red-500" : "bg-brand"}`} />
              <span className="text-dim">
                {whisper.recording ? "Recording on-device (private)… click Stop to transcribe." : whisper.progress || "Transcribing…"}
              </span>
            </div>
          )}
          <div
            className={`flex-1 overflow-y-auto ${
              manuscript ? `manuscript-surface chap-${format.chapterStyle}${format.dropCap ? " dropcap" : ""}` : ""
            }`}
            style={
              {
                background: paper.bg,
                color: paper.fg,
                ...(manuscript
                  ? { "--book-body": BOOK_FONTS[format.bodyFont].stack, "--book-head": BOOK_FONTS[format.headingFont].stack }
                  : {}),
              } as CSSProperties
            }
          >
            <EditorContent editor={editor} className="h-full" />
          </div>
          {spellMenu && (
            <div
              className="fixed z-50 w-56 overflow-hidden rounded-lg border border-line bg-surface text-xs shadow-2xl"
              style={{ left: Math.min(spellMenu.x, window.innerWidth - 232), top: Math.min(spellMenu.y, window.innerHeight - 264) }}
              onClick={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
            >
              {spellMenu.phase === "menu" ? (
                <>
                  {spellMenu.flagged ? (
                    spellMenu.suggestions.length > 0 ? (
                      spellMenu.suggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => replaceWord(spellMenu.from, spellMenu.to, s)}
                          className="block w-full px-3 py-1.5 text-left text-fg hover:bg-elevated"
                        >
                          {s}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-1.5 text-mute">No suggestions</div>
                    )
                  ) : (
                    <div className="truncate px-3 py-1.5 text-mute">
                      “<span className="font-semibold text-fg">{spellMenu.word}</span>”
                    </div>
                  )}
                  <div className="border-t border-linesoft" />
                  <button
                    onClick={() => setSpellMenu({ ...spellMenu, phase: "define" })}
                    className="block w-full px-3 py-2 text-left font-medium text-brand hover:bg-elevated"
                  >
                    ＋ Add to dictionary…
                  </button>
                  <button
                    onClick={() => ignoreWord(spellMenu.word)}
                    className="block w-full px-3 py-1.5 text-left text-mute hover:bg-elevated"
                  >
                    Ignore (no definition)
                  </button>
                </>
              ) : (
                <div className="space-y-2 p-3">
                  <div className="text-mute">
                    Define <span className="font-semibold text-fg">“{spellMenu.word}”</span> for this project
                  </div>
                  <textarea
                    autoFocus
                    value={spellMenu.def}
                    onChange={(e) => setSpellMenu({ ...spellMenu, def: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveTerm(spellMenu.word, spellMenu.def);
                      if (e.key === "Escape") setSpellMenu(null);
                    }}
                    placeholder="What does it mean? (optional — the AI sees this too)"
                    rows={3}
                    className="w-full resize-y rounded border border-linesoft bg-surface px-2 py-1 text-xs text-fg outline-none focus:border-brand"
                  />
                  <button
                    onClick={() => saveTerm(spellMenu.word, spellMenu.def)}
                    className="w-full rounded bg-brand px-2 py-1.5 text-xs font-medium text-ink hover:bg-brand-dark"
                  >
                    Add to glossary
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FormatBar({
  editor,
  onSave,
  paperKey,
  onPaper,
  spellOn,
  onToggleSpell,
  manuscript,
  onToggleManuscript,
}: {
  editor: TiptapEditor;
  onSave: () => void;
  paperKey: string;
  onPaper: (k: string) => void;
  spellOn: boolean;
  onToggleSpell: () => void;
  manuscript: boolean;
  onToggleManuscript: () => void;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const h = () => force((n) => n + 1);
    editor.on("transaction", h);
    editor.on("selectionUpdate", h);
    return () => {
      editor.off("transaction", h);
      editor.off("selectionUpdate", h);
    };
  }, [editor]);

  const Btn = ({ on, label, title, click }: { on: boolean; label: string; title: string; click: () => void }) => (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={click}
      title={title}
      className={`rounded px-2 py-1 text-xs font-medium ${on ? "bg-brand text-ink" : "text-dim hover:bg-elevated"}`}
    >
      {label}
    </button>
  );

  const curFont = editor.getAttributes("textStyle").fontFamily ?? "";

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-linesoft px-3 py-1.5">
      <Btn on={editor.isActive("bold")} label="B" title="Bold (⌘B)" click={() => editor.chain().focus().toggleBold().run()} />
      <Btn on={editor.isActive("italic")} label="I" title="Italic (⌘I)" click={() => editor.chain().focus().toggleItalic().run()} />
      <Btn on={editor.isActive("underline")} label="U" title="Underline (⌘U)" click={() => editor.chain().focus().toggleUnderline().run()} />
      <Btn on={editor.isActive("strike")} label="S" title="Strikethrough" click={() => editor.chain().focus().toggleStrike().run()} />
      <span className="mx-1 h-4 w-px bg-elevated" />
      <Btn on={editor.isActive("heading", { level: 1 })} label="H1" title="Heading 1" click={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
      <Btn on={editor.isActive("heading", { level: 2 })} label="H2" title="Heading 2" click={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <Btn on={editor.isActive("bulletList")} label="•" title="Bullet list" click={() => editor.chain().focus().toggleBulletList().run()} />
      <Btn on={editor.isActive("orderedList")} label="1." title="Numbered list" click={() => editor.chain().focus().toggleOrderedList().run()} />
      <Btn on={editor.isActive("blockquote")} label="❝" title="Blockquote" click={() => editor.chain().focus().toggleBlockquote().run()} />
      <span className="mx-1 h-4 w-px bg-elevated" />
      {/* text alignment */}
      <Btn on={editor.isActive({ textAlign: "left" })} label="⇤" title="Align left" click={() => editor.chain().focus().setTextAlign("left").run()} />
      <Btn on={editor.isActive({ textAlign: "center" })} label="≡" title="Align center" click={() => editor.chain().focus().setTextAlign("center").run()} />
      <Btn on={editor.isActive({ textAlign: "right" })} label="⇥" title="Align right" click={() => editor.chain().focus().setTextAlign("right").run()} />
      <Btn on={editor.isActive({ textAlign: "justify" })} label="☰" title="Justify" click={() => editor.chain().focus().setTextAlign("justify").run()} />
      <span className="mx-1 h-4 w-px bg-elevated" />
      {/* highlight swatches */}
      {HIGHLIGHTS.map((c) => (
        <button
          key={c}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()}
          title="Highlight"
          className="h-5 w-5 rounded border border-line"
          style={{ backgroundColor: c }}
        />
      ))}
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().unsetHighlight().run()}
        title="Clear highlight"
        className="rounded px-1.5 py-1 text-xs text-dim hover:bg-elevated"
      >
        ⌫
      </button>
      <span className="mx-1 h-4 w-px bg-elevated" />
      <select
        value={curFont}
        onChange={(e) => {
          const v = e.target.value;
          if (v) editor.chain().focus().setFontFamily(v).run();
          else editor.chain().focus().unsetFontFamily().run();
        }}
        className="rounded border border-line bg-surface px-1.5 py-1 text-xs outline-none"
        title="Font"
      >
        {FONTS.map((f) => (
          <option key={f.label} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <Btn on={false} label="🖼" title="Insert image (or paste / drop one) — chapter art, figures, maps" click={() => pickImage(editor)} />
      {editor.isActive("image") && (
        <Btn
          on={!!editor.getAttributes("image").fullBleed}
          label="⛶ Bleed"
          title="Full-bleed: make this image its own full page (edge to edge) in book view & export — great for maps/plates"
          click={() => editor.chain().focus().updateAttributes("image", { fullBleed: !editor.getAttributes("image").fullBleed }).run()}
        />
      )}
      <span className="mx-1 h-4 w-px bg-elevated" />
      <Btn on={false} label="↶" title="Undo (⌘Z)" click={() => editor.chain().focus().undo().run()} />
      <Btn on={false} label="↷" title="Redo (⌘⇧Z)" click={() => editor.chain().focus().redo().run()} />
      <Btn
        on={spellOn}
        label="ABC✓"
        title="Spell check — underlines unknown words. Right-click a flagged word, or select any word, to add it to your dictionary."
        click={onToggleSpell}
      />
      <Btn
        on={manuscript}
        label="📖"
        title="Manuscript view — show the book formatting (theme fonts, drop caps, indents) as you write. Change the theme in Book view."
        click={onToggleManuscript}
      />
      <select
        value={paperKey}
        onChange={(e) => onPaper(e.target.value)}
        className="ml-auto rounded border border-line bg-surface px-1.5 py-1 text-xs text-dim outline-none"
        title="Paper color"
      >
        {Object.entries(PAPERS).map(([k, p]) => (
          <option key={k} value={k}>
            {p.label}
          </option>
        ))}
      </select>
      <button onClick={onSave} title="Save (⌘S)" className="rounded border border-line px-2.5 py-1 text-xs font-medium text-dim hover:bg-elevated">
        Save
      </button>
    </div>
  );
}


function GeneratingView({ label, text, progress, paper }: { label: string; text: string; progress?: string; paper: Paper }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-linesoft bg-surface px-4 py-2 text-xs text-dim">
        <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
        {progress ? <span className="text-brand">{progress}</span> : <>{label}… <span className="text-mute">writing — you'll review the suggestion next</span></>}
      </div>
      <div
        className="flex-1 overflow-y-auto whitespace-pre-wrap px-8 py-6 font-garamond text-[19px] leading-relaxed opacity-80"
        style={{ background: paper.bg, color: paper.fg }}
      >
        {text || "…"}
      </div>
    </div>
  );
}
