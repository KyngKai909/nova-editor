"use client";

import { useState } from "react";
import { X, Lock, RefreshCw } from "lucide-react";
import { useEnvVars } from "@/store/envStore";

// Edit the Run/webapp env vars for a project. Saved encrypted in the browser and
// written into the running app's .env.local on (re)start — never sent to a server.
export default function EnvModal({
  projectId, onClose, onRestart,
}: {
  projectId: string | null;
  onClose: () => void;
  onRestart: () => void;
}) {
  const saved = useEnvVars((s) => (projectId ? s.byProject[projectId] || "" : ""));
  const setEnv = useEnvVars((s) => s.setEnv);
  const [text, setText] = useState(saved);

  const save = (restart: boolean) => {
    if (projectId) setEnv(projectId, text);
    onClose();
    if (restart) onRestart();
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-ink">Environment variables</h2>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-ink-3 hover:bg-raise hover:text-ink"><X size={15} /></button>
        </div>
        <p className="mb-2.5 text-[11.5px] leading-relaxed text-ink-3">
          One <code className="text-ink-2">KEY=value</code> per line, like a .env file. Written into the running app&rsquo;s{" "}
          <code className="text-ink-2">.env.local</code> so Vite / Next pick them up (e.g. <code className="text-ink-2">VITE_…</code>, <code className="text-ink-2">NEXT_PUBLIC_…</code>). Restart the app to apply.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          spellCheck={false}
          placeholder={"VITE_API_URL=https://api.example.com\nVITE_SUPABASE_URL=…\nVITE_SUPABASE_ANON_KEY=…"}
          className="w-full resize-none rounded-md border border-line bg-bg p-2.5 font-mono text-[12px] leading-relaxed text-ink outline-none focus:border-accent/60"
        />
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[10.5px] text-ink-3"><Lock size={11} /> Encrypted in your browser · never sent to a server</span>
          <div className="flex gap-2">
            <button onClick={() => save(false)} className="h-8 rounded-md border border-line px-3 text-[12px] text-ink-2 transition-colors hover:bg-raise hover:text-ink">Save</button>
            <button onClick={() => save(true)} className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-semibold text-accent-ink transition-colors hover:brightness-110">
              <RefreshCw size={12} /> Save &amp; restart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
