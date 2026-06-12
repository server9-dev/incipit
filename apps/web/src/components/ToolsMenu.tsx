import { useState, type MutableRefObject } from "react";
import { REFINE_LABELS, type RefineAction } from "@incipit/shared";

export type ToolState = {
  busy: boolean;
  connected: boolean;
  hasContent: boolean;
  hasInk: boolean;
  isVerse: boolean;
  drafting: boolean;
  dictating: boolean;
  dictationSupported: boolean;
  whisperRecording: boolean;
  whisperBusy: boolean;
  whisperSupported: boolean;
  reading: boolean;
  ttsSupported: boolean;
};

export type ToolActions = {
  draft: (mode: "draft" | "continue") => void;
  refine: (a: RefineAction) => void;
  handwrite: () => void;
  dictate: () => void;
  whisper: () => void;
  readAloud: () => void;
};

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

const REFINE_DESC: Record<RefineAction, string> = {
  show_dont_tell: "Rewrite the highlighted text to dramatize through action and sensory detail instead of stating it outright.",
  tighten: "Trim filler, redundancy, and weak qualifiers from the selection for a leaner read.",
  vary_rhythm: "Reshape sentence lengths across the selection for better cadence and flow.",
  sensory: "Layer grounded sensory detail (sight, sound, smell, touch) into the selection.",
  dialogue_polish: "Sharpen the selected dialogue — distinct voices, subtext, fewer on-the-nose lines.",
  rewrite: "Rewrite the selection for clarity and flow while preserving its meaning and voice.",
  expand: "Lengthen the selection with more detail, beats, and texture, staying in the same scene.",
  proofread: "Fix grammar, spelling, and punctuation in the selection without changing the voice.",
};

const offlineOk = (a: RefineAction) => a === "proofread" || a === "tighten";

export function ToolsMenu({ state, actionsRef }: { state: ToolState | null; actionsRef: MutableRefObject<ToolActions | null> }) {
  const [open, setOpen] = useState(true);
  const s = state;
  const act = () => actionsRef.current;
  const busy = !!s?.busy;
  const ready = !!s; // a scene is open

  const Btn = ({
    label,
    title,
    onClick,
    disabled,
    primary,
  }: {
    label: string;
    title: string;
    onClick: () => void;
    disabled?: boolean;
    primary?: boolean;
  }) => (
    <button
      onMouseDown={(e) => e.preventDefault()} // keep the editor's selection
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-full rounded-md px-2 py-1 text-left text-xs font-medium disabled:opacity-40 ${
        primary ? "bg-brand text-ink hover:bg-brand-dark" : "text-dim hover:bg-elevated"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="border-b border-linesoft">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-mute hover:text-fg"
      >
        Tools
        <span>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="space-y-2 px-2 pb-3">
          {!ready && <p className="px-1 text-[11px] text-mute">Select a scene to use the AI tools.</p>}

          <div className="space-y-0.5">
            <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-mute">Write</div>
            <Btn
              primary
              label={s?.drafting ? "Drafting…" : s?.isVerse ? "Draft verse" : "Draft scene"}
              title="Generate a full draft of this scene from your brief, in the project's voice and characters."
              disabled={!ready || busy || !s?.connected}
              onClick={() => act()?.draft("draft")}
            />
            <Btn
              label="Continue"
              title="Pick up where the prose leaves off and keep writing in the same voice."
              disabled={!ready || busy || !s?.connected || !s?.hasContent}
              onClick={() => act()?.draft("continue")}
            />
          </div>

          <div className="space-y-0.5">
            <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-mute">Capture</div>
            <Btn
              label={`✍ Handwrite${s?.hasInk ? " •" : ""}`}
              title="Write with a pen, stylus, or finger, then transcribe the ink to text — the original strokes are saved."
              disabled={!ready || busy || !s?.connected}
              onClick={() => act()?.handwrite()}
            />
            {s?.dictationSupported && (
              <Btn
                label={s?.dictating ? "● Stop dictation" : "🎤 Dictate"}
                title="Live speech-to-text — speak and it types into the page (uses the browser's cloud speech service)."
                disabled={!ready}
                onClick={() => act()?.dictate()}
              />
            )}
            {s?.whisperSupported && (
              <Btn
                label={s?.whisperBusy ? "Transcribing…" : s?.whisperRecording ? "● Stop recording" : "🎙 Whisper (private)"}
                title="Private on-device dictation — record a passage and transcribe it locally; audio never leaves your device."
                disabled={!ready || s?.whisperBusy}
                onClick={() => act()?.whisper()}
              />
            )}
            {s?.ttsSupported && (
              <Btn
                label={s?.reading ? "■ Stop reading" : "🔊 Read aloud"}
                title="Read the highlighted text aloud (or the whole scene if nothing is selected) using your device's voice."
                disabled={!ready}
                onClick={() => act()?.readAloud()}
              />
            )}
          </div>

          <div className="space-y-0.5">
            <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-mute">
              {s && !s.connected ? "Refine (offline: proofread & tighten)" : "Refine selection"}
            </div>
            {REFINE_ORDER.map((a) => (
              <Btn
                key={a}
                label={REFINE_LABELS[a]}
                title={REFINE_DESC[a]}
                disabled={!ready || busy || (!s?.connected && !offlineOk(a))}
                onClick={() => act()?.refine(a)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
