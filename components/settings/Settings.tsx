"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, FolderCog, HardDrive, Check, GitBranch, Trash2, Loader2, Database, FolderOpen, Wand2,
  Sparkles, Eye, EyeOff, ExternalLink, ShieldCheck, Cpu,
} from "lucide-react";
import { useSettings } from "@/store/settingsStore";
import { useGitHub } from "@/store/githubStore";
import { useProjects } from "@/store/projectsStore";
import { useAi } from "@/store/aiStore";
import { PROVIDERS, modelLabel, providerById, type ProviderDef } from "@/lib/aiProviders";
import { fsSupported } from "@/lib/fileSystem";
import { pickWorkspace, clearWorkspace } from "@/lib/workspace";
import ConnectModal from "@/components/github/ConnectModal";
import AccountSettings from "@/components/auth/AccountSettings";
import BrandMark from "@/components/ai/BrandMark";

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-ink">{title}</div>
        {desc && <div className="mt-0.5 max-w-md text-[12.5px] leading-relaxed text-ink-3">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface/40 p-5">
      <h2 className="mb-1 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-2">
        <span className="text-accent">{icon}</span> {title}
      </h2>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function ProviderMonogram({ provider }: { provider: ProviderDef }) {
  return <BrandMark provider={provider} size={28} />;
}

function KeyField({ provider }: { provider: ProviderDef }) {
  const key = useAi((s) => s.keys[provider.id] || "");
  const setKey = useAi((s) => s.setKey);
  const [show, setShow] = useState(false);
  return (
    <div className="py-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProviderMonogram provider={provider} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink">
              {provider.brand}
              {key && <Check size={12} className="text-accent" />}
            </div>
            <div className="truncate text-[11px] text-ink-3">{provider.hint}</div>
          </div>
        </div>
        <a href={provider.consoleURL} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink">
          Get a key <ExternalLink size={11} />
        </a>
      </div>
      <div className="mt-2 flex items-center rounded-md border border-line bg-bg pr-1.5 focus-within:border-line-2">
        <input
          type={show ? "text" : "password"}
          value={key}
          onChange={(e) => setKey(provider.id, e.target.value)}
          placeholder={provider.keyPlaceholder}
          autoComplete="off"
          spellCheck={false}
          className="h-9 flex-1 bg-transparent px-3 font-mono text-[12.5px] text-ink outline-none placeholder:text-ink-3"
        />
        <button onClick={() => setShow((v) => !v)} className="grid h-7 w-7 shrink-0 place-items-center rounded text-ink-3 hover:text-ink" title={show ? "Hide" : "Show"}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${on ? "bg-accent" : "bg-raise"}`}
    >
      <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

export default function Settings() {
  const workspaceName = useSettings((s) => s.workspaceName);
  const setWorkspaceName = useSettings((s) => s.setWorkspaceName);
  const autoSaveToDisk = useSettings((s) => s.autoSaveToDisk);
  const setAutoSaveToDisk = useSettings((s) => s.setAutoSaveToDisk);
  const styleAsClasses = useSettings((s) => s.styleAsClasses);
  const setStyleAsClasses = useSettings((s) => s.setStyleAsClasses);
  const aiSelected = useAi((s) => s.selected);
  const aiKeys = useAi((s) => s.keys);
  const byokProviders = PROVIDERS.filter((p) => !p.managed); // Nova's own family has no key
  const connectedCount = byokProviders.filter((p) => aiKeys[p.id]).length;
  const user = useGitHub((s) => s.user);
  const disconnect = useGitHub((s) => s.disconnect);
  const projects = useProjects((s) => s.projects);
  const [connectOpen, setConnectOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // File System Access support differs between server (always false) and client,
  // so only evaluate it after mount to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const fsOk = mounted && fsSupported();

  const choose = async () => {
    setErr(null);
    setBusy(true);
    try {
      setWorkspaceName(await pickWorkspace());
    } catch (e: any) {
      if (e?.name !== "AbortError") setErr(e.message || "Could not set folder.");
    } finally {
      setBusy(false);
    }
  };

  const clearAll = () => {
    if (!confirm("Remove all projects from this browser? Files already saved to disk or GitHub are not affected.")) return;
    useProjects.setState({ projects: [] });
  };

  return (
    <div className="min-h-[100dvh] bg-bg">
      <div className="grain" />
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4 sm:px-8">
          <Link href="/dashboard" className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-raise hover:text-ink">
            <ArrowLeft size={16} />
          </Link>
          <h1 className="font-display text-[18px] font-semibold tracking-tight">Settings</h1>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-8 sm:px-8">
        {/* Account & invites — only renders when Supabase auth is configured */}
        <AccountSettings />

        <Section icon={<HardDrive size={14} />} title="Storage">
          <Row
            title="On-device storage"
            desc="Your projects are saved on this device (in your browser's storage) and survive closing the tab — on Chrome, Firefox, and Safari. Use Download (.zip) or GitHub to get a copy onto your disk."
          >
            <span className="rounded-full border border-line bg-bg px-2.5 py-1 text-[12px] text-accent">Always on</span>
          </Row>
          <Row
            title="Projects folder (live sync)"
            desc={
              fsOk
                ? "New projects (including GitHub imports) get their own subfolder created here and save to disk like a normal IDE, two-way."
                : "Live two-way folder sync needs a Chromium browser (Chrome, Edge, Arc) — Firefox and Safari don't offer the API. Your projects still save on-device here; export with Download (.zip) or push to GitHub to get them onto your disk."
            }
          >
            {fsOk ? (
              <div className="flex items-center gap-2">
                {workspaceName && (
                  <span className="flex items-center gap-1.5 rounded-md border border-line bg-bg px-2.5 py-1.5 text-[12px] text-ink-2">
                    <FolderOpen size={13} className="text-accent" /> {workspaceName}/
                  </span>
                )}
                <button
                  onClick={choose}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-raise disabled:opacity-60"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <FolderCog size={13} />}
                  {workspaceName ? "Change" : "Choose folder"}
                </button>
                {workspaceName && (
                  <button onClick={() => { clearWorkspace(); setWorkspaceName(null); }} className="grid h-8 w-8 place-items-center rounded-md text-ink-3 hover:bg-raise hover:text-red-400" title="Unset folder">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ) : (
              <span className="rounded-md border border-line bg-bg px-2.5 py-1.5 text-[12px] text-ink-3">Chromium only</span>
            )}
          </Row>
          {fsOk && (
            <Row title="Auto-save to disk" desc="Write changes to the project's folder automatically as you edit (folder-backed projects only).">
              <Toggle on={autoSaveToDisk} onChange={setAutoSaveToDisk} />
            </Row>
          )}
          {err && <p className="pt-2 text-[12px] text-red-400">{err}</p>}
        </Section>

        <Section icon={<Wand2 size={14} />} title="Editing">
          <Row title="Write Tailwind classes" desc="In Tailwind projects, visual style edits are written as utility classes (and become responsive per breakpoint) instead of inline styles. Other projects use inline styles.">
            <Toggle on={styleAsClasses} onChange={setStyleAsClasses} />
          </Row>
        </Section>

        <Section icon={<Sparkles size={14} />} title="AI assistant">
          <Row
            title="Active model"
            desc={`${modelLabel(aiSelected.provider, aiSelected.model)} (${providerById(aiSelected.provider)?.brand || "—"}). Pick a model from the AI panel in the editor.`}
          >
            <span className="rounded-full border border-line bg-bg px-2.5 py-1 text-[12px] text-ink-2">{connectedCount} key{connectedCount === 1 ? "" : "s"}</span>
          </Row>
          <div className="mt-1 flex items-start gap-2 rounded-lg border border-line bg-bg/60 p-3 text-[11.5px] leading-relaxed text-ink-3">
            <Cpu size={14} className="mt-0.5 shrink-0 text-accent" />
            <span>
              <span className="text-ink-2">Nova Lite</span> is built in and free — it runs on your device (WebGPU), needs no key, and nothing leaves your browser. For more power, add a key below or upgrade for the managed <span className="text-ink-2">Nova Pro / Studio</span> models.
            </span>
          </div>
          <p className="pt-3 text-[11px] font-medium uppercase tracking-wide text-ink-3">Bring your own key</p>
          <div className="divide-y divide-line">
            {byokProviders.map((p) => (
              <KeyField key={p.id} provider={p} />
            ))}
          </div>
          <p className="pt-3 text-[11.5px] leading-relaxed text-ink-3">
            Bring your own API key — this is <span className="text-ink-2">separate from a ChatGPT Plus or Claude Pro subscription</span>, which don't include API access. Add a key for any provider you use; OpenRouter gives one key for nearly any model. Keys are sent directly to the provider — nothing passes through a Nova server.
          </p>
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-line bg-bg/60 p-3 text-[11.5px] leading-relaxed text-ink-3">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" />
            <span>
              Keys are <span className="text-ink-2">encrypted at rest</span> in your browser (and never leave it). For best safety, use a key with a <span className="text-ink-2">spending limit you can revoke</span> — no client-side app can fully protect a key from a malicious browser extension or someone at your unlocked device.
            </span>
          </div>
        </Section>

        <Section icon={<GitBranch size={14} />} title="GitHub">
          <Row title="Account" desc="Connect to import private & organization repos, manage branches, and push commits.">
            {user ? (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={user.avatarUrl} alt={user.login} className="h-6 w-6 rounded-full" />
                <span className="text-[13px] text-ink">{user.login}</span>
                <button onClick={disconnect} className="ml-1 rounded-md border border-line px-2.5 py-1.5 text-[12px] text-ink-2 transition-colors hover:bg-raise hover:text-red-400">
                  Disconnect
                </button>
              </div>
            ) : (
              <button onClick={() => setConnectOpen(true)} className="flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-[12px] font-semibold text-bg transition-colors hover:bg-white">
                <GitBranch size={13} /> Connect GitHub
              </button>
            )}
          </Row>
        </Section>

        <Section icon={<Database size={14} />} title="Data">
          <Row title="Local projects" desc={`${projects.length} project${projects.length === 1 ? "" : "s"} stored in this browser. Clearing won't touch files already on disk or in GitHub.`}>
            <button onClick={clearAll} className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-red-400 transition-colors hover:bg-red-500/10">
              <Trash2 size={13} /> Clear local projects
            </button>
          </Row>
        </Section>
      </main>

      {connectOpen && <ConnectModal onClose={() => setConnectOpen(false)} />}
    </div>
  );
}
