import { useEffect, useState } from "react";
import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle, FontFamily } from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import { REFINE_LABELS, type StoryNode, type RefineAction } from "@incipit/shared";
import { draft as draftApi, refine as refineApi } from "../api.js";
import { SuggestionReview } from "./SuggestionReview.js";
import { initialHtml, textToHtml, textToInlineHtml } from "../richtext.js";

const REFINE_ORDER: RefineAction[] = [
  "show_dont_tell",
  "tighten",
  "vary_rhythm",
  "sensory",
  "dialogue_polish",
  "rewrite",
  "expand",
  "proofread",
];

const FONTS = [
  { label: "Garamond", value: "" }, // editor default (EB Garamond)
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times", value: '"Times New Roman", Times, serif' },
  { label: "Sans", value: "Helvetica, Arial, sans-serif" },
  { label: "Mono", value: '"Courier New", monospace' },
];

const HIGHLIGHTS = ["#fef08a", "#bbf7d0", "#fbcfe8", "#bfdbfe"];

type Proposal = {
  from: number;
  to: number;
  original: string;
  proposed: string;
  label: string;
  block: boolean; // insert as paragraphs vs inline
};

export function Editor({
  node,
  projectId,
  onContentChange,
  onSynopsisChange,
  onTitleChange,
  onForceSave,
}: {
  node: StoryNode;
  projectId: string;
  onContentChange: (v: string) => void;
  onSynopsisChange: (v: string) => void;
  onTitleChange: (v: string) => void;
  onForceSave: () => void;
}) {
  const isVerse = node.type === "poem";
  const [gen, setGen] = useState<string | null>(null);
  const [stream, setStream] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: true }),
      TextStyle,
      FontFamily,
      Placeholder.configure({
        placeholder: isVerse
          ? "Write your verse here, or hit Draft verse."
          : "Write here, or hit Draft scene. Select a passage and pick a craft tool — edits come back as suggestions you can accept or reject.",
      }),
    ],
    content: initialHtml(node.content, isVerse),
    onUpdate: ({ editor }) => onContentChange(editor.getHTML()),
    editorProps: { attributes: { class: `incipit-prose font-garamond ${isVerse ? "verse" : ""}` } },
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

  const busy = gen !== null;

  async function runDraft(mode: "draft" | "continue") {
    if (busy || !editor) return;
    const docSize = editor.state.doc.content.size;
    const empty = editor.getText().trim() === "";

    if (mode === "draft" && empty) {
      setGen("Drafting");
      setStream("");
      let acc = "";
      try {
        await draftApi({ projectId, nodeId: node.id, mode }, (ch) => {
          acc += ch;
          setStream(acc);
        });
        editor.chain().focus().setContent(textToHtml(acc, isVerse)).run();
      } catch (e) {
        alert("Draft failed: " + e);
      } finally {
        setGen(null);
      }
      return;
    }

    const range = mode === "continue" ? { from: docSize, to: docSize } : { from: 0, to: docSize };
    const original = mode === "continue" ? "" : editor.getText();

    setGen(mode === "continue" ? "Continuing" : "Re-drafting");
    setStream("");
    let acc = "";
    try {
      await draftApi({ projectId, nodeId: node.id, mode }, (ch) => {
        acc += ch;
        setStream(acc);
      });
      setProposal({ ...range, original, proposed: acc, label: mode === "continue" ? "continuation" : "re-draft", block: true });
    } catch (e) {
      alert("Draft failed: " + e);
    } finally {
      setGen(null);
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

    setGen(REFINE_LABELS[action]);
    setStream("");
    let acc = "";
    try {
      await refineApi({ action, text: original, projectId }, (ch) => {
        acc += ch;
        setStream(acc);
      });
      setProposal({ from, to, original, proposed: acc, label: REFINE_LABELS[action], block: wholeDoc });
    } catch (e) {
      alert("Refine failed: " + e);
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

  return (
    <div className="flex h-full flex-col">
      {/* title + brief */}
      <div className="border-b border-neutral-200 px-6 pt-4 pb-3">
        <input
          value={node.title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="w-full text-xl font-semibold text-neutral-900 outline-none"
        />
        <textarea
          value={node.synopsis}
          onChange={(e) => onSynopsisChange(e.target.value)}
          placeholder={isVerse ? "What is this poem about? (theme, image, form…)" : "Scene brief — what happens, who's present, the turn. The AI uses this to draft."}
          rows={2}
          className="mt-1 w-full resize-none rounded-md bg-neutral-50 px-2 py-1.5 text-sm text-neutral-600 outline-none focus:bg-neutral-100"
        />
      </div>

      {proposal ? (
        <SuggestionReview
          original={proposal.original}
          proposed={proposal.proposed}
          label={proposal.label}
          onApply={applyProposal}
          onCancel={() => setProposal(null)}
        />
      ) : busy && gen !== "Drafting" ? (
        <GeneratingView label={gen!} text={stream} />
      ) : (
        <>
          {editor && <FormatBar editor={editor} onSave={onForceSave} />}
          <AiBar isVerse={isVerse} busy={busy} drafting={gen === "Drafting"} hasContent={!!editor && editor.getText().trim() !== ""} onDraft={runDraft} onRefine={runRefine} />
          <div className="flex-1 overflow-y-auto">
            <EditorContent editor={editor} className="h-full" />
          </div>
        </>
      )}
    </div>
  );
}

function FormatBar({ editor, onSave }: { editor: TiptapEditor; onSave: () => void }) {
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
      className={`rounded px-2 py-1 text-xs font-medium ${on ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-200"}`}
    >
      {label}
    </button>
  );

  const curFont = editor.getAttributes("textStyle").fontFamily ?? "";

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-neutral-200 px-3 py-1.5">
      <Btn on={editor.isActive("bold")} label="B" title="Bold (⌘B)" click={() => editor.chain().focus().toggleBold().run()} />
      <Btn on={editor.isActive("italic")} label="I" title="Italic (⌘I)" click={() => editor.chain().focus().toggleItalic().run()} />
      <Btn on={editor.isActive("underline")} label="U" title="Underline (⌘U)" click={() => editor.chain().focus().toggleUnderline().run()} />
      <Btn on={editor.isActive("strike")} label="S" title="Strikethrough" click={() => editor.chain().focus().toggleStrike().run()} />
      <span className="mx-1 h-4 w-px bg-neutral-200" />
      <Btn on={editor.isActive("heading", { level: 1 })} label="H1" title="Heading 1" click={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
      <Btn on={editor.isActive("heading", { level: 2 })} label="H2" title="Heading 2" click={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <Btn on={editor.isActive("bulletList")} label="•" title="Bullet list" click={() => editor.chain().focus().toggleBulletList().run()} />
      <Btn on={editor.isActive("orderedList")} label="1." title="Numbered list" click={() => editor.chain().focus().toggleOrderedList().run()} />
      <Btn on={editor.isActive("blockquote")} label="❝" title="Blockquote" click={() => editor.chain().focus().toggleBlockquote().run()} />
      <span className="mx-1 h-4 w-px bg-neutral-200" />
      {/* highlight swatches */}
      {HIGHLIGHTS.map((c) => (
        <button
          key={c}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()}
          title="Highlight"
          className="h-5 w-5 rounded border border-neutral-300"
          style={{ backgroundColor: c }}
        />
      ))}
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().unsetHighlight().run()}
        title="Clear highlight"
        className="rounded px-1.5 py-1 text-xs text-neutral-500 hover:bg-neutral-200"
      >
        ⌫
      </button>
      <span className="mx-1 h-4 w-px bg-neutral-200" />
      <select
        value={curFont}
        onChange={(e) => {
          const v = e.target.value;
          if (v) editor.chain().focus().setFontFamily(v).run();
          else editor.chain().focus().unsetFontFamily().run();
        }}
        className="rounded border border-neutral-300 bg-white px-1.5 py-1 text-xs outline-none"
        title="Font"
      >
        {FONTS.map((f) => (
          <option key={f.label} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <span className="mx-1 h-4 w-px bg-neutral-200" />
      <Btn on={false} label="↶" title="Undo (⌘Z)" click={() => editor.chain().focus().undo().run()} />
      <Btn on={false} label="↷" title="Redo (⌘⇧Z)" click={() => editor.chain().focus().redo().run()} />
      <button onClick={onSave} title="Save (⌘S)" className="ml-auto rounded border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100">
        Save
      </button>
    </div>
  );
}

function AiBar({
  isVerse,
  busy,
  drafting,
  hasContent,
  onDraft,
  onRefine,
}: {
  isVerse: boolean;
  busy: boolean;
  drafting: boolean;
  hasContent: boolean;
  onDraft: (mode: "draft" | "continue") => void;
  onRefine: (a: RefineAction) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-neutral-200 bg-neutral-50/60 px-4 py-2">
      <button
        onClick={() => onDraft("draft")}
        disabled={busy}
        className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
      >
        {drafting ? "Drafting…" : isVerse ? "Draft verse" : "Draft scene"}
      </button>
      <button
        onClick={() => onDraft("continue")}
        disabled={busy || !hasContent}
        className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
      >
        Continue
      </button>
      <span className="mx-1 h-4 w-px bg-neutral-200" />
      <span className="text-[11px] text-neutral-400">Suggest on selection:</span>
      {REFINE_ORDER.map((a) => (
        <button
          key={a}
          onClick={() => onRefine(a)}
          disabled={busy}
          className="rounded-md border border-neutral-300 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
        >
          {REFINE_LABELS[a]}
        </button>
      ))}
    </div>
  );
}

function GeneratingView({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-xs text-neutral-500">
        <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
        {label}… <span className="text-neutral-400">writing — you'll review the suggestion next</span>
      </div>
      <div className="flex-1 overflow-y-auto whitespace-pre-wrap px-8 py-6 font-garamond text-[19px] leading-relaxed text-neutral-500">
        {text || "…"}
      </div>
    </div>
  );
}
