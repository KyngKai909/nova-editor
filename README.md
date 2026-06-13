# Nova

**The last-mile visual editor for AI-generated web apps.** Browser-based,
Git-native, no lock-in.

AI tools (Bolt, Lovable, v0, Cursor…) generate ~90% of an app from a prompt. Nova
is where you do the final 10% by hand — click an element, tweak its layout, color,
and copy on a live canvas, and push clean code back to your repo. No tokens spent
on micro-tweaks, nothing to install, your Git stays the source of truth.

> 🟢 **Alpha.** Actively developed — expect rough edges, and please send feedback.

## What it does

- **Visual editing on real code** — click any element, edit layout / spacing /
  typography / color in a Webflow-grade inspector. Edits round-trip to your source
  (Tailwind utility classes or inline styles).
- **Bi-directional sync** — a built-in Monaco code editor stays in lock-step with
  the canvas. Edit either side.
- **Bring-your-own-AI assistant** — an agentic helper that reads and edits your
  files, with your own key for **any** provider (Anthropic, OpenAI, Google, xAI,
  DeepSeek, Mistral, Groq, OpenRouter, or a custom model).
- **Run it live** — boot the real app in the browser (WebContainers) and
  click-to-edit it as it runs.
- **Git-native** — import a public repo or a full clone, edit, review a clean diff,
  then commit, push, or open a PR. Triggers your existing Vercel/Netlify deploy.
- **Local-first** — projects, tokens, and AI keys live only in your browser (and,
  optionally, a folder on your disk). Nothing passes through a Nova server.

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000> (this repo's dev preview uses 3011).

Requirements: Node 18+. Folder storage and the live **Run** mode use the File
System Access API + WebContainers, which need a **Chromium** browser (Chrome,
Edge, Arc).

## Tech

Next.js 14 (App Router) · TypeScript · Tailwind · Zustand · Monaco · Babel
(`@babel/parser`) + parse5 for round-tripping · esbuild-wasm + esm.sh for the
in-browser component bundler · WebContainers for the live runtime · the GitHub
REST API for clone/commit/PR.

## Documentation

Full guides live in [`/docs`](./docs) (and in-app at `/docs`): getting started,
importing, visual & code editing, the AI assistant, running live, publishing, and
an FAQ.

## Status & roadmap

Working today: import (GitHub / folder / paste), visual + code editing, the AI
assistant, live run + click-to-edit, and GitHub publish. On the roadmap: GitHub
OAuth, broader framework/file support, streaming AI responses, and a hosted
project-backup tier.
