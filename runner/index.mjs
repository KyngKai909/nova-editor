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
  "https://novaeditor.org",
  "https://www.novaeditor.org",
  "https://nova-editor-six.vercel.app", // the Vercel deployment still resolves
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

// ── git engine ────────────────────────────────────────────────────────────────
// Real git, run on the user's machine in a real clone. The GitHub token rides as
// an http.extraHeader per network command so it NEVER lands in .git/config or on
// disk. Clones live under ~/.nova-runner/repos/<owner>__<repo>/.
const REPOS_DIR = path.join(CONFIG_DIR, "repos");
function repoDir(owner, repo) {
  return path.join(REPOS_DIR, `${owner}__${repo}`.replace(/[^A-Za-z0-9_.-]/g, "_"));
}
function authHeader(token) {
  // GitHub accepts a token as basic-auth (x-access-token:<token>); keep it in
  // a header, not the remote URL, so it isn't persisted.
  return `http.extraHeader=AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
}
function runGit(args, { cwd, token } = {}) {
  return new Promise((resolve) => {
    const pre = token ? ["-c", authHeader(token)] : [];
    const p = spawn("git", [...pre, ...args], { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" } });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("exit", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
    p.on("error", (e) => resolve({ code: -1, out: "", err: String(e?.message || e) }));
  });
}
function isCloned(owner, repo) {
  try { return fs.existsSync(path.join(repoDir(owner, repo), ".git")); } catch { return false; }
}
// Snapshot of how the local clone relates to its upstream (after a fetch).
async function gitStatus(owner, repo, branch, { token, fetch: doFetch } = {}) {
  const cwd = repoDir(owner, repo);
  if (!isCloned(owner, repo)) return { cloned: false };
  if (doFetch) await runGit(["fetch", "origin", branch], { cwd, token });
  const head = (await runGit(["rev-parse", "HEAD"], { cwd })).out;
  const cur = (await runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd })).out;
  const counts = await runGit(["rev-list", "--left-right", "--count", `HEAD...origin/${branch}`], { cwd });
  const [ahead = 0, behind = 0] = counts.out.split(/\s+/).map((n) => Number(n) || 0);
  const porcelain = (await runGit(["status", "--porcelain"], { cwd })).out;
  return { cloned: true, branch: cur, head, ahead, behind, dirty: porcelain ? porcelain.split("\n").length : 0 };
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

  // ── git: real git on the user's machine, in a real clone ────────────────────
  // The GitHub token (body.token) is used only as an http.extraHeader for network
  // commands; it is never written into the clone's config or the remote URL.
  if (p === "/git/clone" && req.method === "POST") {
    const { owner, repo, branch = "main", token } = await body(req);
    if (!owner || !repo) return json(res, 400, { error: "owner and repo required" });
    const dir = repoDir(owner, repo);
    try {
      if (isCloned(owner, repo)) {
        await runGit(["fetch", "origin", branch], { cwd: dir, token });
        await runGit(["checkout", branch], { cwd: dir });
      } else {
        fs.mkdirSync(REPOS_DIR, { recursive: true });
        const r = await runGit(["clone", "--branch", branch, "--single-branch", `https://github.com/${owner}/${repo}.git`, dir], { token });
        if (r.code !== 0) return json(res, 500, { error: r.err || "clone failed" });
      }
      return json(res, 200, { path: dir, ...(await gitStatus(owner, repo, branch, {})) });
    } catch (e) { return json(res, 500, { error: String(e?.message || e) }); }
  }
  if (p === "/git/status" && req.method === "POST") {
    const { owner, repo, branch = "main", token, fetch: doFetch } = await body(req);
    try { return json(res, 200, await gitStatus(owner, repo, branch, { token, fetch: doFetch })); }
    catch (e) { return json(res, 500, { error: String(e?.message || e) }); }
  }
  if (p === "/git/pull" && req.method === "POST") {
    const { owner, repo, branch = "main", token } = await body(req);
    if (!isCloned(owner, repo)) return json(res, 404, { error: "not cloned" });
    const dir = repoDir(owner, repo);
    const before = (await runGit(["rev-parse", "HEAD"], { cwd: dir })).out;
    const r = await runGit(["pull", "--no-edit", "origin", branch], { cwd: dir, token });
    const after = (await runGit(["rev-parse", "HEAD"], { cwd: dir })).out;
    const conflicts = (await runGit(["diff", "--name-only", "--diff-filter=U"], { cwd: dir })).out;
    // files the pull touched, so Nova can refresh just those (A/M/D per file)
    const nameStatus = before && after && before !== after
      ? (await runGit(["diff", "--name-status", before, after], { cwd: dir })).out : "";
    const changed = nameStatus
      ? nameStatus.split("\n").map((l) => { const [s, ...rest] = l.split("\t"); return { status: (s || "")[0], path: rest.join("\t") }; }).filter((c) => c.path)
      : [];
    const st = await gitStatus(owner, repo, branch, {});
    return json(res, 200, { ...st, ok: r.code === 0, output: [r.out, r.err].filter(Boolean).join("\n"), conflicts: conflicts ? conflicts.split("\n") : [], changed });
  }
  // files changed between an arbitrary commit (Nova's baseline) and HEAD, so Nova
  // can refresh exactly what it's missing. `changed: null` ⇒ baseline unknown here
  // (do a full refresh from /git/tree).
  if (p === "/git/changed" && req.method === "POST") {
    const { owner, repo, from } = await body(req);
    if (!isCloned(owner, repo)) return json(res, 404, { error: "not cloned" });
    const dir = repoDir(owner, repo);
    if (!from || (await runGit(["cat-file", "-e", `${from}^{commit}`], { cwd: dir })).code !== 0)
      return json(res, 200, { changed: null });
    const ns = (await runGit(["diff", "--name-status", from, "HEAD"], { cwd: dir })).out;
    const changed = ns ? ns.split("\n").map((l) => { const [s, ...rest] = l.split("\t"); return { status: (s || "")[0], path: rest.join("\t") }; }).filter((c) => c.path) : [];
    return json(res, 200, { changed });
  }
  if (p === "/git/tree" && req.method === "POST") {
    const { owner, repo } = await body(req);
    if (!isCloned(owner, repo)) return json(res, 404, { error: "not cloned" });
    const dir = repoDir(owner, repo);
    const tracked = (await runGit(["ls-files"], { cwd: dir })).out;
    const untracked = (await runGit(["ls-files", "--others", "--exclude-standard"], { cwd: dir })).out;
    return json(res, 200, { path: dir, files: [...tracked.split("\n"), ...untracked.split("\n")].filter(Boolean) });
  }
  // bulk read every tracked file (so Nova can open the clone in one request).
  // Text rides as utf8; binary (NUL-sniffed) rides base64.
  if (p === "/git/files" && req.method === "POST") {
    const { owner, repo } = await body(req);
    if (!isCloned(owner, repo)) return json(res, 404, { error: "not cloned" });
    const dir = repoDir(owner, repo);
    const tracked = (await runGit(["ls-files"], { cwd: dir })).out.split("\n").filter(Boolean).slice(0, 4000);
    const files = [];
    for (const rel of tracked) {
      try {
        const buf = fs.readFileSync(path.join(dir, rel));
        const isBin = buf.subarray(0, 8000).includes(0);
        files.push(isBin ? { path: rel, content: buf.toString("base64"), encoding: "base64" } : { path: rel, content: buf.toString("utf8") });
      } catch { /* skip unreadable */ }
    }
    const head = (await runGit(["rev-parse", "HEAD"], { cwd: dir })).out;
    return json(res, 200, { files, head });
  }
  if (p === "/git/read" && req.method === "POST") {
    const { owner, repo, path: rel, encoding } = await body(req);
    if (!isCloned(owner, repo)) return json(res, 404, { error: "not cloned" });
    const dir = repoDir(owner, repo);
    const fp = path.join(dir, rel || "");
    if (!fp.startsWith(dir)) return json(res, 400, { error: "bad path" });
    try {
      const buf = fs.readFileSync(fp);
      return json(res, 200, encoding === "base64" ? { content: buf.toString("base64"), encoding: "base64" } : { content: buf.toString("utf8") });
    } catch { return json(res, 404, { error: "no such file" }); }
  }
  if (p === "/git/write" && req.method === "POST") {
    const { owner, repo, files } = await body(req);
    if (!isCloned(owner, repo)) return json(res, 404, { error: "not cloned" });
    const dir = repoDir(owner, repo);
    try { for (const f of files || []) writeProjectFile(dir, f); return json(res, 200, { ok: true }); }
    catch (e) { return json(res, 500, { error: String(e?.message || e) }); }
  }
  if (p === "/git/commit" && req.method === "POST") {
    const { owner, repo, message, name, email } = await body(req);
    if (!isCloned(owner, repo)) return json(res, 404, { error: "not cloned" });
    const dir = repoDir(owner, repo);
    await runGit(["add", "-A"], { cwd: dir });
    const ident = name && email ? ["-c", `user.name=${name}`, "-c", `user.email=${email}`] : [];
    const r = await runGit([...ident, "commit", "-m", message || "Update from Nova"], { cwd: dir });
    if (r.code !== 0) return json(res, 500, { error: r.err || r.out || "nothing to commit" });
    return json(res, 200, { head: (await runGit(["rev-parse", "HEAD"], { cwd: dir })).out, output: r.out });
  }
  if (p === "/git/push" && req.method === "POST") {
    const { owner, repo, branch = "main", token } = await body(req);
    if (!isCloned(owner, repo)) return json(res, 404, { error: "not cloned" });
    const r = await runGit(["push", "origin", branch], { cwd: repoDir(owner, repo), token });
    if (r.code !== 0) return json(res, 500, { error: r.err || "push failed" });
    return json(res, 200, { ok: true, output: [r.out, r.err].filter(Boolean).join("\n") });
  }
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
  // tear down both ends together on error OR clean close, so HMR sockets from
  // every reload/navigation fully release (the agent is long-lived).
  up.on("error", () => socket.destroy());
  up.on("close", () => socket.destroy());
  socket.on("error", () => up.destroy());
  socket.on("close", () => up.destroy());
});
proxy.listen(PROXY_PORT, "127.0.0.1");

process.on("SIGINT", () => { for (const id of runs.keys()) stopRun(id); process.exit(0); });
