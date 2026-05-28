# firstdraft-oss

An open-source, **local-first**, **provider-agnostic** AI writing assistant — an open
take on the templated AI-writing-app idea (template gallery → generate → edit with
inline AI suggestions).

Runs entirely on your machine against [Ollama](https://ollama.com) by default, with a
one-variable switch to OpenAI, Anthropic, Google, or any OpenAI-compatible gateway.

## Features

- **Template gallery** — task templates (blog post, email, SEO, social, scripts,
  resume, essay, …). Adding one is pure data.
- **Suggestion-card editor** *(in progress)* — inline, tracked AI edits you
  accept/reject.
- **Refine tools** — paraphrase, summarize, translate, proofread, rewrite, shorten,
  expand a selection.
- **Doc/PDF assistant** *(planned)* — upload a document and chat/edit against it (RAG).

## Stack

| Layer        | Choice                                            |
| ------------ | ------------------------------------------------- |
| LLM          | Vercel AI SDK (Ollama / OpenAI / Anthropic / Google) |
| Editor       | TipTap (ProseMirror)                              |
| Frontend     | React + Vite + Tailwind                           |
| Backend      | Hono (Node)                                       |
| Storage      | SQLite (better-sqlite3)                           |
| Monorepo     | pnpm workspaces                                   |

## Quickstart

```bash
pnpm install
cp .env.example .env          # defaults to local Ollama / gemma3-writer

# one-time: pull the writer model and bake in a 16k context window
ollama pull gemma3:12b
ollama create gemma3-writer -f models/gemma3-writer.Modelfile

pnpm dev                      # runs server + web
```

Requires Node ≥ 22 and a running Ollama. The default writer is **Gemma 3 12B** with
`num_ctx 16384` (Ollama otherwise caps context at ~2k regardless of the model's max).
Tune the window in `models/gemma3-writer.Modelfile`.

### Switch providers

```bash
# in .env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-...
# AI_MODEL=claude-sonnet-4-6   # optional override
```

## Layout

```
packages/shared   types + template definitions (the gallery is data here)
apps/server       Hono API: /generate, /refine, /documents, provider-agnostic AI layer
apps/web          React client (template gallery + editor)
```

## API

| Method | Path                  | Purpose                                  |
| ------ | --------------------- | ---------------------------------------- |
| GET    | `/api/health`         | status + active AI provider/model        |
| GET    | `/api/templates`      | template gallery                         |
| POST   | `/api/ai/generate`    | stream a draft from a template + values  |
| POST   | `/api/ai/refine`      | stream a refined version of a selection  |
| *      | `/api/documents`      | CRUD for saved documents                 |

## License

MIT
