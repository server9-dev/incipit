import { useState } from "react";
import type { Project } from "@incipit/shared";

export function ProjectSetup({
  project,
  onChange,
}: {
  project: Project;
  onChange: (patch: Partial<Project>) => void;
}) {
  const [open, setOpen] = useState(false);

  const field = (label: string, key: keyof Project, placeholder: string) => (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-wide text-mute">{label}</label>
      <input
        value={(project[key] as string) ?? ""}
        onChange={(e) => onChange({ [key]: e.target.value } as Partial<Project>)}
        placeholder={placeholder}
        className="w-full rounded border border-linesoft bg-surface px-2 py-1 text-xs outline-none focus:border-brand"
      />
    </div>
  );

  return (
    <div className="border-b border-linesoft">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-mute hover:text-dim"
      >
        Project voice
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          {field("Genre", "genre", "e.g. literary, noir")}
          {field("POV", "pov", "e.g. first person")}
          {field("Tense", "tense", "e.g. past")}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-mute">Premise</label>
            <textarea
              value={project.synopsis}
              onChange={(e) => onChange({ synopsis: e.target.value })}
              placeholder="One-line logline"
              rows={2}
              className="w-full resize-none rounded border border-linesoft bg-surface px-2 py-1 text-xs outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-mute">Voice / style</label>
            <textarea
              value={project.styleNotes}
              onChange={(e) => onChange({ styleNotes: e.target.value })}
              placeholder="Tone, influences, dos and don'ts the AI should follow"
              rows={2}
              className="w-full resize-none rounded border border-linesoft bg-surface px-2 py-1 text-xs outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-mute">Scene break</label>
            <input
              value={project.sceneBreak}
              onChange={(e) => onChange({ sceneBreak: e.target.value })}
              placeholder="#"
              className="w-full rounded border border-linesoft bg-surface px-2 py-1 text-xs text-fg outline-none focus:border-brand"
            />
            <div className="mt-1 flex flex-wrap gap-1">
              {["#", "* * *", "❧", "⁂", "◆ ◆ ◆", "～"].map((g) => (
                <button
                  key={g}
                  onClick={() => onChange({ sceneBreak: g })}
                  className="rounded border border-linesoft px-1.5 py-0.5 text-[11px] text-dim hover:bg-elevated"
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
