"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft, Loader2, Terminal, Play, AlertTriangle, ExternalLink, RefreshCw, CheckCircle2,
  Pencil, MousePointer2, Code2, ChevronDown, ChevronUp, Paintbrush2, SlidersHorizontal, Trash2,
} from "lucide-react";
import { useProjects } from "@/store/projectsStore";
import { getHandle } from "@/lib/handleStore";
import { verifyPermission, readDirTree } from "@/lib/fileSystem";
import { APP_BRIDGE, findNodeByLine, resolveWcPath } from "@/lib/runtime";
import { parseJsx } from "@/lib/jsxParser";
import { spliceJsx, setJsxProp } from "@/lib/jsxEdit";
import {
  toTokens, toClassName, groupValue, setGroup,
  DISPLAY, FLEX_DIR, JUSTIFY, ALIGN, TEXT_ALIGN, FONT_SIZE, FONT_WEIGHT, PADDING, MARGIN, ROUNDED,
} from "@/lib/runStyle";

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
  const [tab, setTab] = useState<"style" | "element">("style");
  const [consoleOpen, setConsoleOpen] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wcRef = useRef<any>(null);
  const append = (s: string) => setLog((l) => [...l, s]);

  // Run opens in a new tab from the editor, so "back" should close this tab and
  // return to the editor tab already open. Fall back to navigating if this tab
  // wasn't script-opened (e.g. the URL was pasted directly).
  const backToEditor = () => {
    if (typeof window !== "undefined" && window.opener && !window.opener.closed) {
      window.close();
      setTimeout(() => { if (!window.closed) window.location.href = "/editor"; }, 120);
    } else {
      window.location.href = "/editor";
    }
  };

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
  // visual style controls edit the class token list, then apply as a className
  const applyTokens = (tokens: string[]) => applyClass(toClassName(tokens));

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

        // inject the click-to-source bridge into the app. Frameworks serve a
        // /public dir at the root, so the bridge lives there; we then add a
        // <script> tag to whichever entry HTML/layout the app actually uses —
        // Vite's index.html, Next App Router's layout, or Pages Router's
        // _document. First match wins.
        try {
          await wc.fs.mkdir("public", { recursive: true }).catch(() => {});
          await wc.fs.writeFile("public/nova-bridge.js", APP_BRIDGE);
        } catch { /* no public dir — bridge is best-effort */ }
        const TAG = '<script src="/nova-bridge.js"></script>';
        const tryInject = async (path: string): Promise<boolean> => {
          try {
            const src = await wc.fs.readFile(path, "utf-8");
            if (src.includes("nova-bridge")) return true; // already injected
            if (src.includes("</body>")) {
              await wc.fs.writeFile(path, src.replace("</body>", TAG + "</body>"));
              return true;
            }
          } catch { /* file not present in this layout */ }
          return false;
        };
        for (const p of [
          "index.html", "public/index.html",
          "app/layout.tsx", "app/layout.jsx", "src/app/layout.tsx", "src/app/layout.jsx",
          "pages/_document.tsx", "pages/_document.jsx", "src/pages/_document.tsx", "src/pages/_document.jsx",
        ]) {
          if (await tryInject(p)) break;
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
          <button onClick={backToEditor} className="grid h-7 w-7 place-items-center rounded-md text-ink-3 hover:bg-raise hover:text-ink" title="Back to editor">
            <ArrowLeft size={15} />
          </button>
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

      <div className="flex min-h-0 flex-1 flex-col">
        {/* app + inspector */}
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
                    <button onClick={backToEditor} className="mt-4 inline-block rounded-lg border border-line px-3 py-2 text-[12px] text-ink-2 hover:bg-raise">Back to editor</button>
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

          {/* right rail: tabbed inspector (Style / Element) */}
          <aside className="flex w-[320px] shrink-0 flex-col border-l border-line bg-bg-2">
            <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
              <TabButton active={tab === "style"} onClick={() => setTab("style")} icon={<Paintbrush2 size={14} />} label="Style" />
              <TabButton active={tab === "element"} onClick={() => setTab("element")} icon={<SlidersHorizontal size={14} />} label="Element" />
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-auto">
              {!url ? (
                <p className="p-3 text-[11.5px] leading-relaxed text-ink-3">Start the app to begin editing.</p>
              ) : !selected ? (
                <p className="p-3 text-[11.5px] leading-relaxed text-ink-3">Click an element in the app to select it; double-click text to edit it. Edits write to source and hot-reload.</p>
              ) : tab === "style" ? (
                <StyleTab selected={selected} onTokens={applyTokens} onClass={applyClass} />
              ) : (
                <ElementTab selected={selected} onText={applyText} onClass={applyClass} />
              )}
            </div>
          </aside>
        </div>

        {/* collapsible console footer (VS Code-style bottom panel) */}
        <div className="shrink-0 border-t border-line bg-bg-2">
          <div className="flex h-8 items-center gap-1 px-2 text-[11px] uppercase tracking-wide text-ink-3">
            <button onClick={() => setConsoleOpen((o) => !o)} className="flex flex-1 items-center gap-2 px-1 hover:text-ink">
              <Terminal size={12} /> Console
              <span className="rounded bg-raise px-1.5 py-0.5 text-[9.5px] font-normal normal-case tracking-normal text-ink-2">{log.length}</span>
            </button>
            {log.length > 0 && (
              <button onClick={() => setLog([])} title="Clear console" className="grid h-6 w-6 place-items-center rounded hover:bg-raise hover:text-ink">
                <Trash2 size={12} />
              </button>
            )}
            <button onClick={() => setConsoleOpen((o) => !o)} title={consoleOpen ? "Collapse" : "Expand"} className="grid h-6 w-6 place-items-center rounded hover:bg-raise hover:text-ink">
              {consoleOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          </div>
          {consoleOpen && (
            <div ref={logRef} className="scroll-thin h-[184px] overflow-auto border-t border-line px-3 py-2 font-mono text-[11px] leading-[1.6] text-ink-2">
              {log.length === 0 && <span className="text-ink-3">Waiting for output…</span>}
              {log.map((l, i) => (
                <pre key={i} className="whitespace-pre-wrap break-words">{l}</pre>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── inspector pieces ──────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium transition-colors ${active ? "bg-raise text-ink" : "text-ink-3 hover:text-ink"}`}
    >
      {icon} {label}
    </button>
  );
}

function ElementHeader({ selected }: { selected: Selection }) {
  return (
    <div className="flex items-center justify-between">
      <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[11px] text-accent">{selected.tag}</span>
      {selected.file ? (
        <span className="flex items-center gap-1 truncate font-mono text-[10px] text-ink-3" title={selected.file}>
          <Code2 size={10} /> {selected.file.split("/").pop()}:{selected.line}
        </span>
      ) : (
        <span className="text-[10px] text-amber-300/70">no source map</span>
      )}
    </div>
  );
}

// A segmented control bound to a Tailwind class group. Clicking the active
// option again clears it.
function Seg({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string | null; onChange: (v: string | null) => void }) {
  const fmt = (o: string) => o.replace(/^[a-z]+-/, "") || o;
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-3">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(value === o ? null : o)}
            title={o}
            className={`h-7 min-w-[30px] rounded-md border px-2 text-[11px] capitalize transition-colors ${
              value === o ? "border-accent/60 bg-accent/15 text-accent" : "border-line text-ink-2 hover:bg-raise hover:text-ink"
            }`}
          >
            {fmt(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

function RawClass({ selected, onClass }: { selected: Selection; onClass: (c: string) => void }) {
  const [v, setV] = useState(selected.className);
  useEffect(() => setV(selected.className), [selected.className]);
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide text-ink-3">Classes</label>
      <textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onClass(v)}
        rows={2}
        spellCheck={false}
        className="mt-1 w-full resize-none rounded-md border border-line bg-bg p-2 font-mono text-[11px] leading-relaxed text-ink outline-none focus:border-accent/60"
      />
    </div>
  );
}

function StyleTab({ selected, onTokens, onClass }: { selected: Selection; onTokens: (t: string[]) => void; onClass: (c: string) => void }) {
  const tokens = toTokens(selected.className);
  const set = (group: readonly string[], v: string | null) => onTokens(setGroup(tokens, group, v));
  const display = groupValue(tokens, DISPLAY);
  return (
    <div className="space-y-3.5 p-3">
      <ElementHeader selected={selected} />
      <Seg label="Display" options={DISPLAY} value={display} onChange={(v) => set(DISPLAY, v)} />
      {display === "flex" && (
        <>
          <Seg label="Direction" options={FLEX_DIR} value={groupValue(tokens, FLEX_DIR)} onChange={(v) => set(FLEX_DIR, v)} />
          <Seg label="Justify" options={JUSTIFY} value={groupValue(tokens, JUSTIFY)} onChange={(v) => set(JUSTIFY, v)} />
          <Seg label="Align" options={ALIGN} value={groupValue(tokens, ALIGN)} onChange={(v) => set(ALIGN, v)} />
        </>
      )}
      <Seg label="Padding" options={PADDING} value={groupValue(tokens, PADDING)} onChange={(v) => set(PADDING, v)} />
      <Seg label="Margin" options={MARGIN} value={groupValue(tokens, MARGIN)} onChange={(v) => set(MARGIN, v)} />
      <Seg label="Radius" options={ROUNDED} value={groupValue(tokens, ROUNDED)} onChange={(v) => set(ROUNDED, v)} />
      <div className="h-px bg-line" />
      <Seg label="Font size" options={FONT_SIZE} value={groupValue(tokens, FONT_SIZE)} onChange={(v) => set(FONT_SIZE, v)} />
      <Seg label="Weight" options={FONT_WEIGHT} value={groupValue(tokens, FONT_WEIGHT)} onChange={(v) => set(FONT_WEIGHT, v)} />
      <Seg label="Text align" options={TEXT_ALIGN} value={groupValue(tokens, TEXT_ALIGN)} onChange={(v) => set(TEXT_ALIGN, v)} />
      <div className="h-px bg-line" />
      <RawClass selected={selected} onClass={onClass} />
      <p className="text-[10.5px] leading-relaxed text-ink-3">Controls add Tailwind classes and write back to source. For non-Tailwind styling, edit classes directly above.</p>
    </div>
  );
}

function ElementTab({ selected, onText, onClass }: { selected: Selection; onText: (t: string) => void; onClass: (c: string) => void }) {
  const [t, setT] = useState(selected.text ?? "");
  useEffect(() => setT(selected.text ?? ""), [selected.text]);
  return (
    <div className="space-y-3.5 p-3">
      <ElementHeader selected={selected} />
      {selected.text !== null && (
        <div>
          <label className="text-[10px] uppercase tracking-wide text-ink-3">Text</label>
          <textarea
            value={t}
            onChange={(e) => setT(e.target.value)}
            onBlur={() => onText(t)}
            rows={3}
            className="mt-1 w-full resize-none rounded-md border border-line bg-bg p-2 text-[12px] text-ink outline-none focus:border-accent/60"
          />
        </div>
      )}
      <RawClass selected={selected} onClass={onClass} />
      {!selected.file && (
        <p className="text-[10.5px] leading-relaxed text-amber-300/70">No source mapping for this element (needs a React dev build with source info).</p>
      )}
    </div>
  );
}
