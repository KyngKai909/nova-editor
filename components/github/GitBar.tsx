"use client";

import { useEffect, useRef, useState } from "react";
import { GitBranch, ChevronDown, Plus, Loader2, ArrowDownToLine, GitMerge } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useProjects } from "@/store/projectsStore";
import { listBranches, createBranch, importRepoFilesAuth } from "@/lib/githubApi";
import { useConflicts } from "@/store/conflictsStore";
import { useGitSync } from "./useGitSync";
import { confirmDialog, alertDialog } from "@/store/dialogStore";

// Branch picker + GitHub "Pull & merge" for connected projects. Sync state and
// the pull come from useGitSync (shared with the status footer). Committing,
// pushing and PRs live in the Publish panel.
export default function GitBar() {
  const { token, project, gh, changed, canPull, behind, busy, pull, setBehind, setBusy, baseHrefFor } = useGitSync();
  const loadFiles = useEditor((s) => s.loadFiles);
  const projectId = useEditor((s) => s.projectId);
  const updateProject = useProjects((s) => s.updateProject);
  const setConflictsOpen = useConflicts((s) => s.setOpen);
  const openConflicts = useConflicts((s) => (projectId ? (s.byProject[projectId] || []).length : 0));

  const [menu, setMenu] = useState(false);
  const [branches, setBranches] = useState<string[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (!gh || !token) return null; // only for connected, repo-linked projects

  const openMenu = async () => {
    setMenu((m) => !m);
    if (!branches) {
      try { setBranches(await listBranches(token, gh.owner, gh.repo)); } catch { setBranches([]); }
    }
  };

  const switchBranch = async (branch: string) => {
    if (branch === gh.branch) return setMenu(false);
    if (changed && !(await confirmDialog({ title: "Switch branch?", message: "Switching branches discards unsaved edits. Continue?", confirmLabel: "Switch", tone: "danger" }))) return;
    setBusy(true);
    try {
      const { files: f, assets, commitSha } = await importRepoFilesAuth(token, gh.owner, gh.repo, branch);
      const base = baseHrefFor(branch);
      updateProject(project!.id, { github: { ...gh, branch, commitSha }, baseHref: base, files: undefined });
      loadFiles(f, assets, base, project!.id);
      setBehind(false);
    } catch (e: any) {
      alertDialog({ title: "GitHub", message: e.message, tone: "danger" });
    } finally { setBusy(false); setMenu(false); }
  };

  const doCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await createBranch(token, gh.owner, gh.repo, gh.branch, newName.trim());
      updateProject(project!.id, { github: { ...gh, branch: newName.trim() } });
      setBranches((b) => [...(b || []), newName.trim()]);
      setCreating(false);
      setNewName("");
    } catch (e: any) {
      alertDialog({ title: "GitHub", message: e.message, tone: "danger" });
    } finally { setBusy(false); setMenu(false); }
  };

  return (
    <div className="flex items-center gap-1.5">
      {openConflicts > 0 && (
        <button
          onClick={() => setConflictsOpen(true)}
          title="Resolve merge conflicts from the last pull"
          className="flex h-7 items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 text-[12px] font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
        >
          <GitMerge size={13} /> {openConflicts} conflict{openConflicts === 1 ? "" : "s"}
        </button>
      )}
      <div ref={ref} className="relative">
      <button
        onClick={openMenu}
        title={`${gh.owner}/${gh.repo}${behind ? " · updates available" : ""}`}
        className="relative flex h-7 items-center gap-1.5 rounded-md border border-line px-2 text-[12px] text-ink-2 transition-colors hover:bg-raise hover:text-ink"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <GitBranch size={13} />}
        <span className="max-w-[90px] truncate">{gh.branch}</span>
        {behind && !busy && <span className="h-1.5 w-1.5 rounded-full bg-accent" title="Updates available" />}
        <ChevronDown size={12} className="text-ink-3" />
      </button>

      {menu && (
        <div className="absolute left-0 top-9 z-40 w-60 overflow-hidden rounded-lg border border-line-2 bg-surface py-1 shadow-2xl">
          {canPull && (
            <>
              <button
                onClick={() => { setMenu(false); pull(); }}
                disabled={busy}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-ink-2 transition-colors hover:bg-raise disabled:opacity-50"
              >
                <ArrowDownToLine size={13} className={behind ? "text-accent" : "text-ink-3"} />
                <span className="flex-1">Pull &amp; merge {gh.branch}</span>
                {behind && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">new</span>}
              </button>
              <div className="my-1 h-px bg-line" />
            </>
          )}
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-ink-3">Branches</div>
          <div className="scroll-thin max-h-48 overflow-y-auto">
            {!branches && <div className="px-3 py-2 text-[12px] text-ink-3">Loading…</div>}
            {branches?.map((b) => (
              <button key={b} onClick={() => switchBranch(b)} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-raise ${b === gh.branch ? "text-accent" : "text-ink-2"}`}>
                <GitBranch size={12} /> <span className="truncate">{b}</span>
              </button>
            ))}
          </div>
          <div className="my-1 h-px bg-line" />
          {creating ? (
            <div className="flex items-center gap-1 px-2 py-1">
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value.replace(/\s+/g, "-"))} onKeyDown={(e) => e.key === "Enter" && doCreate()} placeholder="new-branch" className="h-7 flex-1 rounded border border-line bg-bg px-2 font-mono text-[11px] outline-none focus:border-accent/60" />
              <button onClick={doCreate} className="grid h-7 w-7 place-items-center rounded bg-accent text-accent-ink"><Plus size={13} /></button>
            </div>
          ) : (
            <button onClick={() => setCreating(true)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-ink-2 transition-colors hover:bg-raise">
              <Plus size={12} /> New branch from {gh.branch}
            </button>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
