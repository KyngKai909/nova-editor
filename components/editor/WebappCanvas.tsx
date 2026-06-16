"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle, RefreshCw, Terminal, ChevronDown, ChevronUp } from "lucide-react";
import { useEditor, DEVICE_WIDTH } from "@/store/editorStore";
import type { useWebContainer, WcPhase } from "@/lib/useWebContainer";

const PHASE_LABEL: Record<WcPhase, string> = {
  idle: "Preparing…",
  booting: "Booting Node runtime…",
  mounting: "Loading project files…",
  installing: "Installing dependencies…",
  starting: "Starting dev server…",
  ready: "Running",
  error: "Error",
};

// The live WebContainer app, framed at the editor's current device width + zoom
// (auto-fit so large sizes scale to fit, like the design canvas) — drops into the
// editor's <main> in webapp mode. Same chrome around it; only this pane goes live.
export default function WebappCanvas({ wc }: { wc: ReturnType<typeof useWebContainer> }) {
  const device = useEditor((s) => s.device);
  const customWidth = useEditor((s) => s.customWidth);
  const zoom = useEditor((s) => s.zoom);

  const [consoleOpen, setConsoleOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(0);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setStageW(e[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [wc.log, consoleOpen]);

  const width = customWidth ?? DEVICE_WIDTH[device];
  const fit = stageW ? Math.min(1, (stageW - 56) / width) : 1;
  const scale = fit * zoom;

  return (
    <div className="flex h-full w-full flex-col bg-[radial-gradient(circle_at_50%_-20%,rgba(204,255,2,0.05),transparent_60%)]">
      {/* live app stage — auto-fit + zoom, safe-centered so it never clips the edge */}
      <div ref={stageRef} className="scroll-thin relative min-h-0 flex-1 overflow-auto">
        <div className="flex min-h-full items-start p-7 [justify-content:safe_center]">
          <div className="shrink-0" style={{ width: width * scale, height: `calc((100% ) * ${scale})` }}>
            <div
              className="relative overflow-hidden rounded-xl border border-line bg-white shadow-2xl"
              style={{ width, height: "calc(100dvh - 130px)", transform: `scale(${scale})`, transformOrigin: "top left" }}
            >
              <iframe
                ref={wc.iframeRef}
                src={wc.url || "about:blank"}
                title="Live app"
                className="h-full w-full border-0 bg-white"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              />
              {wc.phase !== "ready" && (
                <div className="absolute inset-0 grid place-items-center bg-bg/95 text-center">
                  {wc.phase === "error" ? (
                    <div className="max-w-md px-6">
                      <AlertTriangle size={26} className="mx-auto text-red-400" />
                      <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{wc.error}</p>
                      <button onClick={wc.restart} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12px] text-ink-2 hover:bg-raise">
                        <RefreshCw size={13} /> Retry
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-ink-3">
                      <Loader2 size={24} className="animate-spin text-accent" />
                      <p className="text-[13px]">{PHASE_LABEL[wc.phase]}</p>
                      <p className="max-w-xs text-[11px] text-ink-3/70">First run installs dependencies in-browser — it can take a minute.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-line bg-surface/80 px-2.5 py-0.5 text-[10px] tabular-nums text-ink-3 backdrop-blur">
          {customWidth ? "custom" : device} · {width}px · {Math.round(scale * 100)}%
        </div>
      </div>

      {/* collapsible console / terminal footer (the dev server output) */}
      <div className="shrink-0 border-t border-line bg-surface">
        <button
          onClick={() => setConsoleOpen((o) => !o)}
          className="flex h-8 w-full items-center gap-2 px-3 text-[11px] font-medium text-ink-3 transition-colors hover:text-ink"
        >
          <Terminal size={13} /> Console
          {wc.log.length > 0 && <span className="rounded bg-raise px-1 text-[9px] tabular-nums text-ink-3">{wc.log.length}</span>}
          {consoleOpen ? <ChevronDown size={13} className="ml-auto" /> : <ChevronUp size={13} className="ml-auto" />}
        </button>
        {consoleOpen && (
          <div ref={logRef} className="scroll-thin h-44 overflow-auto border-t border-line bg-bg px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-2">
            {wc.log.length === 0 ? (
              <p className="text-ink-3">Waiting for output…</p>
            ) : (
              wc.log.map((l, i) => <pre key={i} className="whitespace-pre-wrap break-words">{l}</pre>)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
