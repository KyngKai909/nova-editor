"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Loader2, FolderOpen, Settings as SettingsIcon } from "lucide-react";
import { useProjects, type ProjectRecord } from "@/store/projectsStore";
import { useEditor } from "@/store/editorStore";
import { importGithub } from "@/lib/importFlow";
import { useGitHub } from "@/store/githubStore";
import { importRepoFilesAuth } from "@/lib/githubApi";
import { reopenFolder } from "@/lib/deviceProject";
import ProjectCard from "./ProjectCard";
import NewProjectModal from "./NewProjectModal";
import AccountChip from "@/components/github/AccountChip";
import AlphaPill from "@/components/AlphaPill";

export default function Dashboard() {
  const router = useRouter();
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
      router.push("/editor");
    } catch (e) {
      setOpening(null);
      alert((e as Error).message);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-bg">
      <div className="grain" />

      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2 font-display text-[16px] font-semibold tracking-tight">
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

        {!projects.length && (
          <div className="mt-12 flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface/40 py-16 text-center">
            <FolderOpen size={28} className="text-ink-3" />
            <p className="max-w-xs text-[13px] leading-relaxed text-ink-3">
              Import a folder, pull a public GitHub repo, or paste a component to get started.
            </p>
          </div>
        )}
      </main>

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
