# Incipit

An open-source, **local-first** fiction writing studio — for **novels, short stories, and
verse**. Plan structure, draft prose, and refine your craft with AI that runs entirely on
your own machine and stays consistent with your story bible.

Provider-agnostic: runs on an on-device model (WebGPU), local [Ollama](https://ollama.com),
or a cloud key — your writing never leaves your machine.

## Download

Get the latest native app from the [**Releases**](https://github.com/server9-dev/incipit/releases/latest) page:

| Platform | File |
| -------- | ---- |
| **macOS** (Apple Silicon + Intel) | `.dmg` (universal) |
| **Windows** | `.exe` / `.msi` installer |
| **Linux** | `.AppImage` or `.deb` |
| **Android** | debug `.apk` (manual build job) |

Or just **use it in the browser** — open the web build and "Install" it as a PWA on
desktop or phone. No account, no server; everything runs locally.

> **macOS first launch:** the build isn't notarized by Apple yet, so Gatekeeper
> will block it the first time. Either **right-click the app → Open** (then confirm),
> or clear the quarantine flag:
> ```bash
> xattr -dr com.apple.quarantine /Applications/Incipit.app
> ```
> Windows SmartScreen may also warn on first run — click **More info → Run anyway**.

## Features

### ✍️ Writing & editing
- **Rich-text editor** (TipTap/ProseMirror): bold, italic, underline, highlight, headings, lists, blockquotes
- **Font controls**, text alignment (left/center/right/**justify**), and EB Garamond serif prose by default
- **Suggestion-card editor** — AI edits arrive as accept/reject cards instead of overwriting your text
- **Verse mode** for poetry (preserves line breaks and whitespace)
- **POV identifiers** and **chapter/scene epigraphs** (opening quotes)
- Local autosave to disk plus a manual **Save .md**

### 📚 Manuscript structure
- **Manuscript tree** — folders/parts → chapters → scenes/poems (plus short-story and verse project types)
- **Drag-to-reorder** with inline **double-click rename**
- **Front-matter quick-adds**: Title Page, Copyright, Dedication, Acknowledgements, Prologue
- **Story bible** — characters, locations, items, lore — with **nested sub-categories**
  (a country → provinces → cities; a character with sub-stats). Deletes cascade; the AI
  pulls these into context so names and facts stay consistent
- **Collapsible / hover / lockable sidebars** on both sides

### 🤖 AI (provider-agnostic)
- **Engine selector**: on-device WebLLM (WebGPU), Ollama, OpenAI, Anthropic, Google
- **WebLLM** runs fully local in the browser — free, private, no server
- **AI scene drafting** in your project's POV, tense, genre, and voice; **Continue** extends what's there
- **Story structure** — beat-sheet outlines (Three-Act, Save the Cat, Hero's Journey, Snowflake)
  from your premise, with a writer-fillable template (not just "generate")
- **Line-craft refine** on any selection: *show-don't-tell, tighten, vary rhythm, add sensory,
  polish dialogue, rewrite, expand, proofread*
- **Story-bible retrieval** via embeddings keeps the AI consistent with your world
- AI lives in a left-sidebar **Tools** dropdown with hover descriptions

### 🖼 Media & capture
- **Inline images** and **full-bleed images** (maps/chapter art that bleed edge-to-edge in book view)
- **Custom scene-break glyphs** (presets + free text)
- **Storyboard** (Excalidraw) you can **ingest** into chapters
- **Handwriting → text** (vision model + opt-in Tesseract OCR)
- **Dictation**: cloud Web Speech *or* private on-device Whisper

### 📖 Book view & export
- **Book view** at standard trim sizes (mass market, trade, A5, …) with live pagination and word/page counts
- Export to **EPUB**, **PDF** (print), and **Markdown**
- **Import** .docx / .pdf / .md / .txt → auto-split into chapters

### 🚀 Platform
- **Local-first** — everything lives in IndexedDB on your device; works offline
- **Runs everywhere**: web/PWA (installable) + native **Tauri** desktop (Win/Mac/Linux) & mobile
- **In-app auto-updater** — updates in place, never loses your work
- **Open source**, MPL-2.0 licensed

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

[Mozilla Public License 2.0](LICENSE) (MPL-2.0)
