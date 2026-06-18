// Web-side client for the local runner companion agent (runner/). Talks to the
// agent on 127.0.0.1; the token is sent only there, never to a Nova server.

const RUNNER_URL = "http://127.0.0.1:4319";
// The agent serves the running app WITH the click-to-edit bridge injected on the
// next port up. Nova's iframe points here (not at the dev server directly) so the
// bridge can drive selection/inspect over the natively-running app.
const PROXY_URL = "http://127.0.0.1:4320";
export const runnerProxyUrl = () => PROXY_URL;

export interface RunnerStatus { up: boolean; version?: string }

// Detect the agent (no token needed — origin-locked health check). Short timeout
// so the Settings probe doesn't hang when it isn't running.
export async function probeRunner(timeoutMs = 1500): Promise<RunnerStatus> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(`${RUNNER_URL}/status`, { signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return { up: false };
    const j = await res.json();
    return { up: true, version: j.version };
  } catch {
    return { up: false };
  }
}

// Check that a pairing token is valid (the agent only answers /verify when authed).
export async function verifyToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${RUNNER_URL}/verify`, { headers: { authorization: `Bearer ${token}` } });
    return res.ok;
  } catch {
    return false;
  }
}

// Start a project's dev server on the agent. Returns the runId; stream with logs().
// `bridge` is the click-to-edit script the agent injects into the served HTML;
// `cwd` runs an app nested in a subdir (e.g. app/ inside a monorepo).
export async function runProject(
  token: string,
  files: { path: string; content: string; encoding?: "base64" }[],
  opts: { script?: string; install?: boolean; bridge?: string; cwd?: string } = {},
): Promise<string> {
  const res = await fetch(`${RUNNER_URL}/run`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ files, script: opts.script ?? "dev", install: opts.install ?? true, bridge: opts.bridge ?? "", cwd: opts.cwd ?? "" }),
  });
  if (!res.ok) throw new Error(`runner: ${res.status}`);
  return (await res.json()).runId as string;
}

// Patch files on a running project so its dev-server watcher HMRs the change
// into the bridged iframe (the local-runner equivalent of WebContainer fs.write).
export async function writeFiles(token: string, runId: string, files: { path: string; content: string }[]): Promise<void> {
  await fetch(`${RUNNER_URL}/write/${runId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ files }),
  });
}

// Stream a run's output. Calls onLog for each chunk and onUrl when the dev server
// URL is detected. Returns an unsubscribe.
export function streamLogs(token: string, runId: string, onLog: (s: string) => void, onUrl: (url: string) => void, onExit?: (code: number) => void): () => void {
  // EventSource can't send headers, so the token rides as a query param to /logs.
  const es = new EventSource(`${RUNNER_URL}/logs/${runId}?token=${encodeURIComponent(token)}`);
  es.addEventListener("log", (e) => onLog(JSON.parse((e as MessageEvent).data)));
  es.addEventListener("url", (e) => onUrl(JSON.parse((e as MessageEvent).data)));
  es.addEventListener("exit", (e) => { onExit?.(JSON.parse((e as MessageEvent).data).code); es.close(); });
  return () => es.close();
}

// Re-point the agent's proxy at an already-running run (after a Nova reload).
// Returns the run's url if it's still alive, or null if the agent no longer has it.
export async function attachRun(token: string, runId: string): Promise<{ url: string | null } | null> {
  try {
    const res = await fetch(`${RUNNER_URL}/attach/${runId}`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const j = await res.json();
    return { url: j.url ?? null };
  } catch {
    return null;
  }
}

export async function stopRun(token: string, runId: string): Promise<void> {
  try { await fetch(`${RUNNER_URL}/stop/${runId}`, { method: "POST", headers: { authorization: `Bearer ${token}` } }); } catch { /* ignore */ }
}

// ── git engine (real git on the user's machine, via the agent) ──────────────────
// `token` is the runner pairing token (authenticates to the agent). `ghToken` is
// the GitHub token, used by the agent only as an http.extraHeader for network ops.
export interface GitRepo { owner: string; repo: string; branch: string }
export interface GitStatus { cloned: boolean; path?: string; branch?: string; head?: string; ahead?: number; behind?: number; dirty?: number }
export interface GitChange { status: string; path: string } // status: A|M|D|...
export interface GitPullResult extends GitStatus { ok: boolean; output: string; conflicts: string[]; changed: GitChange[] }

async function gitPost<T>(token: string, op: string, payload: any): Promise<T> {
  const res = await fetch(`${RUNNER_URL}/git/${op}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = `git ${op}: ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* non-json */ }
    throw new Error(msg);
  }
  return res.json();
}

// Ensure the repo is cloned on the machine (clones if missing, else fetches); returns status.
export const gitClone = (token: string, repo: GitRepo, ghToken?: string) =>
  gitPost<GitStatus>(token, "clone", { ...repo, token: ghToken });
// Local clone vs upstream (ahead/behind/dirty); fetches first by default.
export const gitStatus = (token: string, repo: GitRepo, ghToken?: string, fetch = true) =>
  gitPost<GitStatus>(token, "status", { ...repo, token: ghToken, fetch });
export const gitPull = (token: string, repo: GitRepo, ghToken?: string) =>
  gitPost<GitPullResult>(token, "pull", { ...repo, token: ghToken });
// Files changed between `from` (Nova's baseline sha) and HEAD. `changed: null`
// means the baseline isn't in the clone's history — caller should full-refresh.
export const gitChanged = (token: string, repo: GitRepo, from?: string) =>
  gitPost<{ changed: GitChange[] | null }>(token, "changed", { ...repo, from });
export const gitTree = (token: string, repo: GitRepo) =>
  gitPost<{ path: string; files: string[] }>(token, "tree", repo);
export const gitRead = (token: string, repo: GitRepo, path: string, encoding?: "base64") =>
  gitPost<{ content: string; encoding?: "base64" }>(token, "read", { ...repo, path, encoding });
export const gitWriteFiles = (token: string, repo: GitRepo, files: { path: string; content: string; encoding?: "base64" }[]) =>
  gitPost<{ ok: boolean }>(token, "write", { ...repo, files });
export const gitCommit = (token: string, repo: GitRepo, message: string, ident?: { name?: string; email?: string }) =>
  gitPost<{ head: string; output: string }>(token, "commit", { ...repo, message, ...ident });
export const gitPush = (token: string, repo: GitRepo, ghToken?: string) =>
  gitPost<{ ok: boolean; output: string }>(token, "push", { ...repo, token: ghToken });
