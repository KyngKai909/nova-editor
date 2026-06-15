"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft, Loader2, Terminal, Play, AlertTriangle, ExternalLink, RefreshCw, CheckCircle2,
  Pencil, MousePointer2, Code2, ChevronDown, ChevronUp, Paintbrush2, SlidersHorizontal, Trash2,
  Monitor, Tablet, Smartphone, PanelRight, AlignLeft, AlignCenter, AlignRight, Square,
} from "lucide-react";
import { useProjects } from "@/store/projectsStore";
import { getHandle } from "@/lib/handleStore";
import { verifyPermission, readDirTree } from "@/lib/fileSystem";
import { APP_BRIDGE, findNodeByLine, resolveWcPath } from "@/lib/runtime";
import { parseJsx } from "@/lib/jsxParser";
import { spliceJsx, setJsxProp } from "@/lib/jsxEdit";
import {
  toTokens, toClassName, groupValue, setGroup, setArbitraryColor,
  DISPLAY, FLEX_DIR, JUSTIFY, ALIGN, TEXT_ALIGN, FONT_SIZE, FONT_WEIGHT, PADDING, MARGIN, ROUNDED,
} from "@/lib/runStyle";
import { usePanels } from "@/store/panelStore";
import ResizeHandle from "@/components/editor/ResizeHandle";
import { Section, Field, Segmented, Select, ColorField } from "@/components/editor/controls";

interface Selection {
  file?: string;
  line?: number;
  tag: string;
  className: string;
  text: string | null;
  styles?: Record<string, string>; // computed styles reported by the bridge
}

type Phase = "idle" | "booting" | "mounting" | "installing" | "starting" | "ready" | "error";
type Device = "desktop" | "tablet" | "mobile";

const DEVICES: { id: Device; icon: React.ReactNode; label: string }[] = [
  { id: "desktop", icon: <Monitor size={15} />, label: "Desktop" },
  { id: "tablet", icon: <Tablet size={15} />, label: "Tablet · 834px" },
  { id: "mobile", icon: <Smartphone size={15} />, label: "Mobile · 390px" },
];
const DEVICE_W: Record<Device, string> = { desktop: "100%", tablet: "834px", mobile: "390px" };

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
  const [device, setDevice] = useState<Device>("desktop");
  const [rightOpen, setRightOpen] = useState(true);
  const [dragging, setDragging] = useState(false);
  const rightW = usePanels((s) => s.right);
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
  const applyClass = (className: string, style?: Record<string, string>) => {
    if (!selected) return;
    setSelected({ ...selected, className });
    iframeRef.current?.contentWindow?.postMessage({ type: "nova-apply", className, ...(style ? { style } : {}) }, "*");
    editFile(selected.line, selected.file, (content, node) => setJsxProp(content, node, "className", className));
  };
  // visual style controls edit the class token list, then apply as a className
  const applyTokens = (tokens: string[]) => applyClass(toClassName(tokens));
  // colors → an arbitrary class + an inline-style preview (Tailwind hasn't built
  // the new class yet; the inline style shows it instantly until HMR catches up).
  const applyColor = (kind: "text" | "bg", hex: string) => {
    if (!selected) return;
    const next = setArbitraryColor(toTokens(selected.className), kind, hex);
    applyClass(toClassName(next), { [kind === "text" ? "color" : "backgroundColor"]: hex });
  };

  // receive selection / inline-edit messages from the running app's bridge
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d?.type) return;
      if (d.type === "nova-select") setSelected({ file: d.file, line: d.line, tag: d.tag, className: d.className || "", text: d.text, styles: d.styles || undefined });
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
      <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line bg-surface px-3">
        {/* left — navigate · name · status */}
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={backToEditor} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-raise hover:text-ink" title="Back to editor">
            <ArrowLeft size={15} />
          </button>
          <Play size={14} className="shrink-0 text-accent" />
          <span className="truncate text-[13px] font-medium">{project?.name || "Run"}</span>
          <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ${phase === "ready" ? "bg-accent/15 text-accent" : phase === "error" ? "bg-red-500/15 text-red-300" : "bg-raise text-ink-2"}`}>
            {phase === "ready" ? <CheckCircle2 size={11} /> : phase === "error" ? <AlertTriangle size={11} /> : <Loader2 size={11} className="animate-spin" />}
            <span className="hidden lg:inline">{PHASE_LABEL[phase]}</span>
          </span>
        </div>

        {/* center — device sizes (frame the live app) */}
        <div className="hidden items-center rounded-lg border border-line bg-bg p-0.5 md:flex">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              onClick={() => setDevice(d.id)}
              title={d.label}
              className={`grid h-7 w-8 place-items-center rounded-md transition-colors ${device === d.id ? "bg-raise text-ink" : "text-ink-3 hover:text-ink"}`}
            >
              {d.icon}
            </button>
          ))}
        </div>

        {/* right — edit · open · restart · panel toggle */}
        <div className="flex items-center justify-end gap-2">
          {url && (
            <button
              onClick={() => setEditMode((v) => !v)}
              title="Toggle click-to-edit on the running app"
              className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors ${editMode ? "bg-accent text-accent-ink" : "border border-line text-ink-2 hover:bg-raise"}`}
            >
              {editMode ? <Pencil size={12} /> : <MousePointer2 size={12} />} <span className="hidden lg:inline">{editMode ? "Editing" : "Interact"}</span>
            </button>
          )}
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] text-ink-2 hover:bg-raise hover:text-ink">
              Open <ExternalLink size={12} />
            </a>
          )}
          <button onClick={() => setRunId((n) => n + 1)} title="Restart" className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] text-ink-2 hover:bg-raise hover:text-ink">
            <RefreshCw size={12} /> <span className="hidden lg:inline">Restart</span>
          </button>
          <button onClick={() => setRightOpen((o) => !o)} title="Toggle inspector" className={`grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-raise hover:text-ink ${rightOpen ? "text-ink" : "text-ink-3"}`}>
            <PanelRight size={15} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {/* app + inspector */}
        <div className="relative flex min-h-0 flex-1">
          {/* live app — framed to the selected device width */}
          <main className="scroll-thin relative min-w-0 flex-1 overflow-auto bg-bg">
            {url ? (
              <div className={`mx-auto h-full bg-white ${dragging ? "" : "transition-[width] duration-200"}`} style={{ width: DEVICE_W[device], maxWidth: "100%" }}>
                <iframe ref={iframeRef} title="app" src={url} className="h-full w-full border-0" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" />
              </div>
            ) : (
              <div className="grid h-full place-items-center">
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

          {/* right inspector — editor-style, resizable + collapsible */}
          <aside
            style={{ width: rightOpen ? rightW : 0 }}
            className={`relative z-30 h-full shrink-0 overflow-hidden border-l border-line bg-surface ${dragging ? "" : "transition-[width] duration-200"}`}
          >
            <div className="h-full" style={{ width: rightW }}>
              <RunInspector
                url={url}
                selected={selected}
                tab={tab}
                setTab={setTab}
                onTokens={applyTokens}
                onClass={applyClass}
                onText={applyText}
                onColor={applyColor}
              />
            </div>
            {rightOpen && <ResizeHandle panel="right" edge="left" onActiveChange={setDragging} />}
          </aside>

          {dragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
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

// ── inspector (a Run-native replica of the editor's Inspector) ───────────────

const opts = (arr: readonly string[], prefix: string) => arr.map((o) => ({ value: o, label: o.replace(prefix, "") || o }));

function RunInspector({
  url, selected, tab, setTab, onTokens, onClass, onText, onColor,
}: {
  url: string | null;
  selected: Selection | null;
  tab: "style" | "element";
  setTab: (t: "style" | "element") => void;
  onTokens: (t: string[]) => void;
  onClass: (c: string) => void;
  onText: (t: string) => void;
  onColor: (kind: "text" | "bg", hex: string) => void;
}) {
  const TABS = [
    { id: "style" as const, icon: <Paintbrush2 size={15} />, label: "Style" },
    { id: "element" as const, icon: <SlidersHorizontal size={15} />, label: "Element" },
  ];
  const rail = (
    <div className="sticky top-0 z-10 bg-surface/90 backdrop-blur">
      <div className="flex items-center gap-0.5 border-b border-line p-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            title={t.label}
            className={`grid h-8 flex-1 place-items-center rounded-md transition-colors ${tab === t.id ? "bg-raise text-ink" : "text-ink-3 hover:text-ink"}`}
          >
            {t.icon}
          </button>
        ))}
      </div>
      {selected ? (
        <div className="flex items-center justify-between border-b border-line px-3.5 py-2">
          <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[11px] font-medium text-accent">{selected.tag}</span>
          {selected.file ? (
            <span className="flex items-center gap-1 truncate font-mono text-[11px] text-ink-3" title={selected.file}>
              <Code2 size={10} /> {selected.file.split("/").pop()}:{selected.line}
            </span>
          ) : (
            <span className="text-[10px] text-amber-300/70">no source map</span>
          )}
        </div>
      ) : (
        <div className="flex h-7 items-center px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          {TABS.find((t) => t.id === tab)!.label}
        </div>
      )}
    </div>
  );

  return (
    <div className="scroll-thin h-full overflow-y-auto pb-10">
      {rail}
      {!url ? (
        <Empty msg="Start the app to begin editing." />
      ) : !selected ? (
        <Empty msg="Click an element in the app to select it; double-click text to edit it. Edits write to source and hot-reload." />
      ) : tab === "style" ? (
        <RunStyle selected={selected} onTokens={onTokens} onClass={onClass} onColor={onColor} />
      ) : (
        <RunElement selected={selected} onText={onText} onClass={onClass} />
      )}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface">
        <Square size={16} className="text-ink-3" />
      </div>
      <p className="max-w-[200px] text-[12px] leading-relaxed text-ink-3">{msg}</p>
    </div>
  );
}

function RunStyle({
  selected, onTokens, onClass, onColor,
}: {
  selected: Selection;
  onTokens: (t: string[]) => void;
  onClass: (c: string) => void;
  onColor: (kind: "text" | "bg", hex: string) => void;
}) {
  const tokens = toTokens(selected.className);
  const set = (group: readonly string[], v: string) => onTokens(setGroup(tokens, group, v || null));
  const gv = (group: readonly string[]) => (groupValue(tokens, group) ?? "") as any;
  const display = groupValue(tokens, DISPLAY);
  const st = selected.styles || {};
  return (
    <>
      <Section title="Layout">
        <Field label="Display">
          <Segmented value={gv(DISPLAY)} options={[{ value: "block", label: "Block" }, { value: "flex", label: "Flex" }, { value: "grid", label: "Grid" }, { value: "hidden", label: "None" }]} onChange={(v) => set(DISPLAY, v)} />
        </Field>
        {display === "flex" && (
          <>
            <Field label="Direction">
              <Segmented value={gv(FLEX_DIR)} options={[{ value: "flex-row", label: "Row" }, { value: "flex-col", label: "Column" }]} onChange={(v) => set(FLEX_DIR, v)} />
            </Field>
            <Field label="Justify"><Select value={gv(JUSTIFY)} options={opts(JUSTIFY, "justify-")} onChange={(v) => set(JUSTIFY, v)} /></Field>
            <Field label="Align"><Select value={gv(ALIGN)} options={opts(ALIGN, "items-")} onChange={(v) => set(ALIGN, v)} /></Field>
          </>
        )}
      </Section>

      <Section title="Spacing">
        <Field label="Padding"><Select value={gv(PADDING)} options={opts(PADDING, "p-")} onChange={(v) => set(PADDING, v)} /></Field>
        <Field label="Margin"><Select value={gv(MARGIN)} options={opts(MARGIN, "m-")} onChange={(v) => set(MARGIN, v)} /></Field>
        <Field label="Radius"><Select value={gv(ROUNDED)} options={ROUNDED.map((o) => ({ value: o, label: o.replace("rounded-", "") === "rounded" ? "base" : o.replace("rounded-", "") || "base" }))} onChange={(v) => set(ROUNDED, v)} /></Field>
      </Section>

      <Section title="Typography">
        <Field label="Size"><Select value={gv(FONT_SIZE)} options={opts(FONT_SIZE, "text-")} onChange={(v) => set(FONT_SIZE, v)} /></Field>
        <Field label="Weight"><Select value={gv(FONT_WEIGHT)} options={opts(FONT_WEIGHT, "font-")} onChange={(v) => set(FONT_WEIGHT, v)} /></Field>
        <Field label="Align">
          <Segmented value={gv(TEXT_ALIGN)} options={[{ value: "text-left", icon: <AlignLeft size={13} /> }, { value: "text-center", icon: <AlignCenter size={13} /> }, { value: "text-right", icon: <AlignRight size={13} /> }]} onChange={(v) => set(TEXT_ALIGN, v)} />
        </Field>
        <Field label="Color"><ColorField value={st.color || ""} onChange={(v) => onColor("text", v)} /></Field>
      </Section>

      <Section title="Appearance">
        <Field label="Background"><ColorField value={st.background || ""} onChange={(v) => onColor("bg", v)} /></Field>
      </Section>

      <Section title="Classes" defaultOpen={false}>
        <RunClasses selected={selected} onClass={onClass} />
        <p className="pt-1 text-[10.5px] leading-relaxed text-ink-3">Controls add Tailwind classes and write to source. Edit any class directly here.</p>
      </Section>
    </>
  );
}

function RunElement({ selected, onText, onClass }: { selected: Selection; onText: (t: string) => void; onClass: (c: string) => void }) {
  return (
    <>
      {selected.text !== null && (
        <Section title="Content">
          <RunText selected={selected} onText={onText} />
        </Section>
      )}
      <Section title="Classes">
        <RunClasses selected={selected} onClass={onClass} />
      </Section>
      {!selected.file && (
        <p className="px-3.5 py-3 text-[10.5px] leading-relaxed text-amber-300/70">No source mapping for this element (needs a React dev build with source info).</p>
      )}
    </>
  );
}

function RunText({ selected, onText }: { selected: Selection; onText: (t: string) => void }) {
  const [t, setT] = useState(selected.text ?? "");
  useEffect(() => setT(selected.text ?? ""), [selected.text]);
  return (
    <textarea
      value={t}
      onChange={(e) => setT(e.target.value)}
      onBlur={() => onText(t)}
      rows={3}
      className="w-full resize-none rounded-md border border-line bg-bg p-2 text-[12px] text-ink outline-none focus:border-accent/60"
    />
  );
}

function RunClasses({ selected, onClass }: { selected: Selection; onClass: (c: string) => void }) {
  const [v, setV] = useState(selected.className);
  useEffect(() => setV(selected.className), [selected.className]);
  return (
    <textarea
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onClass(v)}
      rows={2}
      spellCheck={false}
      className="w-full resize-none rounded-md border border-line bg-bg p-2 font-mono text-[11px] leading-relaxed text-ink outline-none focus:border-accent/60"
    />
  );
}
