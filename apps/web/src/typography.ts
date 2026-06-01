import { Extension, textInputRule } from "@tiptap/react";

/** Minimal smart-typography for prose. Type `--` for an em dash (—) and `...`
 *  for an ellipsis (…). Deliberately narrow: no smart quotes or symbol
 *  substitutions, so straight quotes and everything else stay exactly as typed.
 *  Both conversions undo with Backspace (or Ctrl+Z) right after they fire. */
export const typographyExtension = Extension.create({
  name: "incipitTypography",
  addInputRules() {
    return [
      textInputRule({ find: /--$/, replace: "—" }),
      textInputRule({ find: /\.\.\.$/, replace: "…" }),
    ];
  },
});
