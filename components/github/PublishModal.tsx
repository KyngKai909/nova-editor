"use client";

import { useState } from "react";
import { X, Loader2, Check, Lock, Globe, GitBranch } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useGitHub } from "@/store/githubStore";
import { useProjects } from "@/store/projectsStore";
import { createRepo, commitFiles } from "@/lib/githubApi";

// Create a new GitHub repo from the current project and push its files to it.
export default function PublishModal({ onClose }: { onClose: () => void }) {
  const token = useGitHub((s) => s.token)!;
  const user = useGitHub((s) => s.user)!;
  const files = useEditor((s) => s.files);
  const projectId = useEditor((s) => s.projectId);
  const markCommitted = useEditor((s) => s.markCommitted);
  const setNotice = useEditor((s) => s.setNotice);
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  const updateProject = useProjects((s) => s.updateProject);

  const [name, setName] = useState((project?.name || "nova-project").replace(/[^a-zA-Z0-9-_]/g, "-"));
  const [isPrivate, setIsPrivate] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const publish = async () => {
    setBusy("Creating repository…");
    setError(null);
    try {
      const repo = await createRepo(token, { name: name.trim(), isPrivate });
      setBusy("Pushing files…");
      await commitFiles(
        token,
        repo.owner,
        repo.name,
        repo.defaultBranch,
        files.map((f) => ({ path: f.path, content: f.content })),
        "Initial commit via Nova"
      );
      markCommitted();
      if (projectId)
        updateProject(projectId, {
          github: { owner: repo.owner, repo: repo.name, branch: repo.defaultBranch },
          repoUrl: `https://github.com/${repo.fullName}`,
          status: { published: false, github: true },
        });
      setDone(true);
      setNotice(`Published to ${repo.fullName}`);
      setTimeout(onClose, 1000);
    } catch (e: any) {
      setError(e.message);
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line-2 bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <GitBranch size={16} className="text-accent" /> Publish to GitHub
          </h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 hover:bg-raise hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="text-[11px] text-ink-3">New repository name</label>
            <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-line bg-bg px-3">
              <span className="text-[13px] text-ink-3">{user.login} /</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.replace(/\s+/g, "-"))}
                className="h-10 flex-1 bg-transparent font-mono text-[13px] outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { v: true, icon: <Lock size={14} />, label: "Private" },
              { v: false, icon: <Globe size={14} />, label: "Public" },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => setIsPrivate(o.v)}
                className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 text-[13px] transition-colors ${
                  isPrivate === o.v ? "border-accent/50 bg-accent/10 text-ink" : "border-line text-ink-3 hover:text-ink"
                }`}
              >
                {o.icon} {o.label}
              </button>
            ))}
          </div>

          {error && <p className="text-[12px] text-red-400">{error}</p>}

          <button
            onClick={publish}
            disabled={!!busy || done || !name.trim()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[14px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : done ? <Check size={16} /> : null}
            {busy || (done ? "Published!" : `Create ${isPrivate ? "private" : "public"} repo & push`)}
          </button>
        </div>
      </div>
    </div>
  );
}
