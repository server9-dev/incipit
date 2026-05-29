# Incipit

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

## Runs anywhere, no server

Incipit is **client-only** — there is no backend process. Everything (your
manuscript, story bible, settings) lives in the browser via IndexedDB, and AI
runs through whichever engine you pick:

- **Ollama** (local) — default, talks to `localhost:11434` directly
- **On-device (WebLLM, WebGPU)** — a small model in the browser, even on a phone; free + private
- **Cloud API key** (OpenAI; Anthropic/Google in the desktop build)
- **No model** — heuristic proofread/tighten, outline scaffolds, Tesseract OCR

Ships three ways from one codebase: a **web app**, an installable **PWA**, and
native **desktop + mobile** apps via **Tauri 2**.

## Stack

| Layer     | Choice                                                            |
| --------- | ----------------------------------------------------------------- |
| UI        | React + Vite + Tailwind + TipTap (ProseMirror)                    |
| Storage   | IndexedDB via Dexie (in-browser, local-first)                     |
| AI        | client-side: Ollama / OpenAI (Vercel AI SDK) + WebLLM on-device; Whisper & Tesseract for input |
| Packaging | PWA (vite-plugin-pwa) + Tauri 2 (desktop & mobile)                |
| Monorepo  | pnpm workspaces                                                   |

## Quickstart (web / PWA)

```bash
pnpm install
pnpm dev          # web app at http://localhost:5173 — no server needed
```

Optional, for local AI via Ollama (otherwise use the on-device model or an API key):

```bash
ollama pull gemma3:12b
ollama create gemma3-writer -f models/gemma3-writer.Modelfile
# allow the browser origin to reach Ollama:
OLLAMA_ORIGINS=* ollama serve
```

`pnpm --filter @incipit/web build` produces an installable PWA in `apps/web/dist`.

## Desktop & mobile (Tauri)

```bash
pnpm desktop:dev      # native dev window (loads the Vite dev server)
pnpm desktop:build    # bundle a native desktop app
```

Requires the Rust toolchain plus your OS's webview build deps (on Debian/Ubuntu:
`libwebkit2gtk-4.1-dev libdbus-1-dev pkg-config build-essential`). For mobile:
`pnpm tauri android init` / `pnpm tauri ios init` (needs Android Studio / Xcode).
The Tauri build also unlocks Anthropic/Google direct calls (no browser CORS).

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
apps/web          the whole app — UI + client store (store/db.ts) + client AI (store/ai.ts)
src-tauri         Tauri 2 shell for native desktop & mobile
apps/server       legacy Node backend — no longer used by the app (kept for reference)
```

The client store (`apps/web/src/store/db.ts`) and client AI (`apps/web/src/store/ai.ts`)
replace what used to be the Node server; `apps/web/src/api.ts` keeps the same function
surface so the UI is storage-agnostic.

## License

MIT
