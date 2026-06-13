"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Loader2, Settings as SettingsIcon, GitBranch, FolderUp, Play, ArrowRight, BookOpen } from "lucide-react";
import { useRouteTransition } from "@/components/transition/RouteTransition";
import { useProjects, type ProjectRecord } from "@/store/projectsStore";
import { useEditor } from "@/store/editorStore";
import { importGithub } from "@/lib/importFlow";
import { useGitHub } from "@/store/githubStore";
import { importRepoFilesAuth } from "@/lib/githubApi";
import { reopenFolder } from "@/lib/deviceProject";
import { toSourceFiles } from "@/lib/importUtils";
import ProjectCard from "./ProjectCard";
import NewProjectModal from "./NewProjectModal";
import AccountChip from "@/components/github/AccountChip";
import AlphaPill from "@/components/AlphaPill";

export default function Dashboard() {
  const { navigate } = useRouteTransition();
  const projects = useProjects((s) => s.projects);
  const removeProject = useProjects((s) => s.removeProject);
  const addProject = useProjects((s) => s.addProject);
  const updateProject = useProjects((s) => s.updateProject);
  const loadFiles = useEditor((s) => s.loadFiles);
  const token = useGitHub((s) => s.token);
  const [showNew, setShowNew] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const openProject = async (p: ProjectRecord) => {
    setOpening(p.id);
    try {
      // a saved working copy (autosaved edits) takes priority over re-fetching
      if (p.files?.length) {
        loadFiles(p.files, {}, p.baseHref ?? null, p.id);
      } else if (p.storage === "device") {
        const { files, assets } = await reopenFolder(p.id);
        loadFiles(files, assets, null, p.id);
      } else if (p.github && token) {
        const files = await importRepoFilesAuth(token, p.github.owner, p.github.repo, p.github.branch);
        loadFiles(files, {}, p.baseHref ?? null, p.id);
      } else if (p.repoUrl) {
        const res = await importGithub(p.repoUrl);
        loadFiles(res.files, res.assets, res.baseHref, p.id);
      } else {
        throw new Error("Connect GitHub to reopen this repo project.");
      }
      navigate("/editor");
    } catch (e) {
      setOpening(null);
      alert((e as Error).message);
    }
  };

  const tryDemo = async () => {
    try {
      const content = await (await fetch("/samples/landing.html")).text();
      const files = toSourceFiles([{ path: "landing.html", content }]);
      const rec = addProject({ name: "Sample landing", kind: "sample", files, status: { published: false, github: false } });
      loadFiles(files, {}, null, rec.id);
      navigate("/editor");
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-bg">
      <div className="grain" />

      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="flex items-center gap-2 font-display text-[16px] font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-ink">✦</span>
            Nova
            <AlphaPill />
          </Link>
          <div className="flex items-center gap-2.5">
            <AccountChip />
            <Link
              href="/docs"
              className="hidden rounded-full border border-line px-3.5 py-2 text-[13px] text-ink-2 transition-colors hover:border-line-2 hover:text-ink sm:block"
            >
              Docs
            </Link>
            <Link
              href="/settings"
              title="Settings"
              className="grid h-9 w-9 place-items-center rounded-full border border-line text-ink-3 transition-colors hover:border-line-2 hover:text-ink"
            >
              <SettingsIcon size={16} />
            </Link>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition-transform hover:scale-[1.02]"
            >
              <Plus size={16} /> New project
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="font-display text-[28px] font-semibold tracking-tight">Projects</h1>
            <p className="mt-1 text-[13px] text-ink-3">
              {projects.length
                ? `${projects.length} project${projects.length === 1 ? "" : "s"} · stored in your browser`
                : "No projects yet — create your first one."}
            </p>
          </div>
        </div>

        {projects.length === 0 ? (
          <Onboarding onNew={() => setShowNew(true)} onDemo={tryDemo} />
        ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* new project tile */}
          <button
            onClick={() => setShowNew(true)}
            className="group flex h-full min-h-[252px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line-2 text-ink-3 transition-colors hover:border-accent/50 hover:bg-accent/[0.03] hover:text-accent"
          >
            <div className="grid h-12 w-12 place-items-center rounded-xl border border-line bg-surface transition-colors group-hover:border-accent/40">
              <Plus size={20} />
            </div>
            <span className="text-[13px] font-medium">New project</span>
          </button>

          {projects.map((p) => (
            <div key={p.id} className="relative h-full">
              {opening === p.id && (
                <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-bg/70 backdrop-blur-sm">
                  <Loader2 size={20} className="animate-spin text-accent" />
                </div>
              )}
              <ProjectCard
                project={p}
                onOpen={() => openProject(p)}
                onDelete={() => removeProject(p.id)}
                onTogglePublish={() => updateProject(p.id, { status: { ...p.status, published: !p.status.published } })}
                onDuplicate={() =>
                  addProject({
                    name: `${p.name} copy`,
                    kind: p.kind,
                    files: p.files,
                    baseHref: p.baseHref,
                    repoUrl: p.repoUrl,
                    status: { ...p.status, published: false },
                  })
                }
              />
            </div>
          ))}
        </div>
        )}
      </main>

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

// First-run onboarding shown when the user has no projects yet.
function Onboarding({ onNew, onDemo }: { onNew: () => void; onDemo: () => void }) {
  const cards = [
    { icon: <GitBranch size={18} />, title: "Import a GitHub repo", body: "Paste a public repo URL — or connect to import private repos.", onClick: onNew, cta: "New project" },
    { icon: <FolderUp size={18} />, title: "Open a folder", body: "Edit a local project on disk (Chrome, Edge, or Arc).", onClick: onNew, cta: "Choose source" },
    { icon: <Play size={18} />, title: "Try the sample", body: "Jump straight into the editor with a demo page.", onClick: onDemo, cta: "Open sample" },
  ];
  return (
    <div className="rounded-2xl border border-line bg-surface/40 px-6 py-12 sm:px-10 sm:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-3 text-[12px] uppercase tracking-[0.25em] text-ink-3">Get started</p>
        <h2 className="font-display text-[clamp(1.6rem,4vw,2.4rem)] font-semibold tracking-tightest">Open your first project</h2>
        <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-ink-2">
          Nova turns a repo, folder, or pasted component into an editable canvas — tweak it visually, then push clean code back. Pick a way in:
        </p>
      </div>
      <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <button key={c.title} onClick={c.onClick} className="group flex flex-col items-start gap-2 rounded-xl border border-line bg-bg p-5 text-left transition-colors hover:border-accent/50 hover:bg-accent/[0.03]">
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-accent transition-colors group-hover:border-accent/40">{c.icon}</span>
            <span className="mt-1 font-display text-[15px] font-semibold tracking-tight">{c.title}</span>
            <span className="text-[12.5px] leading-relaxed text-ink-3">{c.body}</span>
            <span className="mt-1 flex items-center gap-1 text-[12px] font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">{c.cta} <ArrowRight size={13} /></span>
          </button>
        ))}
      </div>
      <div className="mt-8 text-center">
        <Link href="/docs" className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink">
          <BookOpen size={14} /> New to Nova? Read the 2-minute guide <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}
