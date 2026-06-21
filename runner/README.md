# Nova local runner

A tiny companion agent that runs your project's dev server **natively on your machine**, so Nova (in the browser) can use your full compute instead of the in-tab WebContainer — handling bigger projects, faster, still 100% local and private.

## Run it

```bash
npx @novaeditor/runner
# or, from a clone:
node runner/index.mjs
```

It prints a **pairing token**. In Nova: **Settings → Local runner**, paste the token. Nova auto-detects the agent and shows **Connected**. Keep the agent running while you work.

## What it does (and doesn't)

- Binds to **127.0.0.1 only** — never exposed to your network.
- **Origin-locked** — only Nova's own web origin may talk to it (set extra origins with `NOVA_ORIGIN=https://… node runner/index.mjs`).
- **Token-paired** — every action needs the token; it lives in `~/.nova-runner/token` and proves you control the machine.
- Runs only **`npm install` + `npm run <script>`** for the project Nova sends — no arbitrary shell.

## Endpoints (for reference)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/status` | origin only | health / detection |
| POST | `/run` | token | write files to a temp dir, install + run the dev script |
| GET | `/logs/:id` | token | SSE stream of output + the dev-server `url` |
| POST | `/stop/:id` | token | stop a run |

Override the port with `NOVA_RUNNER_PORT=4319`.
