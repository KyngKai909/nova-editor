"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Rocket, FolderInput, MousePointerClick, Sparkles, Play, GitPullRequest,
  HelpCircle, KeyRound, ShieldCheck, Code2, ArrowRight,
} from "lucide-react";
import AlphaPill from "@/components/AlphaPill";

const SECTIONS = [
  { id: "overview", label: "Overview", icon: <Rocket size={14} /> },
  { id: "getting-started", label: "Getting started", icon: <Rocket size={14} /> },
  { id: "importing", label: "Importing", icon: <FolderInput size={14} /> },
  { id: "editing", label: "Visual & code editing", icon: <MousePointerClick size={14} /> },
  { id: "ai", label: "AI assistant", icon: <Sparkles size={14} /> },
  { id: "running", label: "Running live", icon: <Play size={14} /> },
  { id: "publishing", label: "Publishing & GitHub", icon: <GitPullRequest size={14} /> },
  { id: "privacy", label: "Storage & privacy", icon: <ShieldCheck size={14} /> },
  { id: "faq", label: "FAQ & troubleshooting", icon: <HelpCircle size={14} /> },
];

function CoreLoopDiagram() {
  const steps = [
    { t: "Import", s: "Repo · folder · paste" },
    { t: "Edit", s: "Visual · code · AI" },
    { t: "Ship", s: "Commit · push · PR" },
  ];
  return (
    <svg viewBox="0 0 680 130" className="w-full" role="img" aria-label="Import, edit, ship loop">
      {steps.map((st, i) => {
        const x = 20 + i * 230;
        return (
          <g key={st.t}>
            <rect x={x} y={28} width={200} height={74} rx={14} fill="var(--surface)" stroke="var(--line-2)" />
            <text x={x + 20} y={62} fill="var(--ink)" fontSize="19" fontWeight="600" fontFamily="var(--font-display, sans-serif)">{st.t}</text>
            <text x={x + 20} y={84} fill="var(--ink-3)" fontSize="12">{st.s}</text>
            <circle cx={x + 178} cy={46} r={10} fill="var(--accent)" opacity="0.18" />
            <text x={x + 178} y={50} fill="var(--accent)" fontSize="11" fontWeight="700" textAnchor="middle">{i + 1}</text>
            {i < 2 && <path d={`M${x + 200} 65 L${x + 230} 65`} stroke="var(--accent)" strokeWidth="2" markerEnd="url(#arrow)" />}
          </g>
        );
      })}
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0 0 L6 3 L0 6 Z" fill="var(--accent)" />
        </marker>
      </defs>
    </svg>
  );
}

function EditorAnatomy() {
  return (
    <svg viewBox="0 0 680 280" className="w-full" role="img" aria-label="Editor anatomy">
      {/* top bar */}
      <rect x={10} y={10} width={660} height={30} rx={8} fill="var(--surface)" stroke="var(--line)" />
      <circle cx={28} cy={25} r={5} fill="var(--accent)" />
      <text x={44} y={29} fill="var(--ink-2)" fontSize="11">Top bar — breakpoints · view modes · Run · Publish · AI</text>
      {/* columns */}
      <rect x={10} y={48} width={150} height={222} rx={10} fill="var(--surface)" stroke="var(--line)" />
      <text x={26} y={70} fill="var(--ink)" fontSize="12" fontWeight="600">Layers</text>
      {["section", "  nav", "  hero", "    h1", "  footer"].map((l, i) => (
        <text key={i} x={26} y={92 + i * 18} fill="var(--ink-3)" fontSize="11" fontFamily="monospace" style={{ whiteSpace: "pre" }}>{l}</text>
      ))}
      <rect x={170} y={48} width={330} height={222} rx={10} fill="var(--bg-2)" stroke="var(--line)" />
      <text x={186} y={70} fill="var(--ink-3)" fontSize="11">Canvas — your live page, click to select</text>
      <rect x={210} y={92} width={250} height={150} rx={10} fill="var(--surface)" stroke="var(--line-2)" />
      <rect x={300} y={120} width={70} height={70} rx={35} fill="var(--accent)" opacity="0.85" />
      <rect x={250} y={200} width={170} height={10} rx={5} fill="var(--ink-3)" />
      <rect x={510} y={48} width={160} height={222} rx={10} fill="var(--surface)" stroke="var(--line)" />
      <text x={526} y={70} fill="var(--ink)" fontSize="12" fontWeight="600">Inspector</text>
      {["Layout", "Spacing", "Typography", "Color"].map((l, i) => (
        <g key={l}>
          <text x={526} y={96 + i * 40} fill="var(--ink-3)" fontSize="10">{l}</text>
          <rect x={526} y={104 + i * 40} width={128} height={22} rx={6} fill="var(--bg)" stroke="var(--line)" />
        </g>
      ))}
    </svg>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface/40 p-4">
      <div className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-ink">
        <span className="text-accent">{icon}</span> {title}
      </div>
      <div className="text-[13px] leading-relaxed text-ink-2">{children}</div>
    </div>
  );
}

function H({ id, kicker, children }: { id: string; kicker: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24">
      <p className="mb-2 text-[11px] uppercase tracking-[0.25em] text-ink-3">{kicker}</p>
      <h2 className="font-display text-[clamp(1.6rem,3.5vw,2.4rem)] font-semibold tracking-tightest">{children}</h2>
    </div>
  );
}

export default function Docs() {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="min-h-[100dvh] bg-bg">
      <div className="grain" />
      {/* header */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2 font-display text-[16px] font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-ink">✦</span>
            <span className="flex items-baseline gap-1 leading-none">
              <span>Nova</span>
              <span className="font-normal text-ink-3">Docs</span>
              <AlphaPill className="translate-y-[1px] self-center" />
            </span>
          </Link>
          <Link href="/dashboard" className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-bg transition-colors hover:bg-accent hover:text-accent-ink">
            Open the app <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-5 py-10 sm:px-8">
        {/* sidebar */}
        <aside className="sticky top-24 hidden h-max w-56 shrink-0 lg:block">
          <nav className="flex flex-col gap-0.5">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                  active === s.id ? "bg-surface text-ink" : "text-ink-3 hover:bg-surface/60 hover:text-ink"
                }`}
              >
                <span className={active === s.id ? "text-accent" : ""}>{s.icon}</span> {s.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* content */}
        <main className="min-w-0 max-w-2xl flex-1 space-y-16 pb-24">
          {/* overview */}
          <section className="space-y-5">
            <H id="overview" kicker="Documentation">The last-mile visual editor</H>
            <p className="text-[15px] leading-relaxed text-ink-2">
              AI tools generate 90% of an app from a prompt. Nova is where you do the final 10% by hand —
              click an element, tweak its layout, color, and copy, and push clean code back to your repo.
              No tokens spent on micro-tweaks, no lock-in, nothing to install. Everything runs in your browser.
            </p>
            <div className="rounded-2xl border border-line bg-surface/30 p-5">
              <CoreLoopDiagram />
            </div>
            <p className="text-[13px] text-ink-3">
              Nova is in <span className="text-accent">alpha</span> — expect rough edges, and please send feedback.
            </p>
          </section>

          {/* getting started */}
          <section className="space-y-5">
            <H id="getting-started" kicker="5-minute first run">Getting started</H>
            <ol className="space-y-3 text-[14px] leading-relaxed text-ink-2">
              <li><b className="text-ink">1. Open the dashboard.</b> Click <i>Start building</i>. No account required.</li>
              <li><b className="text-ink">2. Open a project.</b> Import from GitHub, a folder, pasted code — or try the sample.</li>
              <li><b className="text-ink">3. Edit visually.</b> Click any element, change it in the inspector, double-click text to rewrite it.</li>
              <li><b className="text-ink">4. (Optional) Ask the AI.</b> Add your own key and let it make larger changes.</li>
              <li><b className="text-ink">5. Ship it.</b> <i>Publish</i> → review the diff → commit, push, or open a PR.</li>
            </ol>
          </section>

          {/* importing */}
          <section className="space-y-5">
            <H id="importing" kicker="Bring in a project">Importing</H>
            <p className="text-[14px] leading-relaxed text-ink-2">Nova opens an existing project. Paste any GitHub URL form and it figures out the rest:</p>
            <pre className="overflow-x-auto rounded-xl border border-line bg-bg-2 p-4 font-mono text-[12px] text-ink-2">{`https://github.com/owner/repo
https://github.com/owner/repo/tree/branch
git@github.com:owner/repo.git
owner/repo`}</pre>
            <div className="grid gap-3 sm:grid-cols-2">
              <Card icon={<FolderInput size={14} />} title="Connect GitHub">Paste a token in Settings → GitHub to import private/org repos, switch branches, and full-clone to disk.</Card>
              <Card icon={<Sparkles size={14} />} title="AI-generated repos">Push your Bolt / Lovable / v0 / Claude app to GitHub, then import it here. Connecting GitHub avoids rate limits on bigger repos.</Card>
            </div>
            <p className="text-[13px] leading-relaxed text-ink-3">
              The visual editor opens <b className="text-ink-2">.html, .jsx, and .tsx</b> files. A full clone brings every file to disk; CSS/config files aren't editable on the canvas yet.
            </p>
          </section>

          {/* editing */}
          <section className="space-y-5">
            <H id="editing" kicker="Visual ⇄ code, always in sync">Visual & code editing</H>
            <div className="rounded-2xl border border-line bg-surface/30 p-5">
              <EditorAnatomy />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Card icon={<MousePointerClick size={14} />} title="The inspector">Layout, spacing, size, typography, and color — written straight into your source. Tailwind projects get responsive utility classes.</Card>
              <Card icon={<Code2 size={14} />} title="The code editor">A built-in Monaco editor with autocomplete, two-way synced to the canvas. Right-click a layer → View in code to jump to the line.</Card>
            </div>
            <ul className="space-y-1.5 text-[13.5px] leading-relaxed text-ink-2">
              <li>• <b className="text-ink">Double-click</b> text to edit it in place.</li>
              <li>• Switch <b className="text-ink">desktop / tablet / mobile</b> breakpoints; hit <b className="text-ink">Preview</b> to use the page as a visitor.</li>
              <li>• <b className="text-ink">Delete</b> removes the selection, <b className="text-ink">Cmd/Ctrl+D</b> duplicates; drag layers to reorder.</li>
            </ul>
          </section>

          {/* ai */}
          <section className="space-y-5">
            <H id="ai" kicker="Bring your own key, any model">AI assistant</H>
            <p className="text-[14px] leading-relaxed text-ink-2">
              Open it with the <b className="text-ink">AI</b> button. It reads and edits your real files — the canvas updates as it works — and your conversation is saved per project.
            </p>
            <Card icon={<KeyRound size={14} />} title="An API key ≠ a chat subscription">
              ChatGPT Plus / Claude Pro don't include API access. Get a developer key from the provider's console (Settings → AI). Keys stay in your browser and go straight to the provider — never through a Nova server.
            </Card>
            <p className="text-[13.5px] leading-relaxed text-ink-2">
              Supported: <b className="text-ink">Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, Groq, and OpenRouter</b> (one key for nearly any model). Need something else? Use the <b className="text-ink">Custom model ID</b> field in the picker. The assistant edits .html/.jsx/.tsx files; cost is on your key, and inspector tweaks stay free.
            </p>
          </section>

          {/* running */}
          <section className="space-y-5">
            <H id="running" kicker="Boot the real app in the browser">Running live</H>
            <p className="text-[14px] leading-relaxed text-ink-2">
              For full apps (Vite/React), <b className="text-ink">Run app</b> boots the real project in your browser via WebContainers — nothing is uploaded. Then click an element in the running app and Nova maps it back to source so you can edit its class or text, with hot reload.
            </p>
            <Card icon={<Play size={14} />} title="Requirements">A folder-backed full clone (Settings → Storage) on a Chromium browser (Chrome / Edge / Arc). First boot installs dependencies; reloads after that are fast.</Card>
          </section>

          {/* publishing */}
          <section className="space-y-5">
            <H id="publishing" kicker="Your Git is the source of truth">Publishing & GitHub</H>
            <p className="text-[14px] leading-relaxed text-ink-2">
              Click <b className="text-ink">Publish</b> to review a clean diff of exactly what changed. Then download, save to your folder, or — for connected projects — <b className="text-ink">commit & push</b> or <b className="text-ink">open a pull request</b>. Pushing triggers your existing Vercel/Netlify deploy; Nova stays out of your pipeline.
            </p>
            <Card icon={<GitPullRequest size={14} />} title="Imported vs. connected">Importing a public URL gives you the files; connecting GitHub (a token, in Settings) is what lets you push back or create a new repo.</Card>
          </section>

          {/* privacy */}
          <section className="space-y-5">
            <H id="privacy" kicker="Local-first by design">Storage & privacy</H>
            <p className="text-[14px] leading-relaxed text-ink-2">
              Projects live in your browser and, optionally, a folder on your disk. Your GitHub token and AI keys are <b className="text-ink">encrypted at rest</b> in your browser and sent <b className="text-ink">directly</b> to GitHub / the AI provider — never through a Nova server. The Nova devs never receive your keys, and the source is open so you can verify it.
            </p>
            <Card icon={<KeyRound size={14} />} title="Key safety — and its honest limits">
              Encryption stops casual snooping and scrapers, but <b className="text-ink-2">no client-side app can fully protect a key</b> from a malicious browser extension or someone at your unlocked device. Best practice: use <b className="text-ink-2">scoped, revocable</b> keys — a fine-grained GitHub token limited to the repos you edit, and provider API keys with a spending limit you can rotate.
            </Card>
          </section>

          {/* faq */}
          <section className="space-y-5">
            <H id="faq" kicker="Answers & fixes">FAQ & troubleshooting</H>
            <div className="divide-y divide-line rounded-2xl border border-line">
              {[
                ["Is Nova free?", "Yes — the editor is free and runs in your browser. The only cost is your own AI API usage, if you use the assistant."],
                ["Do I need an account?", "No. Connect GitHub only to import private repos or push changes."],
                ["“Rate limit reached (no token).”", "Anonymous GitHub requests are limited. Connect GitHub in Settings and re-import."],
                ["“No editable .html/.jsx/.tsx files.”", "Nova's canvas opens HTML/JSX/TSX. Check the branch, or full-clone to work with the whole project."],
                ["The AI errors immediately.", "401 = bad key (re-check in Settings → AI); 429 = rate-limited / out of credit. Make sure the selected model's provider has a key (green dot in the picker)."],
                ["“Run app” won't start.", "Run mode needs a folder-backed full clone on a Chromium browser. Set a projects folder in Settings → Storage and re-import."],
                ["Which browsers work?", "Editing works anywhere modern; folder storage and Run app need a Chromium browser (Chrome / Edge / Arc)."],
              ].map(([q, a]) => (
                <div key={q} className="p-4">
                  <div className="text-[13.5px] font-semibold text-ink">{q}</div>
                  <div className="mt-1 text-[13px] leading-relaxed text-ink-2">{a}</div>
                </div>
              ))}
            </div>
            <p className="text-[13px] text-ink-3">Still stuck? Nova is in alpha — please send feedback so we can fix it.</p>
          </section>
        </main>
      </div>
    </div>
  );
}
