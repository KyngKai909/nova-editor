"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import AlphaPill from "@/components/AlphaPill";
import { useRouteTransition } from "@/components/transition/RouteTransition";
import {
  ArrowUpRight, MousePointerClick, Layers, Smartphone, GitPullRequest,
  Code2, FolderUp, Menu, X, Sparkles,
  Play, ShieldCheck, Bot, Zap, GitBranch, Boxes, Check,
  Star, GitFork, BookOpen,
} from "lucide-react";

// lucide dropped its brand marks, so inline the GitHub octocat (uses currentColor).
function Github({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className} aria-hidden>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

const ThreeHero = dynamic(() => import("./ThreeHero"), { ssr: false });

const NAV = [
  { label: "Why Nova", href: "#why" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "Docs", href: "/docs" },
];

const MARQUEE = [
  "HTML", "JSX", "TSX", "Tailwind", "Any repo", "Run it live",
  "Your code", "Your Git", "Your AI keys", "No lock-in", "In-browser",
];

const REPO = "https://github.com/KyngKai909/nova-editor";

const OSS_FACTS = [
  { title: "AGPL 3.0", sub: "License · forks stay open" },
  { title: "TypeScript", sub: "End-to-end, strictly typed" },
  { title: "Next.js 14", sub: "App Router · React · Tailwind" },
  { title: "No telemetry", sub: "Nothing tracked. Ever." },
];

const STEPS = [
  { n: "01", icon: <FolderUp size={18} />, title: "Import", body: "Clone a full GitHub repo, open a folder from disk, or paste a component. Nova works in your browser — no upload, no account." },
  { n: "02", icon: <MousePointerClick size={18} />, title: "Edit visually — or with AI", body: "Click any element and shape real CSS with a full inspector, or ask the built-in AI to make the change. Edits round-trip to source." },
  { n: "03", icon: <GitPullRequest size={18} />, title: "Run it, then ship", body: "Boot the whole app live in the browser, review a clean diff, then commit, push, or open a pull request — without leaving the tab." },
];

// The differentiators — what makes Nova distinct from AI builders, visual
// builders, and traditional IDEs.
const DIFF = [
  { icon: <Boxes size={18} />, title: "Edit anything, not just React", body: "HTML, JSX, TSX and Tailwind — any framework, any repo, even a single pasted component. Not locked to one stack." },
  { icon: <Play size={18} />, title: "Run the real app, live", body: "Boot the entire project in the browser and edit it as it actually runs — not a faked preview of a static mock." },
  { icon: <ShieldCheck size={18} />, title: "Your code, your Git, your keys", body: "Local-first and fully open source. Files live on your disk, changes go through your Git, AI runs on your own key. No backend, no lock-in." },
  { icon: <Bot size={18} />, title: "Bring your own AI", body: "Connect any model with your own API key. The assistant reads and edits your real files — and the canvas updates instantly." },
  { icon: <Zap size={18} />, title: "Visual edits stay free", body: "Direct manipulation never burns a token. Use AI when you want leverage, your mouse when you don't — you choose the cost." },
  { icon: <GitBranch size={18} />, title: "One tab, the whole loop", body: "Design, code, run, and commit in a single place. No export step, no handoff, no context-switch between tools." },
];

const FEATURES = [
  { icon: <MousePointerClick size={18} />, title: "Direct manipulation", body: "Select, restyle, and rewrite text right on the rendered page — what you see is the real DOM." },
  { icon: <Layers size={18} />, title: "Layer tree + code", body: "Navigate nested structure, collapse branches, and jump straight to the source line in the built-in editor." },
  { icon: <Smartphone size={18} />, title: "Responsive by design", body: "Design across desktop, tablet, and mobile breakpoints, then flip into a true preview mode." },
  { icon: <Code2 size={18} />, title: "Code, not lock-in", body: "Nova edits your files, not a proprietary format. Leave any time with code that reads like you wrote it." },
];

const PRICING = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    tagline: "Everything you need to edit and ship.",
    features: [
      "Visual + code editor, unlimited projects",
      "Run apps live in the browser",
      "AI assistant with your own API key",
      "Commit, push & PRs to your GitHub",
      "Local-first — your files stay yours",
    ],
    cta: "Start free",
  },
  {
    name: "Pro",
    price: "$8",
    period: "/month",
    highlight: true,
    tagline: "Your work, backed up and synced everywhere.",
    features: [
      "Everything in Free",
      "Cloud backup of every project",
      "Real-time sync across devices & browsers",
      "Offline edits sync when you reconnect",
      "Pick up any project, anywhere",
    ],
    cta: "Get Pro",
  },
  {
    name: "Studio",
    price: "Soon",
    period: "",
    soon: true,
    tagline: "AI built in — no API key to manage.",
    features: [
      "Everything in Pro",
      "Managed AI — nothing to set up",
      "Metered usage, billed simply",
      "Higher limits & top models",
    ],
    cta: "Coming soon",
  },
];

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const { navigate } = useRouteTransition();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.from(".hero-line", { yPercent: 120, opacity: 0, duration: 1.1, ease: "expo.out", stagger: 0.12, delay: 0.15 });
      gsap.from(".hero-fade", { opacity: 0, y: 16, duration: 0.9, ease: "power3.out", stagger: 0.08, delay: 0.7 });
      gsap.utils.toArray<HTMLElement>(".reveal").forEach((el) => {
        gsap.from(el, { opacity: 0, y: 40, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 85%" } });
      });
      ScrollTrigger.batch(".tile", {
        start: "top 88%",
        onEnter: (els) => gsap.from(els, { opacity: 0, y: 50, duration: 0.9, ease: "power3.out", stagger: 0.1, overwrite: true }),
      });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={root} className="relative overflow-x-clip bg-bg">
      <div className="grain" />

      {/* nav */}
      <nav className="fixed inset-x-0 top-0 z-50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2 font-display text-[16px] font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-ink">✦</span>
            Nova
            <AlphaPill />
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={(e) => { if (n.href.startsWith("/")) { e.preventDefault(); navigate(n.href); } }} className="text-[13px] text-ink-2 transition-colors hover:text-ink">{n.label}</a>
            ))}
            <Link href="/dashboard" onClick={(e) => { e.preventDefault(); navigate("/dashboard"); }} className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-bg transition-colors hover:bg-accent hover:text-accent-ink">
              Start building <ArrowUpRight size={14} />
            </Link>
          </div>
          <button onClick={() => setMenu((m) => !m)} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink md:hidden">
            {menu ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        {menu && (
          <div className="mx-5 rounded-2xl border border-line bg-surface/95 p-4 backdrop-blur md:hidden">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={(e) => { setMenu(false); if (n.href.startsWith("/")) { e.preventDefault(); navigate(n.href); } }} className="block py-2.5 text-[15px] text-ink-2">{n.label}</a>
            ))}
            <Link href="/dashboard" onClick={(e) => { e.preventDefault(); navigate("/dashboard"); }} className="mt-2 block rounded-full bg-accent py-3 text-center text-[14px] font-semibold text-accent-ink">Start building</Link>
          </div>
        )}
      </nav>

      {/* hero */}
      <section className="relative flex min-h-[100dvh] flex-col justify-center overflow-hidden px-5 sm:px-8">
        <div className="absolute inset-0 z-0">
          <ThreeHero />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_60%,transparent,var(--bg)_78%)]" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-7xl">
          <p className="hero-fade mb-6 flex items-center gap-2 text-[12px] uppercase tracking-[0.3em] text-ink-3">
            <span className="h-px w-8 bg-accent" /> The visual editor for real code
          </p>
          <h1 className="font-display text-[clamp(2.6rem,9vw,7.5rem)] font-semibold leading-[0.92] tracking-tightest">
            <span className="block overflow-hidden"><span className="hero-line block">Design in</span></span>
            <span className="block overflow-hidden"><span className="hero-line block">the <span className="font-serif italic text-accent">browser</span>,</span></span>
            <span className="block overflow-hidden"><span className="hero-line block">ship the code.</span></span>
          </h1>
          <p className="hero-fade mt-7 max-w-xl text-[16px] leading-relaxed text-ink-2 sm:text-[18px]">
            Nova turns any repo or site into an editable canvas. Restyle visually, ask AI on your own
            key, run the real app live — all on code that stays yours. Open source, local-first, no lock-in.
          </p>
          <div className="hero-fade mt-9 flex flex-wrap items-center gap-3">
            <Link href="/dashboard" onClick={(e) => { e.preventDefault(); navigate("/dashboard"); }} className="group flex items-center gap-2 rounded-full bg-accent px-6 py-3.5 text-[15px] font-semibold text-accent-ink transition-transform hover:scale-[1.02]">
              Start building free
              <ArrowUpRight size={17} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
            <a href="#how" className="rounded-full border border-line-2 px-6 py-3.5 text-[15px] font-medium text-ink transition-colors hover:bg-surface">
              See how it works
            </a>
          </div>
        </div>

        <div className="hero-fade absolute bottom-7 left-1/2 z-10 -translate-x-1/2 text-[11px] uppercase tracking-[0.3em] text-ink-3">Scroll</div>
      </section>

      {/* marquee */}
      <div className="relative border-y border-line bg-surface/40 py-5">
        <div className="flex w-max animate-marquee gap-10 whitespace-nowrap will-change-transform">
          {[...MARQUEE, ...MARQUEE].map((s, i) => (
            <span key={i} className="flex items-center gap-10 font-display text-[18px] text-ink-2">{s} <span className="text-accent">✦</span></span>
          ))}
        </div>
      </div>

      {/* why nova — differentiators */}
      <section id="why" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="reveal mb-14 max-w-2xl">
          <p className="mb-4 flex items-center gap-2 text-[12px] uppercase tracking-[0.3em] text-ink-3"><Sparkles size={14} className="text-accent" /> Why Nova</p>
          <h2 className="font-display text-[clamp(2rem,5.5vw,4rem)] font-semibold leading-[1.02] tracking-tightest">
            AI builders lock you in. IDEs make you type.<br /><span className="font-serif italic text-accent">Nova does neither.</span>
          </h2>
          <p className="mt-6 text-[16px] leading-relaxed text-ink-2 sm:text-[18px]">
            Most tools force a trade: a prompt box that hides your code, or an editor with no canvas.
            Nova gives you the canvas, the code, the live app, and AI — over files that never stop being yours.
          </p>
        </div>
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {DIFF.map((d) => (
            <div key={d.title} className="tile bg-bg p-7">
              <div className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-accent">{d.icon}</div>
              <h3 className="mt-5 font-display text-[18px] font-semibold tracking-tight">{d.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{d.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="reveal mb-14 max-w-2xl">
          <p className="mb-4 flex items-center gap-2 text-[12px] uppercase tracking-[0.3em] text-ink-3"><Sparkles size={14} className="text-accent" /> How it works</p>
          <h2 className="font-display text-[clamp(2rem,5.5vw,4rem)] font-semibold leading-[1.02] tracking-tightest">
            From import to <span className="font-serif italic text-accent">pull request</span>, in your browser.
          </h2>
        </div>
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="tile bg-bg p-7">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-accent">{s.icon}</span>
                <span className="font-serif text-[26px] italic text-ink-3">{s.n}</span>
              </div>
              <h3 className="mt-5 font-display text-[20px] font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* product mock + features */}
      <section id="features" className="relative border-y border-line bg-surface/30">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
          <div className="reveal max-w-2xl">
            <h2 className="font-display text-[clamp(2rem,5.5vw,4rem)] font-semibold leading-[1.02] tracking-tightest">
              A real editor, <span className="font-serif italic text-accent">not a toy</span>.
            </h2>
            <p className="mt-6 text-[16px] leading-relaxed text-ink-2 sm:text-[18px]">
              Webflow-grade controls over live code. Layout, spacing, typography, color, effects —
              with a layer tree, breakpoints, preview, and a built-in code editor.
            </p>
          </div>

          <div className="reveal mt-14 overflow-hidden rounded-2xl border border-line-2 bg-bg shadow-2xl">
            <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" /><span className="h-3 w-3 rounded-full bg-[#febc2e]" /><span className="h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="ml-3 font-mono text-[12px] text-ink-3">nova · editor</span>
            </div>
            <div className="grid grid-cols-[1fr] sm:grid-cols-[180px_1fr_200px]">
              <div className="hidden flex-col gap-2 border-r border-line p-4 sm:flex">
                {["section", "  nav", "  hero", "    h1", "    p", "  footer"].map((l) => (
                  <div key={l} className="whitespace-pre font-mono text-[11px] text-ink-3">{l}</div>
                ))}
              </div>
              <div className="grid place-items-center bg-[radial-gradient(circle_at_50%_0%,rgba(204,255,2,0.06),transparent_60%)] p-8 sm:p-14">
                <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-8 text-center">
                  <div className="mx-auto mb-4 h-10 w-10 rounded-full bg-accent" />
                  <div className="mx-auto h-3 w-3/4 rounded bg-ink/80" /><div className="mx-auto mt-2 h-3 w-1/2 rounded bg-ink-3" />
                  <div className="mx-auto mt-5 h-8 w-28 rounded-full bg-accent" />
                </div>
              </div>
              <div className="hidden flex-col gap-3 border-l border-line p-4 sm:flex">
                {["Layout", "Spacing", "Typography", "Color"].map((l) => (
                  <div key={l}><div className="mb-1.5 text-[9px] uppercase tracking-wide text-ink-3">{l}</div><div className="h-6 rounded-md border border-line bg-bg" /></div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="tile bg-bg p-6">
                <div className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-accent">{f.icon}</div>
                <h3 className="mt-4 font-display text-[17px] font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* works with — bento */}
      <section id="works" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="reveal mb-12 max-w-2xl">
          <p className="mb-4 flex items-center gap-2 text-[12px] uppercase tracking-[0.3em] text-ink-3"><Boxes size={14} className="text-accent" /> Works with</p>
          <h2 className="font-display text-[clamp(2rem,5.5vw,4rem)] font-semibold leading-[1.02] tracking-tightest">
            Built for <span className="font-serif italic text-accent">real</span> codebases.
          </h2>
          <p className="mt-6 text-[16px] leading-relaxed text-ink-2 sm:text-[18px]">
            A marketing page, a component library, your docs, or a whole repo — Nova opens the code you already have. HTML · JSX · TSX · Tailwind.
          </p>
        </div>

        <div className="grid gap-4 sm:auto-rows-[200px] sm:grid-cols-2 lg:grid-cols-4">
          {/* landing pages — feature tile with a browser mockup */}
          <div className="tile group relative min-h-[180px] flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-accent/[0.06] to-bg p-6 sm:row-span-2 lg:col-span-2">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(204,255,2,0.1),transparent_55%)]" />
            <div className="relative overflow-hidden rounded-xl border border-line-2 bg-bg/80 shadow-2xl transition-transform duration-500 group-hover:-translate-y-1">
              <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-[#ff5f57]" /><span className="h-2 w-2 rounded-full bg-[#febc2e]" /><span className="h-2 w-2 rounded-full bg-[#28c840]" />
                <span className="ml-2 h-2.5 w-32 rounded bg-line" />
              </div>
              <div className="space-y-2.5 p-5">
                <div className="h-2 w-14 rounded-full bg-accent/70" />
                <div className="h-4 w-3/4 rounded bg-ink/70" />
                <div className="h-4 w-1/2 rounded bg-ink/40" />
                <div className="mt-3 h-7 w-24 rounded-full bg-accent" />
              </div>
            </div>
            <div className="relative mt-5">
              <span className="text-[11px] uppercase tracking-[0.2em] text-ink-3">Marketing</span>
              <div className="font-display text-[22px] font-semibold tracking-tight">Landing pages</div>
            </div>
          </div>

          {/* component libraries — swatches */}
          <div className="tile group relative min-h-[180px] flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-surface/40 p-6 lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex h-7 items-center rounded-full bg-accent px-3 text-[11px] font-semibold text-accent-ink">Button</span>
              <span className="h-7 w-24 rounded-md border border-line-2 bg-bg" />
              <span className="grid h-7 w-7 place-items-center rounded-md border border-line-2 text-ink-3"><Boxes size={13} /></span>
              <span className="flex h-6 w-11 items-center rounded-full bg-line px-0.5"><span className="ml-auto h-5 w-5 rounded-full bg-accent" /></span>
              <span className="h-7 w-16 rounded-md bg-raise" />
              <span className="h-7 w-20 rounded-lg border border-dashed border-line-2" />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-ink-3">JSX / TSX</span>
              <div className="font-display text-[20px] font-semibold tracking-tight">Component libraries</div>
            </div>
          </div>

          {/* docs — text lines */}
          <div className="tile group relative min-h-[180px] flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-surface/40 p-6">
            <div className="space-y-2">
              <div className="h-3 w-1/2 rounded bg-ink/60" />
              <div className="h-2 w-full rounded bg-line" />
              <div className="h-2 w-5/6 rounded bg-line" />
              <div className="h-2 w-2/3 rounded bg-line" />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-ink-3">Static HTML</span>
              <div className="font-display text-[20px] font-semibold tracking-tight">Docs &amp; content</div>
            </div>
          </div>

          {/* whole repositories — file tree */}
          <div className="tile group relative min-h-[180px] flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-surface/40 p-6">
            <div className="space-y-1.5 font-mono text-[11px] text-ink-3">
              <div className="flex items-center gap-1.5 text-ink-2"><GitBranch size={11} className="text-accent" /> main</div>
              <div className="pl-3">src/</div>
              <div className="pl-6 text-ink-2">App.tsx</div>
              <div className="pl-6">styles.css</div>
              <div className="pl-3">package.json</div>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-ink-3">GitHub</span>
              <div className="font-display text-[20px] font-semibold tracking-tight">Whole repositories</div>
            </div>
          </div>
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="border-y border-line bg-surface/30">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
          <div className="reveal mb-14 max-w-2xl">
            <p className="mb-4 flex items-center gap-2 text-[12px] uppercase tracking-[0.3em] text-ink-3"><Sparkles size={14} className="text-accent" /> Pricing</p>
            <h2 className="font-display text-[clamp(2rem,5.5vw,4rem)] font-semibold leading-[1.02] tracking-tightest">
              Free to build. <span className="font-serif italic text-accent">Pay only to sync.</span>
            </h2>
            <p className="mt-6 text-[16px] leading-relaxed text-ink-2 sm:text-[18px]">
              The editor is free forever — your code, your keys, your machine. Upgrade when you want your projects backed up and synced across every device.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {PRICING.map((p) => (
              <div
                key={p.name}
                className={`tile relative flex flex-col rounded-2xl border p-7 ${
                  p.highlight ? "border-accent/50 bg-accent/[0.05]" : "border-line bg-bg"
                } ${p.soon ? "opacity-60" : ""}`}
              >
                {p.highlight && <span className="absolute right-6 top-7 rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent-ink">Recommended</span>}
                {p.soon && <span className="absolute right-6 top-7 rounded-full border border-line-2 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-ink-3">Coming soon</span>}
                <h3 className="font-display text-[20px] font-semibold tracking-tight">{p.name}</h3>
                <p className="mt-1 max-w-[220px] text-[13px] leading-relaxed text-ink-3">{p.tagline}</p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="font-display text-[40px] font-semibold tracking-tightest">{p.price}</span>
                  {p.period && <span className="text-[14px] text-ink-3">{p.period}</span>}
                </div>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-ink-2">
                      <Check size={15} className={`mt-0.5 shrink-0 ${p.highlight ? "text-accent" : "text-ink-3"}`} /> {f}
                    </li>
                  ))}
                </ul>
                {p.soon ? (
                  <button disabled className="mt-7 w-full cursor-not-allowed rounded-full border border-line py-3 text-[14px] font-semibold text-ink-3">Coming soon</button>
                ) : (
                  <button
                    onClick={() => navigate("/dashboard")}
                    className={`mt-7 w-full rounded-full py-3 text-[14px] font-semibold transition-transform hover:scale-[1.02] ${
                      p.highlight ? "bg-accent text-accent-ink" : "bg-ink text-bg hover:bg-white"
                    }`}
                  >
                    {p.cta}
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="reveal mt-6 text-[12.5px] text-ink-3">Prices in USD · cancel anytime. Cloud sync is the only paid feature today — the editor itself stays free.</p>
        </div>
      </section>

      {/* open source */}
      <section id="open-source" className="mx-auto max-w-7xl px-5 py-24 text-center sm:px-8 sm:py-32">
        <p className="reveal mb-5 flex items-center justify-center gap-2 text-[12px] uppercase tracking-[0.3em] text-ink-3">
          <Github size={14} className="text-accent" /> Open source
        </p>
        <h2 className="reveal mx-auto max-w-3xl font-display text-[clamp(2rem,6vw,4.5rem)] font-semibold leading-[1.0] tracking-tightest">
          If you don't like something, <span className="font-serif italic text-accent">fork it.</span>
        </h2>
        <p className="reveal mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-ink-2 sm:text-[18px]">
          Nova is as open as they come — built to be modified, themed, and forked. The editor, the canvas, the AI bridge: it's all here, and it stays yours. Go nuts; that's the whole point.
        </p>

        <div className="reveal mt-14 grid gap-4 text-left lg:grid-cols-5 lg:items-stretch">
          {/* terminal */}
          <div className="overflow-hidden rounded-2xl border border-line-2 bg-bg shadow-2xl lg:col-span-3">
            <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" /><span className="h-3 w-3 rounded-full bg-[#febc2e]" /><span className="h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="ml-3 font-mono text-[12px] text-ink-3">~/nova</span>
            </div>
            <div className="space-y-2 p-5 font-mono text-[12.5px] leading-relaxed sm:p-6 sm:text-[13px]">
              <div><span className="text-accent">$</span> <span className="text-ink">gh repo fork KyngKai909/nova-editor --clone</span></div>
              <div className="text-ink-3"><span className="text-[#28c840]">✓</span> Cloned nova-editor into ./nova-editor</div>
              <div><span className="text-accent">$</span> <span className="text-ink">cd nova-editor &amp;&amp; npm install</span></div>
              <div className="text-ink-3"><span className="text-[#28c840]">✓</span> Packages installed in 6.1s</div>
              <div><span className="text-accent">$</span> <span className="text-ink">npm run dev</span></div>
              <div className="text-ink-3"><span className="text-accent">▲</span> Nova ready → <span className="text-accent">http://localhost:3000</span></div>
              <div><span className="text-accent">$</span> <span className="ml-1 inline-block h-[14px] w-[7px] translate-y-[2px] animate-pulse bg-ink-2" /></div>
            </div>
          </div>

          {/* facts */}
          <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-rows-2">
            {OSS_FACTS.map((c) => (
              <div key={c.title} className="rounded-2xl border border-line bg-surface/40 p-5">
                <div className="font-display text-[22px] font-semibold tracking-tight">{c.title}</div>
                <div className="mt-1.5 text-[10.5px] uppercase tracking-wide leading-relaxed text-ink-3">{c.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* actions */}
        <div className="reveal mt-10 flex flex-wrap items-center justify-center gap-3">
          <a href={REPO} target="_blank" rel="noreferrer" className="group flex items-center gap-2 rounded-full border border-line-2 px-5 py-3 text-[14px] font-medium text-ink transition-colors hover:bg-surface">
            <Star size={15} className="text-accent" /> Star on GitHub <ArrowUpRight size={14} className="text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
          <a href={`${REPO}/fork`} target="_blank" rel="noreferrer" className="group flex items-center gap-2 rounded-full border border-line-2 px-5 py-3 text-[14px] font-medium text-ink transition-colors hover:bg-surface">
            <GitFork size={15} className="text-accent" /> Fork the repo <ArrowUpRight size={14} className="text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
          <Link href="/docs" onClick={(e) => { e.preventDefault(); navigate("/docs"); }} className="group flex items-center gap-2 rounded-full border border-line-2 px-5 py-3 text-[14px] font-medium text-ink transition-colors hover:bg-surface">
            <BookOpen size={15} className="text-accent" /> Read the docs <ArrowUpRight size={14} className="text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="relative mx-auto max-w-7xl px-5 py-28 text-center sm:px-8 sm:py-40">
        <p className="reveal mb-6 text-[13px] uppercase tracking-[0.3em] text-ink-3">Free to start · invite-only alpha</p>
        <h2 className="reveal mx-auto max-w-4xl font-display text-[clamp(2.4rem,8vw,6rem)] font-semibold leading-[0.95] tracking-tightest">
          Turn any site into a <span className="font-serif italic text-accent">canvas</span>.
        </h2>
        <div className="reveal mt-10">
          <Link href="/dashboard" onClick={(e) => { e.preventDefault(); navigate("/dashboard"); }} className="group inline-flex items-center gap-2.5 rounded-full bg-accent px-8 py-4 text-[16px] font-semibold text-accent-ink transition-transform hover:scale-[1.03]">
            Start building free
            <ArrowUpRight size={18} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 text-[13px] text-ink-3 sm:flex-row sm:px-8">
          <span className="flex items-center gap-2 font-display font-semibold text-ink">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-accent-ink">✦</span> Nova
            <AlphaPill />
          </span>
          <div className="flex items-center gap-5">
            <Link href="/docs" onClick={(e) => { e.preventDefault(); navigate("/docs"); }} className="transition-colors hover:text-ink">Docs</Link>
            <Link href="/dashboard" onClick={(e) => { e.preventDefault(); navigate("/dashboard"); }} className="transition-colors hover:text-ink">Dashboard</Link>
            <a href={REPO} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 transition-colors hover:text-ink"><Github size={14} /> GitHub</a>
            <span>© 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
