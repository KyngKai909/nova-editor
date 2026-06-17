"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, Cpu, ChevronDown, Check, Loader2 } from "lucide-react";
import { useRunner } from "@/store/runnerStore";
import { probeRunner, verifyToken } from "@/lib/localRunner";

// Chooses where Run ▶ executes: in the browser (WebContainer) or on the user's
// machine (the local runner agent). Sits next to the Play button. The "on your
// machine" option only becomes selectable once the agent is detected + paired.
export default function RuntimePicker() {
  const runtime = useRunner((s) => s.runtime);
  const setRuntime = useRunner((s) => s.setRuntime);
  const token = useRunner((s) => s.token);
  const [open, setOpen] = useState(false);
  const [conn, setConn] = useState<"idle" | "checking" | "ready" | "down">("idle");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setConn("checking");
      const r = await probeRunner();
      if (!alive) return;
      if (!r.up) return setConn("down");
      setConn(token && (await verifyToken(token)) ? "ready" : "down");
    })();
    return () => { alive = false; };
  }, [open, token]);

  const pick = (r: "browser" | "local") => { setRuntime(r); setOpen(false); };
  const Icon = runtime === "local" ? Cpu : Globe;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Where Run ▶ executes"
        className="flex h-7 items-center gap-0.5 rounded-md border border-line px-1.5 text-ink-2 transition-colors hover:bg-raise hover:text-ink"
      >
        <Icon size={13} /><ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-64 rounded-lg border border-line bg-surface p-1 shadow-xl">
          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-3">Run ▶ executes</div>
          <button onClick={() => pick("browser")} className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-raise">
            <Globe size={14} className="mt-0.5 shrink-0 text-ink-2" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">In browser {runtime === "browser" && <Check size={12} className="text-accent" />}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-ink-3">Zero-install and fully private. Memory-capped by the browser tab.</span>
            </span>
          </button>
          <button
            onClick={() => conn === "ready" && pick("local")}
            className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors ${conn === "ready" ? "hover:bg-raise" : "cursor-default"}`}
          >
            <Cpu size={14} className="mt-0.5 shrink-0 text-ink-2" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">On your machine {runtime === "local" && <Check size={12} className="text-accent" />}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-ink-3">Full native speed via the local runner agent — still local and private.</span>
              <span className="mt-1 block text-[10.5px] leading-snug">
                {conn === "checking" ? (
                  <span className="inline-flex items-center gap-1 text-ink-3"><Loader2 size={10} className="animate-spin" /> checking…</span>
                ) : conn === "ready" ? (
                  <span className="text-emerald-400">● Connected</span>
                ) : (
                  <span className="text-amber-400">Not detected — set up in Settings → Local runner</span>
                )}
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
