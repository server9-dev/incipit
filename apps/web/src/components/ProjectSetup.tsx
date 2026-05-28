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
      <label className="block text-[10px] font-medium uppercase tracking-wide text-neutral-400">{label}</label>
      <input
        value={(project[key] as string) ?? ""}
        onChange={(e) => onChange({ [key]: e.target.value } as Partial<Project>)}
        placeholder={placeholder}
        className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-xs outline-none focus:border-neutral-900"
      />
    </div>
  );

  return (
    <div className="border-b border-neutral-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 hover:text-neutral-700"
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
            <label className="block text-[10px] font-medium uppercase tracking-wide text-neutral-400">Premise</label>
            <textarea
              value={project.synopsis}
              onChange={(e) => onChange({ synopsis: e.target.value })}
              placeholder="One-line logline"
              rows={2}
              className="w-full resize-none rounded border border-neutral-200 bg-white px-2 py-1 text-xs outline-none focus:border-neutral-900"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-neutral-400">Voice / style</label>
            <textarea
              value={project.styleNotes}
              onChange={(e) => onChange({ styleNotes: e.target.value })}
              placeholder="Tone, influences, dos and don'ts the AI should follow"
              rows={2}
              className="w-full resize-none rounded border border-neutral-200 bg-white px-2 py-1 text-xs outline-none focus:border-neutral-900"
            />
          </div>
        </div>
      )}
    </div>
  );
}
