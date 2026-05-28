export type ChangeStatus = "accepted" | "rejected";

export type Segment =
  | { kind: "context"; text: string }
  | { kind: "change"; id: number; removed: string; added: string; status: ChangeStatus };

type Part = { value: string; added: boolean; removed: boolean };

/** Tokenize into words and whitespace runs so diffs land on word boundaries. */
function tokenize(s: string): string[] {
  return s.match(/\s+|\S+/g) ?? [];
}

/**
 * Word-level diff via longest-common-subsequence. Self-contained (no deps).
 * O(n·m) in token counts — fine for scene/chapter-length prose.
 */
function diffTokens(a: string[], b: string[]): Part[] {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i:] and b[j:]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const parts: Part[] = [];
  const push = (value: string, added: boolean, removed: boolean) => {
    const last = parts[parts.length - 1];
    if (last && last.added === added && last.removed === removed) last.value += value;
    else parts.push({ value, added, removed });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) push(a[i]!, false, false), i++, j++;
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) push(a[i]!, false, true), i++;
    else push(b[j]!, true, false), j++;
  }
  while (i < n) push(a[i]!, false, true), i++;
  while (j < m) push(b[j]!, true, false), j++;
  return parts;
}

/**
 * Diff original → proposed into a flat list of context spans and change hunks.
 * Each change hunk pairs a removed run with an added run (replacement,
 * insertion, or deletion). Changes default to "accepted".
 */
export function buildSegments(original: string, proposed: string): Segment[] {
  const parts = diffTokens(tokenize(original), tokenize(proposed));
  const segs: Segment[] = [];
  let id = 0;
  let removed = "";
  let added = "";

  const flush = () => {
    if (removed || added) {
      segs.push({ kind: "change", id: id++, removed, added, status: "accepted" });
      removed = "";
      added = "";
    }
  };

  for (const p of parts) {
    if (p.added) added += p.value;
    else if (p.removed) removed += p.value;
    else {
      flush();
      if (p.value) segs.push({ kind: "context", text: p.value });
    }
  }
  flush();
  return segs;
}

/** Resolve segments to final text given each change's accept/reject status. */
export function resolveSegments(segments: Segment[]): string {
  return segments
    .map((s) => (s.kind === "context" ? s.text : s.status === "rejected" ? s.removed : s.added))
    .join("");
}

export function countChanges(segments: Segment[]): number {
  return segments.filter((s) => s.kind === "change").length;
}
