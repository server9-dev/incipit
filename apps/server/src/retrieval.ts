import { embed, embedMany } from "ai";
import type { Entity } from "@incipit/shared";
import { getEmbeddingModel } from "./ai.js";
import { entities } from "./db.js";

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// nomic-style task prefixes sharpen query/document discrimination
const asDoc = (t: string) => `search_document: ${t}`;
const asQuery = (t: string) => `search_query: ${t}`;

/**
 * Semantically retrieve the story-bible entities most relevant to `query`.
 * Lazily embeds (and caches) any entities missing a vector. Returns [] when
 * the active provider has no embedding model — caller falls back to name-match.
 */
export async function relevantEntities(
  projectId: string,
  query: string,
  k = 6,
  threshold = 0.5,
): Promise<Entity[]> {
  const model = getEmbeddingModel();
  if (!model) return [];

  const rows = entities.embeddingRows(projectId);
  if (rows.length === 0) return [];

  const missing = rows.filter((r) => !r.vec);
  if (missing.length) {
    const { embeddings } = await embedMany({ model, values: missing.map((m) => asDoc(m.text)) });
    missing.forEach((m, i) => {
      m.vec = embeddings[i]!;
      entities.setEmbedding(m.id, embeddings[i]!);
    });
  }

  const { embedding: q } = await embed({ model, value: asQuery(query) });
  const scored = rows
    .filter((r) => r.vec)
    .map((r) => ({ id: r.id, score: cosine(q, r.vec!) }))
    .sort((a, b) => b.score - a.score)
    .filter((s) => s.score >= threshold)
    .slice(0, k);

  const byId = new Map(entities.listByProject(projectId).map((e) => [e.id, e]));
  return scored.map((s) => byId.get(s.id)).filter((e): e is Entity => !!e);
}
