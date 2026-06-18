"use client";

import { useEffect, useState } from "react";
import { useEditor } from "@/store/editorStore";
import { useGitHub } from "@/store/githubStore";
import { useProjects } from "@/store/projectsStore";
import { importRepoFilesAuth, getBranchHeadSha } from "@/lib/githubApi";
import { mergeThreeWay } from "@/lib/merge";
import { diff3Strings, conflictCount, buildResolved } from "@/lib/diff3";
import { useConflicts, type FileConflict } from "@/store/conflictsStore";
import { saveProjectToDevice } from "@/lib/deviceProject";

// Shared GitHub sync state + the "Pull & merge" action, used by both the GitBar
// (branch menu) and the status footer (at-a-glance sync). Owns the cheap
// upstream-update probe (behind) and the 3-way merge pull.
export function useGitSync() {
  const token = useGitHub((s) => s.token);
  const projectId = useEditor((s) => s.projectId);
  const changed = useEditor((s) => s.files.filter((f) => f.content !== f.original).length);
  const loadFiles = useEditor((s) => s.loadFiles);
  const setNotice = useEditor((s) => s.setNotice);
  const project = useProjects((s) => s.projects.find((p) => p.id === projectId));
  const updateProject = useProjects((s) => s.updateProject);
  const setConflicts = useConflicts((s) => s.setConflicts);

  const [behind, setBehind] = useState(false); // remote HEAD moved since our baseline
  const [busy, setBusy] = useState(false);

  const gh = project?.github;
  // Pull applies to any GitHub-connected project. Device-backed projects keep a
  // Nova-copied folder on disk, so the pull also writes the merged files there
  // (it never pushes). Browser-backed projects just update the in-memory copy.
  const canPull = !!gh && !!token;

  useEffect(() => {
    let alive = true;
    if (!canPull || !gh?.commitSha) { setBehind(false); return; }
    getBranchHeadSha(token!, gh.owner, gh.repo, gh.branch)
      .then((head) => { if (alive) setBehind(head !== gh.commitSha); })
      .catch(() => {});
    return () => { alive = false; };
  }, [canPull, token, gh?.owner, gh?.repo, gh?.branch, gh?.commitSha]);

  const baseHrefFor = (branch: string) =>
    project?.baseHref && project.baseHref.includes("jsdelivr")
      ? `https://cdn.jsdelivr.net/gh/${gh!.owner}/${gh!.repo}@${branch}/`
      : project?.baseHref ?? null;

  // Pull the branch HEAD and 3-way merge it with the current working copy:
  // remote-only changes fast-forward, your edits stay, files changed on both
  // sides get a line-level (diff3) merge — clean ones auto-resolve, the rest
  // open the conflict resolver.
  const pull = async () => {
    if (!canPull || !project || !gh) return;
    setBusy(true);
    try {
      const { files: remote, assets, commitSha } = await importRepoFilesAuth(token!, gh.owner, gh.repo, gh.branch);
      const local = useEditor.getState().files;
      const result = mergeThreeWay(local, remote);
      const remoteByPath = new Map(remote.map((f) => [f.path, f]));

      const trueConflicts: FileConflict[] = [];
      const autoMergedPaths: string[] = [];
      const finalFiles = result.files.map((f) => {
        if (!result.conflicts.includes(f.path)) return f;
        const L = local.find((x) => x.path === f.path);
        const R = remoteByPath.get(f.path);
        const baseTxt = L?.original ?? "";
        const mine = L?.content ?? "";
        if (!R) {
          trueConflicts.push({ path: f.path, base: baseTxt, mine, theirs: "", deleted: true });
          return f;
        }
        const regions = diff3Strings(mine, baseTxt, R.content);
        if (conflictCount(regions) === 0) { autoMergedPaths.push(f.path); return { ...f, content: buildResolved(regions, []) }; }
        trueConflicts.push({ path: f.path, base: baseTxt, mine, theirs: R.content });
        return f;
      });
      const autoMerged = autoMergedPaths.length;

      const baseHref = baseHrefFor(gh.branch);
      loadFiles(finalFiles, assets, baseHref, project.id);
      updateProject(project.id, { github: { ...gh, commitSha }, baseHref, files: finalFiles });
      setConflicts(project.id, trueConflicts);
      setBehind(false);

      // Device-backed projects keep a real copy on disk — write the pulled,
      // added & auto-merged files there too so the folder matches the new state.
      // (Local-only edits are already on disk via auto-save; conflicts land after
      // they're resolved. This never pushes.)
      if (project.storage === "device") {
        const changed = new Set([...result.pulled, ...result.added, ...autoMergedPaths]);
        const toWrite = finalFiles
          .filter((f) => changed.has(f.path))
          .map((f) => ({ path: f.path, content: f.content }));
        if (toWrite.length) await saveProjectToDevice(project.id, toWrite);
      }

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

  return { token, project, gh, changed, canPull, storage: project?.storage, behind, busy, pull, setBehind, setBusy, baseHrefFor };
}
