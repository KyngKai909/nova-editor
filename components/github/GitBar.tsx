"use client";

import { useEffect, useRef, useState } from "react";
import { GitBranch, ChevronDown, Plus, Loader2, ArrowDownToLine, GitMerge } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useGitHub } from "@/store/githubStore";
import { useProjects } from "@/store/projectsStore";
import { listBranches, createBranch, importRepoFilesAuth, getBranchHeadSha } from "@/lib/githubApi";
import { mergeThreeWay } from "@/lib/merge";
import { diff3Strings, conflictCount, buildResolved } from "@/lib/diff3";
import { useConflicts, type FileConflict } from "@/store/conflictsStore";

// Branch picker + GitHub "Pull & merge" for connected projects. Committing,
// pushing and PRs live in the Publish panel.
export default function GitBar() {
  const token = useGitHub((s) => s.token);
  const projectId = useEditor((s) => s.projectId);
  const changed = useEditor((s) => s.files.filter((f) => f.content !== f.original).length);
  const loadFiles = useEditor((s) => s.loadFiles);
  const setNotice = useEditor((s) => s.setNotice);
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  const updateProject = useProjects((s) => s.updateProject);
  const setConflicts = useConflicts((s) => s.setConflicts);
  const setConflictsOpen = useConflicts((s) => s.setOpen);
  const openConflicts = useConflicts((s) => (projectId ? (s.byProject[projectId] || []).length : 0));

  const [menu, setMenu] = useState(false);
  const [branches, setBranches] = useState<string[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [behind, setBehind] = useState(false); // remote HEAD moved since our baseline
  const ref = useRef<HTMLDivElement>(null);

  const gh = project?.github;
  // Nova-managed pull is for in-browser github projects; device-backed clones
  // sync through the real folder on disk (the user's own git), so skip them.
  const canPull = !!gh && !!token && project?.storage !== "device";

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Cheap upstream-update probe: compare the branch HEAD to our stored baseline.
  useEffect(() => {
    let alive = true;
    if (!canPull || !gh?.commitSha) { setBehind(false); return; }
    getBranchHeadSha(token!, gh.owner, gh.repo, gh.branch)
      .then((head) => { if (alive) setBehind(head !== gh.commitSha); })
      .catch(() => {});
    return () => { alive = false; };
  }, [canPull, token, gh?.owner, gh?.repo, gh?.branch, gh?.commitSha]);

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

  // Pull the branch HEAD and 3-way merge it with the current working copy:
  // remote-only changes fast-forward, your edits stay, and files changed on both
  // sides get a line-level (diff3) merge — cleanly-mergeable ones auto-resolve,
  // the rest open the conflict resolver.
  const pull = async () => {
    if (!canPull || !project) return;
    setBusy(true);
    setMenu(false);
    try {
      const { files: remote, assets, commitSha } = await importRepoFilesAuth(token, gh.owner, gh.repo, gh.branch);
      const local = useEditor.getState().files;
      const result = mergeThreeWay(local, remote);
      const remoteByPath = new Map(remote.map((f) => [f.path, f]));

      const trueConflicts: FileConflict[] = [];
      let autoMerged = 0;
      const finalFiles = result.files.map((f) => {
        if (!result.conflicts.includes(f.path)) return f;
        const L = local.find((x) => x.path === f.path);
        const R = remoteByPath.get(f.path);
        const baseTxt = L?.original ?? "";
        const mine = L?.content ?? "";
        if (!R) {
          // edited locally + deleted upstream → file-level conflict
          trueConflicts.push({ path: f.path, base: baseTxt, mine, theirs: "", deleted: true });
          return f;
        }
        const regions = diff3Strings(mine, baseTxt, R.content);
        if (conflictCount(regions) === 0) {
          autoMerged++;
          return { ...f, content: buildResolved(regions, []) }; // clean line-merge
        }
        trueConflicts.push({ path: f.path, base: baseTxt, mine, theirs: R.content });
        return f;
      });

      const baseHref = baseHrefFor(gh.branch);
      loadFiles(finalFiles, assets, baseHref, project.id);
      updateProject(project.id, { github: { ...gh, commitSha }, baseHref, files: finalFiles });
      setConflicts(project.id, trueConflicts); // opens the resolver when non-empty
      setBehind(false);

      const bits: string[] = [];
      if (result.pulled.length) bits.push(`${result.pulled.length} updated`);
      if (result.added.length) bits.push(`${result.added.length} added`);
      if (result.removed.length) bits.push(`${result.removed.length} removed`);
      if (autoMerged) bits.push(`${autoMerged} auto-merged`);
      if (result.kept.length) bits.push(`${result.kept.length} kept`);
      const summary = bits.join(" · ") || "already up to date";
      setNotice(
        trueConflicts.length
          ? `Pulled — ${trueConflicts.length} file${trueConflicts.length === 1 ? "" : "s"} need resolving${summary !== "already up to date" ? ` · ${summary}` : ""}`
          : `Pulled ${gh.branch} · ${summary}`
      );
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const switchBranch = async (branch: string) => {
    if (branch === gh.branch) return setMenu(false);
    if (changed && !confirm("Switching branches discards unsaved edits. Continue?")) return;
    setBusy(true);
    try {
      const { files: f, assets, commitSha } = await importRepoFilesAuth(token, gh.owner, gh.repo, branch);
      const base = baseHrefFor(branch);
      updateProject(project!.id, { github: { ...gh, branch, commitSha }, baseHref: base, files: undefined });
      loadFiles(f, assets, base, project!.id);
      setBehind(false);
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
                onClick={pull}
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
