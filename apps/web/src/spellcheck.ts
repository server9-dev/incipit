import { Extension, type Editor } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

const DICT_KEY = "incipit-dictionary"; // user's personal "added" words
const SPELL_KEY = "incipit-spellcheck"; // "0" = off

let wordSet: Set<string> | null = null;
let loading: Promise<Set<string>> | null = null;

/** Lazily load the (large) English word list, once, on first use. */
export async function loadDictionary(): Promise<Set<string>> {
  if (wordSet) return wordSet;
  if (loading) return loading;
  loading = (async () => {
    const mod = (await import("an-array-of-english-words")) as unknown;
    // Depending on the bundler's CJS↔ESM interop, this resolves either to the
    // array itself or to a namespace whose `default` is the array.
    const words = (Array.isArray(mod) ? mod : (mod as { default?: string[] })?.default) ?? [];
    wordSet = new Set(words); // already lowercase
    return wordSet;
  })();
  return loading;
}
export const dictionaryReady = () => wordSet !== null;

export function getCustomWords(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DICT_KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}
export function addCustomWord(word: string) {
  const s = getCustomWords();
  s.add(word.toLowerCase());
  localStorage.setItem(DICT_KEY, JSON.stringify([...s]));
}

export const spellcheckEnabled = () => localStorage.getItem(SPELL_KEY) !== "0";
export const setSpellcheckEnabled = (on: boolean) => localStorage.setItem(SPELL_KEY, on ? "1" : "0");

const stripPossessive = (w: string) => w.toLowerCase().replace(/['’]s$/, "").replace(/’/g, "'");

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
function edits1(word: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i <= word.length; i++) {
    const a = word.slice(0, i);
    const b = word.slice(i);
    if (b) out.add(a + b.slice(1)); // delete
    if (b.length > 1) out.add(a + b[1] + b[0] + b.slice(2)); // transpose
    for (const c of LETTERS) {
      if (b) out.add(a + c + b.slice(1)); // replace
      out.add(a + c + b); // insert
    }
  }
  return out;
}

/** Suggest likely correct spellings for an unknown word (edit-distance 1, then 2). */
export function suggest(word: string): string[] {
  if (!wordSet) return [];
  const w = word.toLowerCase();
  const e1 = edits1(w);
  const found = new Set<string>();
  for (const e of e1) if (wordSet.has(e)) found.add(e);
  if (found.size < 5) {
    for (const a of e1) {
      for (const b of edits1(a)) if (wordSet.has(b)) found.add(b);
      if (found.size >= 12) break;
    }
  }
  const cap = /^[A-Z]/.test(word);
  return [...found]
    .filter((s) => s !== w)
    .slice(0, 6)
    .map((s) => (cap ? s.charAt(0).toUpperCase() + s.slice(1) : s));
}

function buildDecorations(doc: PMNode, extra: Set<string>): DecorationSet {
  if (!wordSet || !spellcheckEnabled()) return DecorationSet.empty;
  const custom = getCustomWords();
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    const re = /[A-Za-z][A-Za-z'’]*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const word = m[0];
      if (word.length < 2) continue;
      if (word === word.toUpperCase()) continue; // skip acronyms (NASA, AI…)
      const lw = stripPossessive(word);
      if (wordSet!.has(lw) || custom.has(lw) || extra.has(lw)) continue;
      const from = pos + m.index;
      decos.push(Decoration.inline(from, from + word.length, { class: "spell-error" }));
    }
  });
  return DecorationSet.create(doc, decos);
}

export const spellcheckKey = new PluginKey("spellcheck");

/** TipTap extension that underlines words not in the dictionary (English +
 *  personal + the supplied extra set, e.g. story-bible names). */
export function spellcheckExtension(getExtra: () => Set<string>) {
  return Extension.create({
    name: "spellcheck",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: spellcheckKey,
          state: {
            init: (_cfg, state) => buildDecorations(state.doc, getExtra()),
            apply(tr, old) {
              if (tr.getMeta(spellcheckKey) === "refresh") return buildDecorations(tr.doc, getExtra());
              if (tr.docChanged) return buildDecorations(tr.doc, getExtra());
              return old.map(tr.mapping, tr.doc);
            },
          },
          props: {
            decorations(state) {
              return spellcheckKey.getState(state) as DecorationSet | undefined;
            },
          },
        }),
      ];
    },
  });
}

/** Force the spellcheck decorations to recompute (after the dictionary loads,
 *  a word is added, or the feature is toggled). */
export function refreshSpellcheck(editor: Editor) {
  editor.view.dispatch(editor.view.state.tr.setMeta(spellcheckKey, "refresh"));
}
