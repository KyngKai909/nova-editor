"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Sparkles, Send, Square, X, Trash2, Settings2, FileText, Pencil,
  Search as SearchIcon, ListTree, AlertTriangle, Loader2, ChevronsUpDown,
  Cpu, Clock,
} from "lucide-react";
import { useAi, type AiBlock } from "@/store/aiStore";
import { providerById, modelLabel, findModel } from "@/lib/aiProviders";
import { useEditor } from "@/store/editorStore";
import { runAgent } from "@/lib/aiAgent";
import {
  runLocalAgent, webgpuStatus, localEngineReady, loadedModelLabel, interruptLocal,
  type LoadProgress,
} from "@/lib/localAi";
import ModelPicker from "./ModelPicker";
import BrandMark from "@/components/ai/BrandMark";

function toolLabel(b: AiBlock): { icon: React.ReactNode; label: string; accent?: boolean } {
  const base = (b.input?.path || "").split("/").pop();
  switch (b.name) {
    case "read_file":
      return { icon: <FileText size={12} />, label: `Read ${base || "file"}` };
    case "write_file":
      return { icon: <Pencil size={12} />, label: `Edited ${base || "file"}`, accent: true };
    case "search":
      return { icon: <SearchIcon size={12} />, label: `Searched “${b.input?.query ?? ""}”` };
    case "list_files":
      return { icon: <ListTree size={12} />, label: "Listed files" };
    default:
      return { icon: <Sparkles size={12} />, label: b.name || "tool" };
  }
}

// Optional props let the Run tab reuse this panel against the running app's
// files (a WebContainer-backed FileBackend + its own conversation id) instead
// of the editor store. Omitted → unchanged editor behavior.
export default function AiPanel({ projectId: projectIdProp, backend, activePath }: {
  projectId?: string | null;
  backend?: import("@/lib/aiBackend").FileBackend;
  activePath?: string;
} = {}) {
  const open = useAi((s) => s.open);
  const setOpen = useAi((s) => s.setOpen);
  const selected = useAi((s) => s.selected);
  const keys = useAi((s) => s.keys);
  const clearConversation = useAi((s) => s.clearConversation);
  const editorProjectId = useEditor((s) => s.projectId);
  const projectId = projectIdProp ?? editorProjectId;
  const messages = useAi((s) => (projectId ? s.conversations[projectId] : undefined)) || [];

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const found = findModel(selected.provider, selected.model);
  const prov = found?.provider;
  const mdef = found?.model;
  const isLocal = !!mdef?.local;
  const isSoon = !!mdef?.disabled; // Nova Pro / Studio — not live yet
  const hasKey = !!keys[selected.provider];

  // on-device (Nova Lite) state
  const [gpu, setGpu] = useState<"checking" | "ok" | "no-webgpu" | "no-adapter">("checking");
  const [forceGpu, setForceGpu] = useState(false); // "Try anyway" escape hatch
  const [load, setLoad] = useState<LoadProgress | null>(null);
  const [localReady, setLocalReady] = useState(false);

  useEffect(() => {
    setLocalReady(localEngineReady());
    if (!isLocal) return;
    let alive = true;
    webgpuStatus().then((s) => alive && setGpu(s));
    return () => { alive = false; };
  }, [isLocal]);

  // We can attempt on-device whenever a GPU adapter exists — or the user forced
  // it. Only a total lack of WebGPU is a hard block.
  const gpuOk = forceGpu || gpu === "ok" || gpu === "no-adapter";
  const gpuHardBlocked = isLocal && gpu === "no-webgpu" && !forceGpu;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, load]);

  if (!open) return null;

  const canSend = !!input.trim() && !busy && !!projectId && !isSoon && (isLocal ? gpuOk : hasKey);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !projectId || isSoon) return;
    if (isLocal && !gpuOk) return;
    setInput("");
    setError(null);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      if (isLocal) {
        await runLocalAgent({ projectId: projectId!, userText: text, signal: ctrl.signal, onProgress: setLoad, backend, activePath });
        setLocalReady(true);
      } else {
        await runAgent({ projectId: projectId!, userText: text, signal: ctrl.signal, backend });
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e?.message || String(e));
    } finally {
      setBusy(false);
      setLoad(null);
      abortRef.current = null;
    }
  };

  const stop = () => {
    if (isLocal) interruptLocal();
    abortRef.current?.abort();
  };

  // subtitle under the model name in the selector chip
  const subtitle = isSoon
    ? "Coming soon"
    : isLocal
      ? localReady ? `On-device · ${loadedModelLabel() || "ready"}` : "On-device · free"
      : `${prov?.brand || "Unknown"}${hasKey ? "" : " · no key"}`;

  const downloading = busy && isLocal && load && load.progress < 1;

  return (
    <div className="flex h-full w-full flex-col bg-surface">
      {/* header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-3">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-accent-ink"><Sparkles size={13} /></span>
          <span className="font-display text-[14px] font-semibold tracking-tight">Nova AI</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => projectId && clearConversation(projectId)}
            disabled={!messages.length}
            title="Clear conversation"
            className="grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-raise hover:text-ink disabled:opacity-40"
          >
            <Trash2 size={14} />
          </button>
          <button onClick={() => setOpen(false)} title="Close" className="grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-raise hover:text-ink">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* model selector */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line px-3 py-2">
        <button
          onClick={() => setPicker(true)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-bg px-2 py-1.5 text-left transition-colors hover:border-line-2"
        >
          {prov && <BrandMark provider={prov} size={24} />}
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[12.5px] font-medium text-ink">{modelLabel(selected.provider, selected.model)}</span>
            <span className="block truncate text-[10.5px] text-ink-3">{subtitle}</span>
          </span>
          <ChevronsUpDown size={14} className="shrink-0 text-ink-3" />
        </button>
        <Link href="/settings" title="AI settings" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-ink-3 transition-colors hover:bg-raise hover:text-ink">
          <Settings2 size={15} />
        </Link>
      </div>

      {/* transcript */}
      <div ref={scrollRef} className="scroll-thin relative flex-1 overflow-auto px-3 py-4">
        {isSoon ? (
          <ComingSoon label={mdef?.label || "This model"} />
        ) : gpuHardBlocked ? (
          <GpuUnsupported onTryAnyway={() => setForceGpu(true)} />
        ) : !isLocal && !hasKey ? (
          <ConnectKey brand={prov?.brand} />
        ) : messages.length === 0 ? (
          <EmptyState isLocal={isLocal} localReady={localReady} noAdapter={isLocal && gpu === "no-adapter"} onPick={setInput} />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m, i) => {
              if (m.role === "user") {
                const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("");
                if (!text) return null; // tool_result carrier — internal
                return (
                  <div key={i} className="ml-6 self-end rounded-xl rounded-br-sm bg-accent/15 px-3 py-2 text-[13px] leading-relaxed text-ink">
                    {text}
                  </div>
                );
              }
              return (
                <div key={i} className="flex flex-col gap-1.5">
                  {m.content.map((b, j) => {
                    if (b.type === "text" && b.text?.trim()) {
                      return <div key={j} className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{b.text}</div>;
                    }
                    if (b.type === "tool_use") {
                      const t = toolLabel(b);
                      return (
                        <div key={j} className={`flex w-fit items-center gap-1.5 rounded-md border border-line px-2 py-1 font-mono text-[11px] ${t.accent ? "text-accent" : "text-ink-3"}`}>
                          {t.icon} {t.label}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              );
            })}
            {downloading ? (
              <DownloadProgress load={load!} />
            ) : busy ? (
              <div className="flex items-center gap-2 text-[12px] text-ink-3">
                <Loader2 size={13} className="animate-spin text-accent" /> {isLocal ? "Thinking on your device…" : "Working…"}
              </div>
            ) : null}
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}

        {picker && <ModelPicker onClose={() => setPicker(false)} />}
      </div>

      {/* composer */}
      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-bg px-2.5 py-2 focus-within:border-line-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={
              isSoon ? `${mdef?.label} is coming soon`
                : isLocal ? (gpuHardBlocked ? "Needs a WebGPU browser" : "Ask Nova Lite to change something…")
                : hasKey ? "Ask Nova to change something…" : "Add an API key to start"
            }
            disabled={!projectId || isSoon || (isLocal ? !gpuOk : !hasKey)}
            className="max-h-32 min-h-[24px] flex-1 resize-none self-center bg-transparent text-[13px] leading-6 text-ink outline-none placeholder:text-ink-3 disabled:opacity-50"
          />
          {busy ? (
            <button onClick={stop} title="Stop" className="grid h-8 w-8 shrink-0 self-end place-items-center rounded-lg bg-raise text-ink transition-colors hover:bg-line">
              <Square size={13} className="fill-current" />
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!canSend}
              title="Send"
              className="grid h-8 w-8 shrink-0 self-end place-items-center rounded-lg bg-accent text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              <Send size={14} />
            </button>
          )}
        </div>
        <p className="mt-1.5 px-1 text-[10.5px] text-ink-3">
          {isLocal
            ? "Nova Lite runs on your device — nothing leaves your browser. Enter to send · Shift+Enter for newline."
            : "Edits write to your files and round-trip to the canvas. Enter to send · Shift+Enter for newline."}
        </p>
      </div>
    </div>
  );
}

// ── states ───────────────────────────────────────────────────────────────────

function DownloadProgress({ load }: { load: LoadProgress }) {
  const pct = Math.round((load.progress || 0) * 100);
  const cached = !!load.cached;
  return (
    <div className="rounded-xl border border-line bg-bg p-3">
      <div className="flex items-center gap-2 text-[12px] text-ink-2">
        <Loader2 size={13} className="animate-spin text-accent" /> {cached ? "Loading Nova Lite from cache" : "Downloading Nova Lite"}… {pct}%
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-raise">
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-[10.5px] leading-relaxed text-ink-3 line-clamp-2">
        {load.text || (cached ? "Loading cached weights — no download needed." : "Fetching model weights — this one-time download is cached for next time.")}
      </p>
    </div>
  );
}

function EmptyState({ isLocal, localReady, noAdapter, onPick }: { isLocal: boolean; localReady: boolean; noAdapter?: boolean; onPick: (s: string) => void }) {
  const suggestions = ["Make the hero headline bigger and bolder", "Add a dark footer with social links", "Change the primary button color to blue"];
  return (
    <div className="mt-2 text-center text-[12.5px] leading-relaxed text-ink-3">
      {isLocal && noAdapter && (
        <div className="mx-auto mb-3 max-w-[290px] rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-left text-[11.5px] leading-relaxed text-amber-200/90">
          We couldn&apos;t detect a GPU. Nova Lite may still work — if it fails, turn on <b>hardware acceleration</b> in your browser settings and reload, or check <span className="font-mono">chrome://gpu</span>.
        </div>
      )}
      {isLocal && !localReady && (
        <div className="mx-auto mb-4 max-w-[290px] rounded-xl border border-line bg-bg p-4 text-left">
          <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink"><Cpu size={14} className="text-accent" /> Nova Lite runs on your device</span>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
            Your first message downloads the model (~2 GB) into this browser. After that it&apos;s instant, works offline, and nothing ever leaves your device.
          </p>
        </div>
      )}
      <p className="mx-auto max-w-[260px]">
        {isLocal
          ? "Ask Nova Lite to tweak this page or explain your code. It edits one file at a time."
          : "Ask Nova to build or change anything in this project. It reads and edits your real files — the canvas updates as it works."}
      </p>
      <div className="mx-auto mt-4 flex max-w-[280px] flex-col gap-1.5">
        {suggestions.map((s) => (
          <button key={s} onClick={() => onPick(s)} className="rounded-lg border border-line bg-bg px-3 py-2 text-left text-[12px] text-ink-2 transition-colors hover:border-line-2 hover:text-ink">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConnectKey({ brand }: { brand?: string }) {
  return (
    <div className="mx-auto mt-6 max-w-[280px] rounded-xl border border-line bg-bg p-5 text-center">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent/15 text-accent"><Sparkles size={18} /></span>
      <h3 className="mt-3 font-display text-[15px] font-semibold">Connect your AI</h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
        Add your own {brand || "provider"} API key to let the assistant read and edit your files.
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
        An API key is separate from a ChatGPT Plus / Claude Pro subscription. Your key stays in this browser. Or switch to <span className="text-ink-2">Nova Lite</span> — free, on-device, no key.
      </p>
      <Link href="/settings" className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-bg transition-colors hover:bg-accent hover:text-accent-ink">
        <Settings2 size={13} /> Add key in Settings
      </Link>
    </div>
  );
}

function GpuUnsupported({ onTryAnyway }: { onTryAnyway: () => void }) {
  return (
    <div className="mx-auto mt-6 max-w-[290px] rounded-xl border border-line bg-bg p-5 text-center">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-amber-400/15 text-amber-300"><Cpu size={18} /></span>
      <h3 className="mt-3 font-display text-[15px] font-semibold">WebGPU isn&apos;t available</h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
        Nova Lite needs WebGPU. In Chrome/Edge/Arc, turn on <b className="text-ink">hardware acceleration</b> (Settings → System) and reload — or check <span className="font-mono text-[11px]">chrome://gpu</span>. Safari needs 18+.
      </p>
      <button onClick={onTryAnyway} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-raise hover:text-ink">
        Try anyway
      </button>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
        Or add your own API key in Settings to use Claude, GPT, and others.
      </p>
    </div>
  );
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="mx-auto mt-6 max-w-[280px] rounded-xl border border-line bg-bg p-5 text-center">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent/15 text-accent"><Clock size={18} /></span>
      <h3 className="mt-3 font-display text-[15px] font-semibold">{label} is coming soon</h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
        A more capable managed model is on the way. For now, pick <span className="text-ink-2">Nova Lite</span> (free, on-device) or bring your own key.
      </p>
    </div>
  );
}
