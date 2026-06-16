"use client";

import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
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

// The live WebContainer app, framed at the editor's current device width — drops
// into the editor's <main> in webapp mode, in place of the design canvas. Same
// chrome around it (top bar, panels, inspector); only this pane goes live.
export default function WebappCanvas({ wc }: { wc: ReturnType<typeof useWebContainer> }) {
  const device = useEditor((s) => s.device);
  const customWidth = useEditor((s) => s.customWidth);
  const w = customWidth ?? DEVICE_WIDTH[device];
  const full = !customWidth && device === "desktop";

  return (
    <div className="relative h-full w-full overflow-auto bg-[radial-gradient(circle_at_50%_-20%,rgba(204,255,2,0.05),transparent_60%)]">
      <div className="mx-auto h-full p-3" style={{ width: full ? "100%" : Math.min(w + 24, 100000) }}>
        <div className="relative h-full overflow-hidden rounded-xl border border-line bg-white shadow-sm">
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
  );
}
