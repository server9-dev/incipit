# firstdraft-oss

An open-source, **local-first** fiction writing studio — for **novels, short stories, and
verse**. Plan structure, draft prose, and refine your craft with AI that runs entirely on
your own machine and stays consistent with your story bible.

Provider-agnostic: runs against [Ollama](https://ollama.com) by default, with a
one-variable switch to OpenAI, Anthropic, Google, or any OpenAI-compatible gateway.

## Features

- **Structured manuscript** — Project → sections → chapters → scenes (plus short-story
  and verse project types). Add, navigate, and organize a whole book.
- **Story bible** — wiki-style characters, locations, items, and lore. The AI pulls these
  into context so names and facts stay consistent when it drafts.
- **AI scene drafting** — write a scene brief, hit **Draft**, and get prose in your
  project's POV, tense, genre, and voice. **Continue** extends what's there.
- **Story structure** — generate beat-sheet outlines (Three-Act, Save the Cat, Hero's
  Journey, Snowflake) from your premise.
- **Line-craft refine** — fiction-tuned tools on any selection: *show-don't-tell,
  tighten, vary rhythm, add sensory, polish dialogue, rewrite, expand, proofread*.

## Stack

| Layer    | Choice                                               |
| -------- | ---------------------------------------------------- |
| LLM      | Vercel AI SDK (Ollama / OpenAI / Anthropic / Google) |
| Frontend | React + Vite + Tailwind                              |
| Backend  | Hono (Node)                                          |
| Storage  | SQLite (better-sqlite3)                              |
| Monorepo | pnpm workspaces                                      |

## Quickstart

```bash
pnpm install
cp .env.example .env          # defaults to local Ollama / gemma3-writer

# one-time: pull the writer model and bake in a 16k context window
ollama pull gemma3:12b
ollama create gemma3-writer -f models/gemma3-writer.Modelfile

pnpm dev                      # runs server (:8787) + web (:5173)
```

Open **http://localhost:5173**. Requires Node ≥ 22 and a running Ollama. The default
writer is **Gemma 3 12B** with `num_ctx 16384` (Ollama otherwise caps context at ~2k
regardless of the model's max). Tune the window in `models/gemma3-writer.Modelfile`.

### Switch providers

```bash
# in .env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-...
# AI_MODEL=claude-sonnet-4-6   # optional override
```

## Layout

```
packages/shared   types, project scaffolds, story-structure frameworks, AI prompt builders
apps/server       Hono API: projects / nodes / entities CRUD + draft / outline / refine
apps/web          React client: project list + manuscript tree + editor + story bible
```

## API

| Method | Path                       | Purpose                                   |
| ------ | -------------------------- | ----------------------------------------- |
| GET    | `/api/health`              | status + active AI provider/model         |
| *      | `/api/projects`            | project CRUD (+ `/:id/full` for the tree) |
| *      | `/api/nodes`               | manuscript node CRUD                       |
| *      | `/api/entities`            | story-bible CRUD                          |
| POST   | `/api/ai/draft`            | draft/continue a scene, grounded in bible |
| POST   | `/api/ai/outline`          | generate a beat-sheet outline             |
| POST   | `/api/ai/refine`           | fiction line-craft refine of a passage    |

## License

MIT
