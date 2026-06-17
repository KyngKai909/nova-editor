// Web-side client for the local runner companion agent (runner/). Talks to the
// agent on 127.0.0.1; the token is sent only there, never to a Nova server.

const RUNNER_URL = "http://127.0.0.1:4319";

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
export async function runProject(token: string, files: { path: string; content: string }[], opts: { script?: string; install?: boolean } = {}): Promise<string> {
  const res = await fetch(`${RUNNER_URL}/run`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ files, script: opts.script ?? "dev", install: opts.install ?? true }),
  });
  if (!res.ok) throw new Error(`runner: ${res.status}`);
  return (await res.json()).runId as string;
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

export async function stopRun(token: string, runId: string): Promise<void> {
  try { await fetch(`${RUNNER_URL}/stop/${runId}`, { method: "POST", headers: { authorization: `Bearer ${token}` } }); } catch { /* ignore */ }
}
