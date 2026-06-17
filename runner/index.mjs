#!/usr/bin/env node
// Nova local runner — a tiny companion agent that runs a project's dev server
// natively on your machine, so Nova (in the browser) can use your full compute
// instead of the in-tab WebContainer. Local-first: it binds to 127.0.0.1 only,
// only accepts requests from Nova's own origin, and every action needs the
// pairing token printed below. Dependency-free (Node built-ins only).

import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const VERSION = "0.1.0";
const PORT = Number(process.env.NOVA_RUNNER_PORT || 4319);
const PROXY_PORT = PORT + 1; // serves the running app WITH the bridge injected
// Origins allowed to talk to the agent. Add your own with NOVA_ORIGIN=...
const ORIGINS = new Set([
  "https://nova-editor-six.vercel.app",
  "http://localhost:3000",
  "http://localhost:3011",
  ...(process.env.NOVA_ORIGIN ? process.env.NOVA_ORIGIN.split(",").map((s) => s.trim()) : []),
]);

// ── token (proves the user controls this machine; pasted into Nova once) ──────
const CONFIG_DIR = path.join(os.homedir(), ".nova-runner");
const TOKEN_FILE = path.join(CONFIG_DIR, "token");
function loadToken() {
  try { return fs.readFileSync(TOKEN_FILE, "utf8").trim(); } catch { /* generate */ }
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const t = crypto.randomBytes(16).toString("hex");
  fs.writeFileSync(TOKEN_FILE, t, { mode: 0o600 });
  return t;
}
const TOKEN = loadToken();

// ── running projects ──────────────────────────────────────────────────────────
const runs = new Map(); // runId -> { proc, log:[], url, exited, subs:Set<res>, bridge }
let activeRunId = null; // the run the bridge proxy currently serves (one app at a time)
const URL_RE = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?[^\s]*)/i;

// Write one project file under `root`. Text rides as a string; binary assets
// (images/fonts/…) ride base64 so they survive the JSON transport intact.
function writeProjectFile(root, f) {
  const p = path.join(root, f.path);
  if (!p.startsWith(root)) return; // no path traversal
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, f.encoding === "base64" ? Buffer.from(f.content || "", "base64") : (f.content ?? ""));
}

function emit(run, type, data) {
  if (type === "log") run.log.push(data);
  for (const res of run.subs) {
    try { res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* gone */ }
  }
}

function startRun(runId, { files, script = "dev", install = true, bridge = "", cwd = "" }) {
  const root = path.join(os.tmpdir(), "nova-runner", runId);
  fs.mkdirSync(root, { recursive: true });
  for (const f of files || []) writeProjectFile(root, f);
  // cwd lets us run an app nested in a monorepo subdir (e.g. app/ in a Hardhat repo)
  const dir = cwd ? path.join(root, cwd) : root;
  const run = { proc: null, log: [], url: null, exited: false, subs: new Set(), bridge, dir, root };
  runs.set(runId, run);
  activeRunId = runId;

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const onData = (d) => {
    const s = d.toString();
    emit(run, "log", s);
    if (!run.url) { const m = s.match(URL_RE); if (m) { run.url = m[1]; emit(run, "url", run.url); } }
  };
  const spawnStep = (args, next) => {
    const proc = spawn(npm, args, { cwd: dir, detached: true, env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0" } });
    run.proc = proc;
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("exit", (code) => {
      if (next && code === 0) return next();
      run.exited = true;
      emit(run, "exit", { code });
    });
    proc.on("error", (e) => { emit(run, "log", `\n[runner] ${e.message}\n`); run.exited = true; emit(run, "exit", { code: -1 }); });
  };

  if (install) { emit(run, "log", "$ npm install\n"); spawnStep(["install"], () => { emit(run, "log", `\n$ npm run ${script}\n`); spawnStep(["run", script], null); }); }
  else { emit(run, "log", `$ npm run ${script}\n`); spawnStep(["run", script], null); }
}

function stopRun(runId) {
  const run = runs.get(runId);
  if (!run?.proc) return;
  try { process.kill(-run.proc.pid, "SIGTERM"); } catch { try { run.proc.kill("SIGTERM"); } catch { /* gone */ } }
  run.exited = true;
}

// ── http server (127.0.0.1 only) ──────────────────────────────────────────────
function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    return true;
  }
  return !origin; // allow no-origin (curl / same-process), block other web origins
}
// token may come as a Bearer header (fetch) or a ?token= query param (the SSE
// log stream, since EventSource can't set headers).
function authed(req, url) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : (url && url.searchParams.get("token")) || "";
  return t === TOKEN;
}
const json = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
function body(req) { return new Promise((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } }); }); }

const server = http.createServer(async (req, res) => {
  const okOrigin = cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(okOrigin ? 204 : 403); return res.end(); }
  if (!okOrigin) return json(res, 403, { error: "origin not allowed" });
  const url = new URL(req.url, "http://x");
  const p = url.pathname;

  // health/detection — no token (so Nova can probe), but origin-locked
  if (p === "/status" && req.method === "GET") return json(res, 200, { name: "nova-runner", version: VERSION });

  // everything else requires the pairing token
  if (!authed(req, url)) return json(res, 401, { error: "unauthorized" });

  // token check for pairing (authed → the token is valid)
  if (p === "/verify" && req.method === "GET") return json(res, 200, { ok: true });

  if (p === "/run" && req.method === "POST") {
    const b = await body(req);
    const runId = crypto.randomBytes(6).toString("hex");
    try { startRun(runId, b); return json(res, 200, { runId }); }
    catch (e) { return json(res, 500, { error: String(e?.message || e) }); }
  }
  if (p.startsWith("/logs/") && req.method === "GET") {
    const run = runs.get(p.slice(6));
    if (!run) return json(res, 404, { error: "no such run" });
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    run.log.forEach((l) => res.write(`event: log\ndata: ${JSON.stringify(l)}\n\n`));
    if (run.url) res.write(`event: url\ndata: ${JSON.stringify(run.url)}\n\n`);
    run.subs.add(res);
    req.on("close", () => run.subs.delete(res));
    return;
  }
  // write-through for live edits: patch files on disk; the dev server's own
  // file-watcher picks them up and HMR pushes the change to the bridged iframe.
  if (p.startsWith("/write/") && req.method === "POST") {
    const run = runs.get(p.slice(7));
    if (!run) return json(res, 404, { error: "no such run" });
    const b = await body(req);
    try {
      for (const f of b.files || []) writeProjectFile(run.root, f);
      return json(res, 200, { ok: true });
    } catch (e) { return json(res, 500, { error: String(e?.message || e) }); }
  }
  // re-attach a still-alive run after a Nova reload: point the proxy at it again
  // (the run survives in-memory as long as the agent process lives).
  if (p.startsWith("/attach/") && req.method === "POST") {
    const id = p.slice(8);
    const run = runs.get(id);
    if (!run || run.exited) return json(res, 404, { error: "no such run" });
    activeRunId = id;
    return json(res, 200, { ok: true, url: run.url, ready: !!run.url });
  }
  if (p.startsWith("/stop/") && req.method === "POST") { const id = p.slice(6); stopRun(id); if (activeRunId === id) activeRunId = null; return json(res, 200, { ok: true }); }
  return json(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Nova local runner v${VERSION} — listening on http://127.0.0.1:${PORT}`);
  console.log(`  Bridged app proxy on http://127.0.0.1:${PROXY_PORT}`);
  console.log(`  Pairing token (paste into Nova → Settings → Local runner):\n`);
  console.log(`      ${TOKEN}\n`);
  console.log(`  Keep this running. Ctrl+C to stop.\n`);
});

// ── bridge-injecting reverse proxy ──────────────────────────────────────────
// Nova's iframe loads THIS (127.0.0.1:PROXY_PORT) instead of the dev server
// directly, so we can inject the click-to-edit bridge into the app's HTML.
// Proxying from "/" means the app's root-absolute asset paths (/src/main.tsx,
// /@vite/client, …) resolve correctly. The active run is the most-recent one.
function injectBridge(html, bridge) {
  if (!bridge) return html;
  const tag = `\n<script>${bridge}</script>\n`;
  return html.includes("</body>") ? html.replace("</body>", `${tag}</body>`) : html + tag;
}
const HOP = /^(connection|keep-alive|transfer-encoding|content-length|content-encoding|upgrade)$/i;
const proxy = http.createServer(async (req, res) => {
  const run = activeRunId && runs.get(activeRunId);
  if (!run || !run.url) { res.writeHead(503, { "content-type": "text/html" }); return res.end("<body style='font:15px system-ui;color:#888;padding:2rem'>No app running yet.</body>"); }
  try {
    const target = run.url.replace(/\/+$/, "") + req.url;
    const headers = {}; for (const [k, v] of Object.entries(req.headers)) if (!HOP.test(k) && k !== "host") headers[k] = v;
    const upstream = await fetch(target, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : req, redirect: "manual", duplex: "half" });
    const ct = upstream.headers.get("content-type") || "";
    const out = {}; upstream.headers.forEach((v, k) => { if (!HOP.test(k)) out[k] = v; });
    if (ct.includes("text/html")) {
      const html = injectBridge(await upstream.text(), run.bridge);
      res.writeHead(upstream.status, { ...out, "content-type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    res.writeHead(upstream.status, out);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) { res.writeHead(502, { "content-type": "text/plain" }); res.end(`proxy: ${e.message}`); }
});
// forward WebSocket upgrades (Vite/Next HMR) raw to the dev server
proxy.on("upgrade", (req, socket, head) => {
  const run = activeRunId && runs.get(activeRunId);
  if (!run || !run.url) return socket.destroy();
  const u = new URL(run.url);
  const up = net.connect(Number(u.port) || 80, u.hostname, () => {
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n\r\n");
    if (head?.length) up.write(head);
    socket.pipe(up); up.pipe(socket);
  });
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
});
proxy.listen(PROXY_PORT, "127.0.0.1");

process.on("SIGINT", () => { for (const id of runs.keys()) stopRun(id); process.exit(0); });
