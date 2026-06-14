# Contributing to Nova

Thanks for taking the time to contribute! Nova is a browser-based, Git-native
visual editor for real codebases. It's open source under the
[GNU AGPL-3.0](LICENSE), and contributions of every size are welcome — bug
reports, docs, design tweaks, and code.

## Ground rules

- Be kind and constructive. Assume good faith.
- Keep changes focused: one logical change per pull request.
- By contributing, you agree your work is licensed under the project's
  **AGPL-3.0** license.

## Getting started

Nova is a single [Next.js 14](https://nextjs.org) app (App Router) written in
**TypeScript** and styled with **Tailwind**. It runs fully in the browser with
**no backend required** — accounts, cloud sync, and billing are optional and
only switch on when their env vars are present.

**Prerequisites:** Node `18.17+` (or `20+`) and `npm`.

```bash
# 1. Fork the repo on GitHub, then clone your fork:
git clone https://github.com/<your-username>/nova-editor.git
cd nova-editor

# 2. Install dependencies:
npm install

# 3. Start the dev server:
npm run dev
# → http://localhost:3000
```

That's it — no `.env` is needed to run the editor. To work on the optional
auth/sync/billing layers, see `supabase/schema.sql` and
[`STRIPE_SETUP.md`](STRIPE_SETUP.md) for the env vars.

## Project layout

| Path | What's there |
|------|--------------|
| `app/` | Next.js routes (`/`, `/dashboard`, `/editor`, `/docs`, `/settings`, `/login`, `api/`) |
| `components/` | UI by area — `landing/`, `editor/`, `dashboard/`, `auth/`, `settings/`, `ai/` |
| `store/` | Zustand stores (editor, projects, ai, auth, github, settings) |
| `lib/` | Core logic — file system, GitHub, AI agent, encryption, billing |
| `supabase/` | `schema.sql` for the optional Postgres backend |

## Before you open a pull request

Please make sure both of these pass locally:

```bash
# Type-check (note: use the local binary, not `npx tsc`)
./node_modules/.bin/tsc --noEmit

# Production build
npm run build
```

Match the style of the surrounding code — naming, comment density, and idioms.
We don't have a separate lint/format step beyond the TypeScript compiler and
Next.js's built-in checks.

## Proposing changes

1. **Found a bug or have an idea?** Open an issue first for anything
   non-trivial so we can agree on the approach before you invest time.
2. **Branch** from `main` with a short descriptive name
   (e.g. `fix/canvas-scroll`, `feat/export-zip`).
3. **Commit** in small, logical steps with clear messages.
4. **Open a PR** against `main`. Describe what changed and why, and include a
   screenshot or short clip for any visual change.

## Reporting bugs

Include: what you did, what you expected, what actually happened, your browser
and OS, and any console errors. A minimal repro (or the repo/site you were
editing) helps a lot.

---

Happy building. If you don't like something — well, you know the rest. 🍴
