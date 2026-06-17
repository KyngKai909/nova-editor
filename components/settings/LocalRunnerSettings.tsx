"use client";

import { useEffect, useState } from "react";
import { Cpu, Loader2, Check, Copy, RefreshCw, Lock } from "lucide-react";
import { useRunner } from "@/store/runnerStore";
import { probeRunner, verifyToken } from "@/lib/localRunner";

const INSTALL_CMD = "npx @nova/runner";

// Settings card for the local runner companion agent: detect it, paste the
// pairing token, show Connected. The agent itself uses your machine; this just
// detects + pairs (the token goes only to 127.0.0.1, never a Nova server).
export default function LocalRunnerSettings() {
  const token = useRunner((s) => s.token);
  const setToken = useRunner((s) => s.setToken);
  const [status, setStatus] = useState<"checking" | "up" | "down">("checking");
  const [version, setVersion] = useState<string>();
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [draft, setDraft] = useState(token);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const check = async () => {
    setStatus("checking");
    const r = await probeRunner();
    setStatus(r.up ? "up" : "down");
    setVersion(r.version);
    setTokenValid(r.up && token ? await verifyToken(token) : null);
  };
  useEffect(() => { check(); /* on mount */ }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(token); }, [token]);

  const save = async () => {
    setSaving(true);
    setToken(draft);
    setTokenValid(status === "up" && draft ? await verifyToken(draft) : null);
    setSaving(false);
  };
  const copy = () => { navigator.clipboard?.writeText(INSTALL_CMD).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };

  const connected = status === "up" && tokenValid === true;

  return (
    <section className="mb-8">
      <h2 className="mb-1 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-2">
        <Cpu size={14} /> Local runner
      </h2>
      <div className="divide-y divide-line">
        {/* status */}
        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-ink">Run on your machine</div>
            <div className="mt-0.5 max-w-md text-[12.5px] leading-relaxed text-ink-3">
              Run bigger projects at native speed by running the dev server on your own machine instead of the in-browser sandbox — still fully local and private. Install the small companion agent, paste its token, and Run can use it.
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {connected ? (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[12px] font-medium text-emerald-400"><Check size={13} /> Connected</span>
            ) : status === "up" ? (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[12px] font-medium text-amber-300">Detected · not paired</span>
            ) : status === "checking" ? (
              <span className="flex items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 text-[12px] text-ink-3"><Loader2 size={12} className="animate-spin" /> Checking…</span>
            ) : (
              <span className="rounded-full border border-line bg-bg px-2.5 py-1 text-[12px] text-ink-3">Not detected</span>
            )}
            <button onClick={check} title="Re-check" className="grid h-8 w-8 place-items-center rounded-md text-ink-3 transition-colors hover:bg-raise hover:text-ink"><RefreshCw size={13} /></button>
          </div>
        </div>

        {/* install (shown until connected) */}
        {!connected && (
          <div className="py-4">
            <div className="text-[12.5px] text-ink-2">{status === "up" ? "Agent running — paste its pairing token below." : "1. Start the agent (it prints a pairing token):"}</div>
            {status !== "up" && (
              <div className="mt-2 flex items-center justify-between rounded-md border border-line bg-bg px-3 py-2 font-mono text-[12px] text-ink-2">
                <span>{INSTALL_CMD}</span>
                <button onClick={copy} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-ink-3 hover:bg-raise hover:text-ink">
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* pairing token */}
        <div className="py-4">
          <div className="text-[12.5px] text-ink-2">{status === "up" ? "2. " : "2. "}Pairing token</div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="paste the token the agent printed"
              className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2.5 py-2 font-mono text-[12px] text-ink outline-none focus:border-accent/60"
            />
            <button onClick={save} disabled={saving || draft === token} className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-semibold text-accent-ink transition-colors hover:brightness-110 disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : "Save"}
            </button>
          </div>
          {tokenValid === false && token && <p className="mt-1.5 text-[11px] text-red-400">That token doesn&rsquo;t match the running agent — copy it from the agent&rsquo;s terminal output.</p>}
          <p className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-ink-3"><Lock size={11} /> Encrypted in your browser · sent only to 127.0.0.1, never a server</p>
        </div>
      </div>
    </section>
  );
}
