/* ------------------------------------------------------------------ *
 * Book formatting themes (Atticus-style) + story-bible profile templates.
 * Shared so Book view, EPUB export, and the editors all agree.
 * ------------------------------------------------------------------ */

/* ------------------------------- fonts ---------------------------------- */

export type BookFont = "garamond" | "georgia" | "baskerville" | "sans";

export const BOOK_FONTS: Record<BookFont, { label: string; stack: string }> = {
  garamond: { label: "EB Garamond", stack: `"EB Garamond", Georgia, serif` },
  georgia: { label: "Georgia", stack: `Georgia, "Times New Roman", serif` },
  baskerville: { label: "Baskerville", stack: `"Libre Baskerville", Baskerville, Georgia, serif` },
  sans: { label: "Sans", stack: `"Helvetica Neue", Arial, sans-serif` },
};

/* ----------------------------- scene breaks ----------------------------- */

/** A palette of scene-break ornaments to choose from. */
export const ORNAMENTS = ["#", "* * *", "• • •", "❧", "⁂", "❦", "◆ ◆ ◆", "～"];

/* ------------------------------- themes --------------------------------- */

export type ChapterStyle = "centered" | "left" | "numbered" | "smallcaps";

export type ProjectFormat = {
  /** preset key, or "custom" once the reader tweaks an individual control */
  theme: string;
  dropCap: boolean;
  chapterStyle: ChapterStyle;
  ornament: string;
  bodyFont: BookFont;
  headingFont: BookFont;
};

export const FORMAT_THEMES: { key: string; label: string; format: Omit<ProjectFormat, "theme"> }[] = [
  {
    key: "classic",
    label: "Classic",
    format: { dropCap: true, chapterStyle: "centered", ornament: "#", bodyFont: "garamond", headingFont: "garamond" },
  },
  {
    key: "modern",
    label: "Modern",
    format: { dropCap: false, chapterStyle: "left", ornament: "• • •", bodyFont: "georgia", headingFont: "sans" },
  },
  {
    key: "literary",
    label: "Literary",
    format: { dropCap: true, chapterStyle: "smallcaps", ornament: "❧", bodyFont: "baskerville", headingFont: "baskerville" },
  },
  {
    key: "romance",
    label: "Romance",
    format: { dropCap: true, chapterStyle: "numbered", ornament: "❦", bodyFont: "garamond", headingFont: "garamond" },
  },
];

export const DEFAULT_FORMAT: ProjectFormat = { theme: "classic", ...FORMAT_THEMES[0]!.format };

export function parseFormat(s: string): ProjectFormat {
  if (!s) return { ...DEFAULT_FORMAT };
  try {
    const o = JSON.parse(s) as Partial<ProjectFormat>;
    const font = (v: unknown, d: BookFont): BookFont => (typeof v === "string" && v in BOOK_FONTS ? (v as BookFont) : d);
    const styles: ChapterStyle[] = ["centered", "left", "numbered", "smallcaps"];
    return {
      theme: typeof o.theme === "string" ? o.theme : "custom",
      dropCap: typeof o.dropCap === "boolean" ? o.dropCap : DEFAULT_FORMAT.dropCap,
      chapterStyle: styles.includes(o.chapterStyle as ChapterStyle) ? (o.chapterStyle as ChapterStyle) : DEFAULT_FORMAT.chapterStyle,
      ornament: typeof o.ornament === "string" && o.ornament ? o.ornament : DEFAULT_FORMAT.ornament,
      bodyFont: font(o.bodyFont, DEFAULT_FORMAT.bodyFont),
      headingFont: font(o.headingFont, DEFAULT_FORMAT.headingFont),
    };
  } catch {
    return { ...DEFAULT_FORMAT };
  }
}

/* ------------------------- story-bible profiles ------------------------- */

import type { EntityType } from "./types.js";

/** Templated profile fields per entity type (Reedsy/Sudowrite-style sheets). */
export const ENTITY_TEMPLATES: Record<EntityType, string[]> = {
  character: ["Role", "Age", "Appearance", "Personality", "Goal", "Motivation", "Conflict", "Arc", "Backstory"],
  location: ["Type", "Description", "Atmosphere", "Significance"],
  item: ["Type", "Description", "Significance"],
  lore: ["Category", "Description"],
  term: ["Definition"],
};

/** Fields that want a multi-line textarea rather than a single-line input. */
export const LONG_FIELDS = new Set(["Appearance", "Personality", "Backstory", "Description", "Significance", "Definition"]);

export type EntityRelationship = { id: string; label: string };
export type EntityProfile = {
  fields: Record<string, string>;
  relationships: EntityRelationship[];
  image: string; // data URL, or ""
};

export const emptyProfile = (): EntityProfile => ({ fields: {}, relationships: [], image: "" });

export function parseProfile(s: string): EntityProfile {
  if (!s) return emptyProfile();
  try {
    const o = JSON.parse(s) as Partial<EntityProfile>;
    return {
      fields: o.fields && typeof o.fields === "object" ? (o.fields as Record<string, string>) : {},
      relationships: Array.isArray(o.relationships)
        ? o.relationships
            .filter((r): r is EntityRelationship => !!r && typeof r.id === "string")
            .map((r) => ({ id: r.id, label: typeof r.label === "string" ? r.label : "" }))
        : [],
      image: typeof o.image === "string" ? o.image : "",
    };
  } catch {
    return emptyProfile();
  }
}
