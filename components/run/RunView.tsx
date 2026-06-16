"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft, Loader2, Terminal, Play, AlertTriangle, ExternalLink, RefreshCw, CheckCircle2,
  Pencil, MousePointer2, ChevronDown, ChevronUp, Trash2,
  Monitor, Tablet, Smartphone, PanelRight, PanelLeft, Layers as LayersIcon, Sparkles, Upload,
  Undo2, Redo2, FileText, Component as ComponentIcon, KeyRound,
} from "lucide-react";
import { useAi } from "@/store/aiStore";
import { useEditor } from "@/store/editorStore";
import { useGitHub } from "@/store/githubStore";
import { useComments } from "@/store/commentsStore";
import AiPanel from "@/components/editor/AiPanel";
import ExportPanel from "@/components/editor/ExportPanel";
import { importRepoFilesAuth } from "@/lib/githubApi";
import { fileKind, classifyFile } from "@/lib/importUtils";
import type { SourceFile } from "@/lib/types";
import { useProjects } from "@/store/projectsStore";
import { InspectorView } from "@/components/editor/Inspector";
import ElementsPalette from "@/components/editor/ElementsPalette";
import WcLayers from "@/components/editor/WcLayers";
import WcPages from "@/components/editor/WcPages";
import EnvModal from "@/components/editor/EnvModal";
import { useWebContainer, type WcPhase } from "@/lib/useWebContainer";
import { usePanels } from "@/store/panelStore";
import ResizeHandle from "@/components/editor/ResizeHandle";
import { htmlToJsx } from "@/lib/elements";

type Device = "desktop" | "tablet" | "mobile";

const DEVICES: { id: Device; icon: React.ReactNode; label: string }[] = [
  { id: "desktop", icon: <Monitor size={15} />, label: "Desktop" },
  { id: "tablet", icon: <Tablet size={15} />, label: "Tablet · 834px" },
  { id: "mobile", icon: <Smartphone size={15} />, label: "Mobile · 390px" },
];
const DEVICE_W: Record<Device, string> = { desktop: "100%", tablet: "834px", mobile: "390px" };

const PHASE_LABEL: Record<WcPhase, string> = {
  idle: "Preparing…",
  booting: "Booting Node runtime…",
  mounting: "Loading project files…",
  installing: "Installing dependencies…",
  starting: "Starting dev server…",
  ready: "Running",
  error: "Error",
};

// The standalone /run page. The WebContainer lifecycle (boot, bridge, selection,
// the EditorSurface, undo/redo) lives in the shared useWebContainer hook — the
// same one the editor's webapp mode uses — so this view only owns /run-specific
// chrome: the device frame, the Pages/Components rails, publish, and the console.
export default function RunView() {
  const params = useSearchParams();
  const projectId = params.get("project");
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));

  const [device, setDevice] = useState<Device>("desktop");
  const wc = useWebContainer({ projectId, active: true, device });

  const [editMode, setEditMode] = useState(true);
  const [leftTab, setLeftTab] = useState<"pages" | "layers" | "components">("layers");
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftOpen, setLeftOpen] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [envOpen, setEnvOpen] = useState(false);

  const rightW = usePanels((s) => s.right);
  const leftW = usePanels((s) => s.left);
  const aiW = usePanels((s) => s.ai);
  const aiOpen = useAi((s) => s.open);
  const setAiOpen = useAi((s) => s.setOpen);
  const loadFiles = useEditor((s) => s.loadFiles);
  const ghToken = useGitHub((s) => s.token);
  const pendingComment = useComments((s) => s.pending);
  const logRef = useRef<HTMLDivElement>(null);

  // a right-click in the app sets a pending comment; reveal the inspector (which
  // auto-switches to its Comments tab) so the composer is visible.
  useEffect(() => { if (pendingComment) setRightOpen(true); }, [pendingComment]);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [wc.log]);

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

  // Insert a palette element after the selected element (HMR renders it in).
  // Needs a source-mapped selection so we know where in the file to splice.
  const insertElement = (html: string) => {
    const sel = wc.selected;
    if (!sel?.file || !sel.line) return;
    wc.editFile(sel.line, sel.file, (content, node) => {
      if (!node.sourceLocation) return null;
      const end = node.sourceLocation.end;
      const lineStart = content.lastIndexOf("\n", node.sourceLocation.start - 1) + 1;
      const indent = (content.slice(lineStart, node.sourceLocation.start).match(/^[ \t]*/) || [""])[0];
      const snippet = /\.html?$/i.test(sel.file!) ? html : htmlToJsx(html);
      return content.slice(0, end) + "\n" + indent + snippet + content.slice(end);
    });
  };

  // Publish from Run: gather the running project's current files (the
  // WebContainer mirrors disk after write-through), diff them against the
  // committed GitHub version, load them into the editor store, and open the
  // editor's existing Publish panel (download / commit & push / PR).
  const publishFromRun = async () => {
    if (!wc.backend || !projectId || publishing) return;
    setPublishing(true);
    try {
      let baseline: Map<string, string> | null = null;
      const gh = project?.github;
      if (gh && ghToken) {
        try {
          const { files: ghFiles } = await importRepoFilesAuth(ghToken, gh.owner, gh.repo, gh.branch);
          baseline = new Map(ghFiles.map((f) => [f.path, f.content]));
        } catch { /* no baseline → diff falls back to "all current" */ }
      }
      const files: SourceFile[] = [];
      for (const f of await wc.backend.list()) {
        const kind = fileKind(f.path);
        if (!kind) continue;
        const content = await wc.backend.read(f.path);
        if (content == null) continue;
        files.push({
          path: f.path,
          name: f.path.split("/").pop() || f.path,
          kind,
          category: classifyFile(f.path, kind),
          content,
          original: baseline?.get(f.path) ?? content,
        });
      }
      loadFiles(files, {}, project?.baseHref ?? null, projectId);
      setShowExport(true);
    } catch {
      /* best-effort */
    } finally {
      setPublishing(false);
    }
  };

  // undo / redo / delete keyboard shortcuts (no deps — capture fresh wc state)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) wc.redo(); else wc.undo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && wc.selected) {
        e.preventDefault();
        wc.surface.remove(wc.selectedId || "");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex h-[100dvh] flex-col bg-bg-2">
      <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line bg-surface px-3">
        {/* left — navigate · name · status */}
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={backToEditor} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-raise hover:text-ink" title="Back to editor">
            <ArrowLeft size={15} />
          </button>
          <button onClick={() => setLeftOpen((o) => !o)} title="Toggle layers" className={`grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-raise hover:text-ink ${leftOpen ? "text-ink" : "text-ink-3"}`}>
            <PanelLeft size={15} />
          </button>
          <button onClick={() => setAiOpen(!aiOpen)} title="Nova AI assistant" className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors ${aiOpen ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-raise hover:text-ink"}`}>
            <Sparkles size={14} /> <span className="hidden lg:inline">AI</span>
          </button>
          <div className="mx-0.5 hidden h-5 w-px bg-line lg:block" />
          <button onMouseDown={(e) => e.preventDefault()} onClick={wc.undo} disabled={!wc.past.length} title="Undo (⌘Z)" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-raise hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-3">
            <Undo2 size={15} />
          </button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={wc.redo} disabled={!wc.future.length} title="Redo (⌘⇧Z)" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-raise hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-3">
            <Redo2 size={15} />
          </button>
          <Play size={14} className="shrink-0 text-accent" />
          <span className="truncate text-[13px] font-medium">{project?.name || "Run"}</span>
          <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ${wc.phase === "ready" ? "bg-accent/15 text-accent" : wc.phase === "error" ? "bg-red-500/15 text-red-300" : "bg-raise text-ink-2"}`}>
            {wc.phase === "ready" ? <CheckCircle2 size={11} /> : wc.phase === "error" ? <AlertTriangle size={11} /> : <Loader2 size={11} className="animate-spin" />}
            <span className="hidden lg:inline">{PHASE_LABEL[wc.phase]}</span>
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
          {wc.url && (
            <button
              onClick={() => setEditMode((v) => !v)}
              title="Toggle click-to-edit on the running app"
              className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors ${editMode ? "bg-accent text-accent-ink" : "border border-line text-ink-2 hover:bg-raise"}`}
            >
              {editMode ? <Pencil size={12} /> : <MousePointer2 size={12} />} <span className="hidden lg:inline">{editMode ? "Editing" : "Interact"}</span>
            </button>
          )}
          {wc.url && (
            <a href={wc.url} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] text-ink-2 hover:bg-raise hover:text-ink">
              Open <ExternalLink size={12} />
            </a>
          )}
          <button onClick={() => setEnvOpen(true)} title="Environment variables" className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] text-ink-2 hover:bg-raise hover:text-ink">
            <KeyRound size={12} /> <span className="hidden lg:inline">Env</span>
          </button>
          <button onClick={wc.restart} title="Restart" className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] text-ink-2 hover:bg-raise hover:text-ink">
            <RefreshCw size={12} /> <span className="hidden lg:inline">Restart</span>
          </button>
          <button onClick={() => setRightOpen((o) => !o)} title="Toggle inspector" className={`grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-raise hover:text-ink ${rightOpen ? "text-ink" : "text-ink-3"}`}>
            <PanelRight size={15} />
          </button>
          {wc.url && (
            <button onClick={publishFromRun} disabled={publishing} title="Publish — review changes, commit & push" className="flex h-7 items-center gap-1.5 rounded-md bg-ink px-3 text-[12px] font-semibold text-bg transition-colors hover:bg-white disabled:opacity-60">
              {publishing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              <span className="hidden sm:inline">Publish</span>
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {/* layers + app + inspector */}
        <div className="relative flex min-h-0 flex-1">
          {/* left rail — Pages / Layers (mirrors the running app) / Components */}
          <aside
            style={{ width: leftOpen ? leftW : 0 }}
            className={`relative z-30 h-full shrink-0 overflow-hidden bg-surface ${leftOpen ? "border-r border-line" : ""} ${dragging ? "" : "transition-[width] duration-200"}`}
          >
            <div className="flex h-full flex-col" style={{ width: leftW }}>
              {/* icon tab rail — matches the right inspector rail (and the editor's left panel) */}
              <div className="flex shrink-0 items-center gap-0.5 border-b border-line p-1.5">
                {([["pages", <FileText key="p" size={15} />, "Pages"], ["layers", <LayersIcon key="l" size={15} />, "Layers"], ["components", <ComponentIcon key="c" size={15} />, "Components"]] as const).map(([id, icon, label]) => (
                  <button
                    key={id}
                    onClick={() => setLeftTab(id)}
                    title={label}
                    className={`grid h-8 flex-1 place-items-center rounded-md transition-colors ${leftTab === id ? "bg-raise text-ink" : "text-ink-3 hover:text-ink"}`}
                  >
                    {icon}
                  </button>
                ))}
                {leftTab === "layers" && wc.url && (
                  <button onClick={wc.refreshTree} title="Refresh layers" className="grid h-8 w-8 shrink-0 place-items-center rounded text-ink-3 hover:bg-raise hover:text-ink">
                    <RefreshCw size={12} />
                  </button>
                )}
              </div>
              <div className="flex h-7 shrink-0 items-center px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                {leftTab === "pages" ? "Pages" : leftTab === "components" ? "Components" : "Layers"}
              </div>
              <div className="scroll-thin min-h-0 flex-1 overflow-auto py-1">
                {leftTab === "components" ? (
                  <ElementsPalette onInsert={insertElement} hasSelection={!!wc.selected?.file} />
                ) : leftTab === "pages" ? (
                  <WcPages pages={wc.pages} route={wc.route} hasUrl={!!wc.url} onGo={wc.goToRoute} />
                ) : (
                  <WcLayers tree={wc.tree} selectedId={wc.selectedId} hasUrl={!!wc.url} onPick={wc.pickLayer} onHover={wc.hoverLayer} />
                )}
              </div>
            </div>
            {leftOpen && <ResizeHandle panel="left" edge="right" onActiveChange={setDragging} />}
          </aside>

          {/* AI assistant — its own column, editing the running app's files */}
          <aside
            style={{ width: aiOpen ? aiW : 0 }}
            className={`relative z-30 h-full shrink-0 overflow-hidden bg-surface ${aiOpen ? "border-r border-line" : ""} ${dragging ? "" : "transition-[width] duration-200"}`}
          >
            <div className="h-full" style={{ width: aiW }}>
              {wc.backend ? (
                <AiPanel projectId={projectId ? `run:${projectId}` : "run"} backend={wc.backend} activePath={wc.selected?.file} />
              ) : (
                <div className="grid h-full place-items-center px-6 text-center text-[12px] leading-relaxed text-ink-3">Start the app to use AI on the running project.</div>
              )}
            </div>
            {aiOpen && <ResizeHandle panel="ai" edge="right" onActiveChange={setDragging} />}
          </aside>

          {/* live app — framed to the selected device width */}
          <main className="scroll-thin relative min-w-0 flex-1 overflow-auto bg-bg">
            {wc.url ? (
              <div className={`mx-auto h-full bg-white ${dragging ? "" : "transition-[width] duration-200"}`} style={{ width: DEVICE_W[device], maxWidth: "100%" }}>
                <iframe ref={wc.iframeRef} title="app" src={wc.url} className="h-full w-full border-0" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" />
              </div>
            ) : (
              <div className="grid h-full place-items-center">
                {wc.phase === "error" ? (
                  <div className="max-w-md px-6 text-center">
                    <AlertTriangle size={28} className="mx-auto text-red-400" />
                    <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{wc.error}</p>
                    <button onClick={backToEditor} className="mt-4 inline-block rounded-lg border border-line px-3 py-2 text-[12px] text-ink-2 hover:bg-raise">Back to editor</button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-ink-3">
                    <Loader2 size={24} className="animate-spin text-accent" />
                    <p className="text-[13px]">{PHASE_LABEL[wc.phase]}</p>
                    <p className="max-w-xs text-center text-[11px] text-ink-3/70">First run installs dependencies in-browser — it can take a minute.</p>
                  </div>
                )}
              </div>
            )}
          </main>

          {/* right inspector — the SAME inspector the canvas editor uses, driven by
              the WebContainer surface from the shared hook */}
          <aside
            style={{ width: rightOpen ? rightW : 0 }}
            className={`relative z-30 h-full shrink-0 overflow-hidden bg-surface ${rightOpen ? "border-l border-line" : ""} ${dragging ? "" : "transition-[width] duration-200"}`}
          >
            <div className="h-full" style={{ width: rightW }}>
              <InspectorView surface={wc.surface} />
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
              <span className="rounded bg-raise px-1.5 py-0.5 text-[9.5px] font-normal normal-case tracking-normal text-ink-2">{wc.log.length}</span>
            </button>
            {wc.log.length > 0 && (
              <button onClick={wc.clearLog} title="Clear console" className="grid h-6 w-6 place-items-center rounded hover:bg-raise hover:text-ink">
                <Trash2 size={12} />
              </button>
            )}
            <button onClick={() => setConsoleOpen((o) => !o)} title={consoleOpen ? "Collapse" : "Expand"} className="grid h-6 w-6 place-items-center rounded hover:bg-raise hover:text-ink">
              {consoleOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          </div>
          {consoleOpen && (
            <div ref={logRef} className="scroll-thin h-[184px] overflow-auto border-t border-line px-3 py-2 font-mono text-[11px] leading-[1.6] text-ink-2">
              {wc.log.length === 0 && <span className="text-ink-3">Waiting for output…</span>}
              {wc.log.map((l, i) => (
                <pre key={i} className="whitespace-pre-wrap break-words">{l}</pre>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* the editor's own Publish panel, reused here against the running files */}
      {showExport && <ExportPanel onClose={() => setShowExport(false)} />}
      {envOpen && <EnvModal projectId={projectId} onClose={() => setEnvOpen(false)} onRestart={wc.restart} />}
    </div>
  );
}
