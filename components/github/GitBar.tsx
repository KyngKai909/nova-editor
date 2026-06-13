"use client";

import { useEffect, useRef, useState } from "react";
import { GitBranch, ChevronDown, Plus, Loader2 } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useGitHub } from "@/store/githubStore";
import { useProjects } from "@/store/projectsStore";
import { listBranches, createBranch, importRepoFilesAuth } from "@/lib/githubApi";

// Branch picker for connected GitHub projects (switch / create). Committing,
// pushing and PRs live in the Publish panel.
export default function GitBar() {
  const token = useGitHub((s) => s.token);
  const projectId = useEditor((s) => s.projectId);
  const changed = useEditor((s) => s.files.filter((f) => f.content !== f.original).length);
  const loadFiles = useEditor((s) => s.loadFiles);
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  const updateProject = useProjects((s) => s.updateProject);

  const [menu, setMenu] = useState(false);
  const [branches, setBranches] = useState<string[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const gh = project?.github;

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

  const baseHrefFor = (branch: string) =>
    project?.baseHref && project.baseHref.includes("jsdelivr")
      ? `https://cdn.jsdelivr.net/gh/${gh.owner}/${gh.repo}@${branch}/`
      : project?.baseHref ?? null;

  const switchBranch = async (branch: string) => {
    if (branch === gh.branch) return setMenu(false);
    if (changed && !confirm("Switching branches discards unsaved edits. Continue?")) return;
    setBusy(true);
    try {
      const f = await importRepoFilesAuth(token, gh.owner, gh.repo, branch);
      const base = baseHrefFor(branch);
      updateProject(project!.id, { github: { ...gh, branch }, baseHref: base, files: undefined });
      loadFiles(f, {}, base, project!.id);
    } catch (e: any) {
      alert(e.message);
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
      alert(e.message);
    } finally { setBusy(false); setMenu(false); }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={openMenu}
        title={`${gh.owner}/${gh.repo}`}
        className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2 text-[12px] text-ink-2 transition-colors hover:bg-raise hover:text-ink"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <GitBranch size={13} />}
        <span className="max-w-[90px] truncate">{gh.branch}</span>
        <ChevronDown size={12} className="text-ink-3" />
      </button>

      {menu && (
        <div className="absolute left-0 top-9 z-40 w-56 overflow-hidden rounded-lg border border-line-2 bg-surface py-1 shadow-2xl">
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
  );
}
