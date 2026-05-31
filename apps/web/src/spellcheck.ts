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
    const mod = (await import("an-array-of-english-words")) as { default: string[] };
    wordSet = new Set(mod.default); // already lowercase
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
