"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Terminal, Play, AlertTriangle, ExternalLink, RefreshCw, CheckCircle2,
  Pencil, MousePointer2, Code2,
} from "lucide-react";
import { useProjects } from "@/store/projectsStore";
import { getHandle } from "@/lib/handleStore";
import { verifyPermission, readDirTree } from "@/lib/fileSystem";
import { APP_BRIDGE, findNodeByLine, resolveWcPath } from "@/lib/runtime";
import { parseJsx } from "@/lib/jsxParser";
import { spliceJsx, setJsxProp } from "@/lib/jsxEdit";

interface Selection {
  file?: string;
  line?: number;
  tag: string;
  className: string;
  text: string | null;
}

type Phase = "idle" | "booting" | "mounting" | "installing" | "starting" | "ready" | "error";

// Single WebContainer per page (the API allows only one boot).
let wcBootPromise: Promise<any> | null = null;
async function bootContainer() {
  if (!wcBootPromise) {
    wcBootPromise = (async () => {
      const { WebContainer } = await import("@webcontainer/api");
      return WebContainer.boot();
    })();
  }
  return wcBootPromise;
}

// A tiny dependency-free app used to demo / smoke-test the runtime.
const DEMO_TREE: Record<string, any> = {
  "package.json": {
    file: { contents: JSON.stringify({ name: "nova-demo", scripts: { dev: "node server.js" } }) },
  },
  "server.js": {
    file: {
      contents:
        "const http=require('http');http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<body style=\"font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#0a0a0a;color:#ccff02\"><h1>\\u2713 WebContainer is running your app</h1></body>')}).listen(3000,()=>console.log('listening on http://localhost:3000'));",
    },
  },
};

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Preparing…",
  booting: "Booting Node runtime…",
  mounting: "Loading project files…",
  installing: "Installing dependencies…",
  starting: "Starting dev server…",
  ready: "Running",
  error: "Error",
};

export default function RunView() {
  const params = useSearchParams();
  const projectId = params.get("project");
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));

  const [phase, setPhase] = useState<Phase>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [editMode, setEditMode] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wcRef = useRef<any>(null);
  const append = (s: string) => setLog((l) => [...l, s]);

  // Edit the source file backing the selected element, then let HMR re-render.
  const editFile = async (line: number | undefined, file: string | undefined, fn: (content: string, node: any) => string | null) => {
    const wc = wcRef.current;
    if (!wc || !file || !line) return;
    const path = await resolveWcPath(wc.fs, file);
    if (!path) return;
    const content = await wc.fs.readFile(path, "utf-8");
    const node = findNodeByLine(parseJsx(content), content, line);
    if (!node) return;
    const next = fn(content, node);
    if (next && next !== content) await wc.fs.writeFile(path, next);
  };

  const applyText = (text: string) => {
    if (!selected) return;
    setSelected({ ...selected, text });
    iframeRef.current?.contentWindow?.postMessage({ type: "nova-apply", text }, "*");
    editFile(selected.line, selected.file, (content, node) => spliceJsx(content, node, "text", text));
  };
  const applyClass = (className: string) => {
    if (!selected) return;
    setSelected({ ...selected, className });
    iframeRef.current?.contentWindow?.postMessage({ type: "nova-apply", className }, "*");
    editFile(selected.line, selected.file, (content, node) => setJsxProp(content, node, "className", className));
  };

  // receive selection / inline-edit messages from the running app's bridge
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d?.type) return;
      if (d.type === "nova-select") setSelected({ file: d.file, line: d.line, tag: d.tag, className: d.className || "", text: d.text });
      else if (d.type === "nova-text") editFile(d.line, d.file, (content, node) => spliceJsx(content, node, "text", d.text));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      setUrl(null);
      setLog([]);
      try {
        if (typeof window !== "undefined" && !(window as any).crossOriginIsolated) {
          throw new Error(
            "This page isn't cross-origin isolated, so the in-browser runtime can't start. Open it directly at /run (a hard refresh usually fixes it)."
          );
        }
        if (!projectId) throw new Error("No project specified.");

        const demo = projectId === "__demo__";
        let handle: any = null;
        if (!demo) {
          handle = await getHandle(projectId);
          if (!handle) {
            throw new Error(
              "Run needs a folder-backed project (a full clone on disk). Set a projects folder in Settings, then re-import the repo."
            );
          }
          if (!(await verifyPermission(handle, false))) throw new Error("Folder permission denied.");
        }

        setPhase("booting");
        const wc = await bootContainer();
        wcRef.current = wc;
        if (cancelled) return;

        setPhase("mounting");
        const tree = demo ? DEMO_TREE : await readDirTree(handle);
        await wc.mount(tree);
        if (cancelled) return;

        // inject the click-to-source bridge into the app (Vite serves public/ at /)
        try {
          await wc.fs.mkdir("public", { recursive: true }).catch(() => {});
          await wc.fs.writeFile("public/nova-bridge.js", APP_BRIDGE);
          const html = await wc.fs.readFile("index.html", "utf-8");
          if (!html.includes("nova-bridge")) {
            await wc.fs.writeFile("index.html", html.replace("</body>", '<script src="/nova-bridge.js"></script></body>'));
          }
        } catch {
          /* non-Vite layouts: bridge injection is best-effort for now */
        }

        // figure out the dev script
        let script = "dev";
        try {
          const raw = tree["package.json"].file.contents;
          const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
          const pkg = JSON.parse(text);
          if (!pkg.scripts?.dev) script = pkg.scripts?.start ? "start" : "dev";
        } catch {
          throw new Error("No package.json found at the project root — this doesn't look like a runnable app.");
        }

        setPhase("installing");
        append("$ npm install");
        const install = await wc.spawn("npm", ["install"]);
        install.output.pipeTo(new WritableStream({ write: (d) => { if (!cancelled) append(d); } }));
        const code = await install.exit;
        if (cancelled) return;
        if (code !== 0) throw new Error(`npm install exited with code ${code}.`);

        setPhase("starting");
        append(`\n$ npm run ${script}`);
        wc.on("server-ready", (_port: number, serverUrl: string) => {
          if (cancelled) return;
          setUrl(serverUrl);
          setPhase("ready");
        });
        wc.on("error", (e: any) => !cancelled && setError(e?.message || String(e)));
        const dev = await wc.spawn("npm", ["run", script]);
        dev.output.pipeTo(new WritableStream({ write: (d) => { if (!cancelled) append(d); } }));
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || String(e));
          setPhase("error");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, runId]);

  return (
    <div className="flex h-[100dvh] flex-col bg-bg-2">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-3">
        <div className="flex items-center gap-2">
          <Link href="/editor" className="grid h-7 w-7 place-items-center rounded-md text-ink-3 hover:bg-raise hover:text-ink" title="Back to editor">
            <ArrowLeft size={15} />
          </Link>
          <Play size={14} className="text-accent" />
          <span className="text-[13px] font-medium">{project?.name || "Run"}</span>
          <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ${phase === "ready" ? "bg-accent/15 text-accent" : phase === "error" ? "bg-red-500/15 text-red-300" : "bg-raise text-ink-2"}`}>
            {phase === "ready" ? <CheckCircle2 size={11} /> : phase === "error" ? <AlertTriangle size={11} /> : <Loader2 size={11} className="animate-spin" />}
            {PHASE_LABEL[phase]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {url && (
            <button
              onClick={() => setEditMode((v) => !v)}
              title="Toggle click-to-edit on the running app"
              className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors ${editMode ? "bg-accent text-accent-ink" : "border border-line text-ink-2 hover:bg-raise"}`}
            >
              {editMode ? <Pencil size={12} /> : <MousePointer2 size={12} />} {editMode ? "Editing" : "Interact"}
            </button>
          )}
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] text-ink-2 hover:bg-raise hover:text-ink">
              Open <ExternalLink size={12} />
            </a>
          )}
          <button onClick={() => setRunId((n) => n + 1)} className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] text-ink-2 hover:bg-raise hover:text-ink">
            <RefreshCw size={12} /> Restart
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* live app */}
        <main className="relative min-w-0 flex-1 bg-white">
          {url ? (
            <iframe ref={iframeRef} title="app" src={url} className={`h-full w-full border-0 ${editMode ? "" : "pointer-events-auto"}`} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" />
          ) : (
            <div className="grid h-full place-items-center bg-bg">
              {phase === "error" ? (
                <div className="max-w-md px-6 text-center">
                  <AlertTriangle size={28} className="mx-auto text-red-400" />
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{error}</p>
                  <Link href="/editor" className="mt-4 inline-block rounded-lg border border-line px-3 py-2 text-[12px] text-ink-2 hover:bg-raise">Back to editor</Link>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-ink-3">
                  <Loader2 size={24} className="animate-spin text-accent" />
                  <p className="text-[13px]">{PHASE_LABEL[phase]}</p>
                  <p className="max-w-xs text-center text-[11px] text-ink-3/70">First run installs dependencies in-browser — it can take a minute.</p>
                </div>
              )}
            </div>
          )}
        </main>

        {/* right rail: live selection inspector + console */}
        <aside className="flex w-[340px] shrink-0 flex-col border-l border-line bg-bg-2">
          {/* selection inspector */}
          <div className="border-b border-line">
            <div className="flex h-8 items-center gap-2 px-3 text-[11px] uppercase tracking-wide text-ink-3">
              <MousePointer2 size={12} /> Selection
            </div>
            {selected ? (
              <div className="space-y-2.5 px-3 pb-3">
                <div className="flex items-center justify-between">
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[11px] text-accent">{selected.tag}</span>
                  {selected.file && (
                    <span className="flex items-center gap-1 truncate font-mono text-[10px] text-ink-3" title={selected.file}>
                      <Code2 size={10} /> {selected.file.split("/").pop()}:{selected.line}
                    </span>
                  )}
                </div>
                <div>
                  <label className="text-[10px] text-ink-3">className</label>
                  <input
                    value={selected.className}
                    onChange={(e) => setSelected({ ...selected, className: e.target.value })}
                    onBlur={(e) => applyClass(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="mt-1 h-7 w-full rounded-md border border-line bg-bg px-2 font-mono text-[11px] text-ink outline-none focus:border-accent/60"
                  />
                </div>
                {selected.text !== null && (
                  <div>
                    <label className="text-[10px] text-ink-3">text</label>
                    <textarea
                      value={selected.text}
                      onChange={(e) => setSelected({ ...selected, text: e.target.value })}
                      onBlur={(e) => applyText(e.target.value)}
                      rows={2}
                      className="mt-1 w-full resize-none rounded-md border border-line bg-bg p-2 text-[12px] text-ink outline-none focus:border-accent/60"
                    />
                  </div>
                )}
                {!selected.file && (
                  <p className="text-[10.5px] leading-relaxed text-amber-300/70">
                    No source mapping for this element (needs a React dev build with source info).
                  </p>
                )}
              </div>
            ) : (
              <p className="px-3 pb-3 text-[11.5px] leading-relaxed text-ink-3">
                {url ? "Click an element in the app to select it; double-click text to edit it. Edits write to source and hot-reload." : "Start the app to begin editing."}
              </p>
            )}
          </div>

          {/* terminal log */}
          <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-3 text-[11px] uppercase tracking-wide text-ink-3">
            <Terminal size={12} /> Console
          </div>
          <div ref={logRef} className="scroll-thin flex-1 overflow-auto p-3 font-mono text-[11px] leading-[1.6] text-ink-2">
            {log.length === 0 && <span className="text-ink-3">Waiting for output…</span>}
            {log.map((l, i) => (
              <pre key={i} className="whitespace-pre-wrap break-words">{l}</pre>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
