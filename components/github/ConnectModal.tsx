"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
import { useGitHub } from "@/store/githubStore";

// Pre-fills the `repo` scope (covers private read/write, push, and repo creation).
const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo&description=Nova%20editor";

export default function ConnectModal({ onClose }: { onClose: () => void }) {
  const connectWithToken = useGitHub((s) => s.connectWithToken);
  const status = useGitHub((s) => s.status);
  const error = useGitHub((s) => s.error);
  const [token, setToken] = useState("");

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const connect = async () => {
    if (!token.trim()) return;
    const ok = await connectWithToken(token);
    if (ok) onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line-2 bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-display text-[15px] font-semibold tracking-tight">Connect GitHub</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 hover:bg-raise hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* OAuth (coming soon) */}
          <div className="group relative">
            <button
              disabled
              className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-line bg-bg/50 py-3 text-[14px] font-medium text-ink-3"
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              Continue with GitHub
            </button>
            <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-raise px-2 py-0.5 text-[10px] font-medium text-ink-2 opacity-0 transition-opacity group-hover:opacity-100">
              OAuth — coming soon
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-ink-3">
            <span className="h-px flex-1 bg-line" /> or connect with a token <span className="h-px flex-1 bg-line" />
          </div>

          <div className="rounded-lg border border-line bg-bg/40 p-3.5 text-[12px] leading-relaxed text-ink-2">
            <p className="flex items-center gap-1.5 font-medium text-ink">
              <KeyRound size={13} className="text-accent" /> Create a personal access token
            </p>
            <p className="mt-1.5 text-ink-3">
              Generate a classic token with the <span className="font-mono text-ink-2">repo</span> scope (private repos, push &amp; create repo), then paste it below.
            </p>
            <a
              href={TOKEN_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-raise px-2.5 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-raise/70"
            >
              Generate token on GitHub <ExternalLink size={12} />
            </a>
          </div>

          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && connect()}
            type="password"
            placeholder="ghp_…"
            className="h-11 w-full rounded-lg border border-line bg-bg px-3.5 font-mono text-[13px] outline-none focus:border-accent/60"
          />

          {error && <p className="text-[12px] text-red-400">{error}</p>}

          <button
            onClick={connect}
            disabled={status === "connecting" || !token.trim()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[14px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {status === "connecting" ? <Loader2 size={16} className="animate-spin" /> : null}
            {status === "connecting" ? "Connecting…" : "Connect"}
          </button>

          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-3">
            <ShieldCheck size={13} className="mt-0.5 shrink-0 text-ink-3" />
            Your token is stored only in this browser&apos;s local storage and is sent directly to GitHub — never to any Nova server.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
