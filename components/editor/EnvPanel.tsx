"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, RefreshCw, Upload } from "lucide-react";
import { useEnvVars } from "@/store/envStore";

// Reusable env-vars editor: view / type, or upload a .env file. Saved encrypted
// per project; written into the running app's .env.local on (re)start. Used both
// as the right-panel Env tab (run mode) and inside EnvModal.
export default function EnvPanel({
  projectId, onRestart, onDone,
}: {
  projectId: string | null;
  onRestart: () => void;
  onDone?: () => void;
}) {
  const setEnv = useEnvVars((s) => s.setEnv);
  const [text, setText] = useState(() => (projectId ? useEnvVars.getState().byProject[projectId] || "" : ""));
  const fileRef = useRef<HTMLInputElement>(null);

  // reload the saved text when the project changes
  useEffect(() => {
    setText(projectId ? useEnvVars.getState().byProject[projectId] || "" : "");
  }, [projectId]);

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) f.text().then((t) => setText((prev) => (prev.trim() ? prev.replace(/\s*$/, "") + "\n" + t.trim() + "\n" : t)));
    e.target.value = "";
  };
  const save = (restart: boolean) => {
    if (projectId) setEnv(projectId, text);
    onDone?.();
    if (restart) onRestart();
  };

  return (
    <div className="flex h-full flex-col gap-2.5 p-3">
      <p className="text-[11.5px] leading-relaxed text-ink-3">
        One <code className="text-ink-2">KEY=value</code> per line, like a .env file — type them or upload a .env. Written into the running app&rsquo;s{" "}
        <code className="text-ink-2">.env.local</code> (Vite <code className="text-ink-2">VITE_…</code>, Next <code className="text-ink-2">NEXT_PUBLIC_…</code>). Restart to apply.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        placeholder={"VITE_API_URL=https://api.example.com\nVITE_SUPABASE_URL=…\nVITE_SUPABASE_ANON_KEY=…"}
        className="scroll-thin min-h-[160px] flex-1 resize-none rounded-md border border-line bg-bg p-2.5 font-mono text-[12px] leading-relaxed text-ink outline-none focus:border-accent/60"
      />
      <input ref={fileRef} type="file" accept=".env,.txt,text/plain" hidden onChange={onUpload} />
      <div className="flex items-center gap-2">
        <button onClick={() => fileRef.current?.click()} className="flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-raise hover:text-ink">
          <Upload size={13} /> Upload .env
        </button>
        <div className="ml-auto flex gap-2">
          <button onClick={() => save(false)} className="h-8 rounded-md border border-line px-3 text-[12px] text-ink-2 transition-colors hover:bg-raise hover:text-ink">Save</button>
          <button onClick={() => save(true)} className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-semibold text-accent-ink transition-colors hover:brightness-110">
            <RefreshCw size={12} /> Save &amp; restart
          </button>
        </div>
      </div>
      <span className="flex items-center gap-1.5 text-[10.5px] text-ink-3"><Lock size={11} /> Encrypted in your browser · never sent to a server</span>
    </div>
  );
}
