import { FRAMEWORK_BEATS, OUTLINE_FRAMEWORK_LABELS, type OutlineFramework, type RefineAction } from "@incipit/shared";

/**
 * Pure-JS, no-model fallbacks. Deterministic and offline — not as good as an
 * LLM, but they keep core craft usable on any hardware with nothing connected.
 */

function recapitalize(s: string): string {
  // capitalize the first letter at string start, after sentence punctuation, or after a newline
  return s.replace(/(^\s*|[.!?]["')\]]?\s+|\n+\s*)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

export function localProofread(t: string): string {
  let s = t;
  s = s.replace(/[ \t]{2,}/g, " "); // collapse runs of spaces
  s = s.replace(/[ \t]+([,.;:!?])/g, "$1"); // no space before punctuation
  s = s.replace(/([,;:])(?=\S)/g, "$1 "); // space after , ; :
  s = s.replace(/([.!?])(?=[A-Za-z])/g, "$1 "); // space after sentence end
  s = s.replace(/\bi\b/g, "I"); // standalone "i"
  s = s.replace(/,{2,}/g, ",").replace(/\.{4,}/g, "..."); // dupe punctuation
  s = recapitalize(s);
  return s.trim();
}

const FILLERS = [
  "very", "really", "just", "quite", "rather", "somewhat", "actually", "basically", "simply",
  "literally", "totally", "completely", "absolutely", "definitely", "certainly", "truly",
  "extremely", "fairly", "pretty much", "kind of", "sort of", "a bit", "a little",
];
const PHRASES: [RegExp, string][] = [
  [/\bin order to\b/gi, "to"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bat this (?:point|moment) in time\b/gi, "now"],
  [/\bin spite of the fact that\b/gi, "although"],
  [/\bthe fact that\b/gi, "that"],
  [/\bin the event that\b/gi, "if"],
  [/\bwas able to\b/gi, "could"],
  [/\bbegan to\b/gi, ""],
  [/\bstarted to\b/gi, ""],
];
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function localTighten(t: string): string {
  let s = t;
  for (const [re, rep] of PHRASES) s = s.replace(re, rep);
  s = s.replace(new RegExp(`\\b(?:${FILLERS.map(esc).join("|")})\\b`, "gi"), "");
  s = s.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([,.;:!?])/g, "$1");
  s = recapitalize(s);
  return s.trim();
}

/** Whether a refine action has an offline (no-model) implementation. */
export const LOCAL_REFINE: Partial<Record<RefineAction, (t: string) => string>> = {
  proofread: localProofread,
  tighten: localTighten,
};

/** Fillable beat-sheet scaffold from a framework (used when no model is connected). */
export function localOutlineScaffold(framework: OutlineFramework, premise: string): string {
  const beats = FRAMEWORK_BEATS[framework];
  const head = `# Outline — ${OUTLINE_FRAMEWORK_LABELS[framework]}\n\n${premise ? `**Premise:** ${premise}\n\n` : ""}`;
  if (!beats.length) return head + "_Write your own beats here._";
  return head + beats.map((b) => `## ${b}\n- \n`).join("\n");
}
