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
import { useRunner } from "@/store/runnerStore";
import { alertDialog } from "@/store/dialogStore";
import { probeRunner, gitClone, gitStatus, gitPull, gitChanged, gitTree, gitRead } from "@/lib/localRunner";
import { fileKind, classifyFile } from "@/lib/importUtils";
import type { SourceFile } from "@/lib/types";

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

  const rtoken = useRunner((s) => s.token); // local runner pairing token
  const [behind, setBehind] = useState(false); // remote HEAD moved since our baseline
  const [busy, setBusy] = useState(false);
  const [agentReady, setAgentReady] = useState(false); // local runner reachable + paired

  const gh = project?.github;
  // Pull applies to any GitHub-connected project. When the local runner agent is
  // reachable it does REAL git in a real clone; otherwise it falls back to the
  // GitHub REST API + an in-browser 3-way merge. Either way it never pushes.
  const canPull = !!gh && !!token;
  const repo = gh ? { owner: gh.owner, repo: gh.repo, branch: gh.branch } : null;

  // detect the agent (paired + reachable)
  useEffect(() => {
    if (!rtoken) { setAgentReady(false); return; }
    let alive = true;
    probeRunner().then((r) => { if (alive) setAgentReady(r.up); }).catch(() => {});
    return () => { alive = false; };
  }, [rtoken]);

  // behind probe: ask the agent's real clone when available, else the REST HEAD sha
  useEffect(() => {
    let alive = true;
    if (!canPull || !gh || !repo) { setBehind(false); return; }
    (async () => {
      if (agentReady && rtoken) {
        try {
          const st = await gitStatus(rtoken, repo, token || undefined, true);
          if (st.cloned) { if (alive) setBehind((st.behind || 0) > 0); return; }
        } catch { /* fall through to REST */ }
      }
      if (!gh.commitSha) { if (alive) setBehind(false); return; }
      try { const head = await getBranchHeadSha(token!, gh.owner, gh.repo, gh.branch); if (alive) setBehind(head !== gh.commitSha); } catch { /* offline */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPull, agentReady, rtoken, token, gh?.owner, gh?.repo, gh?.branch, gh?.commitSha]);

  const baseHrefFor = (branch: string) =>
    project?.baseHref && project.baseHref.includes("jsdelivr")
      ? `https://cdn.jsdelivr.net/gh/${gh!.owner}/${gh!.repo}@${branch}/`
      : project?.baseHref ?? null;

  // Pull the branch HEAD and 3-way merge it with the current working copy:
  // remote-only changes fast-forward, your edits stay, files changed on both
  // sides get a line-level (diff3) merge — clean ones auto-resolve, the rest
  // open the conflict resolver.
  const pull = async () => {
    if (!canPull || !project || !gh || !repo) return;
    setBusy(true);
    try {
      // ── real git via the agent (reachable AND no local edits to merge) ──────
      // The agent's clone doesn't hold uncommitted Nova edits, so we only take
      // this path when the working copy is clean; the REST 3-way merge below
      // handles the dirty case (and the no-agent case). Refresh only the files
      // changed since OUR baseline (a fresh clone is already at HEAD, so a plain
      // pull would be a no-op and never update Nova's view).
      if (agentReady && rtoken && changed === 0) {
        const gt = token || undefined;
        await gitClone(rtoken, repo, gt);
        const res = await gitPull(rtoken, repo, gt);
        const { changed: chg } = await gitChanged(rtoken, repo, gh.commitSha);
        const byPath = new Map<string, SourceFile>(useEditor.getState().files.map((f) => [f.path, f]));
        const addOrUpdate = async (path: string) => {
          const kind = fileKind(path);
          if (!kind) return; // binary/asset — outside the editor file view (v1)
          const { content } = await gitRead(rtoken, repo, path);
          const ex = byPath.get(path);
          byPath.set(path, ex ? { ...ex, content, original: content } : { path, name: path.split("/").pop() || path, kind, category: classifyFile(path, kind), content, original: content });
        };
        if (chg === null) {
          byPath.clear();
          const { files } = await gitTree(rtoken, repo);
          for (const path of files) await addOrUpdate(path);
        } else {
          for (const c of chg) { if (c.status === "D") byPath.delete(c.path); else await addOrUpdate(c.path); }
        }
        const finalFiles = [...byPath.values()];
        const baseHref = baseHrefFor(gh.branch);
        loadFiles(finalFiles, {}, baseHref, project.id);
        updateProject(project.id, { github: { ...gh, commitSha: res.head }, baseHref, files: finalFiles });
        setBehind((res.behind || 0) > 0);
        if (project.storage === "device" && chg) {
          const toWrite = chg.filter((c) => c.status !== "D" && fileKind(c.path)).map((c) => ({ path: c.path, content: byPath.get(c.path)?.content ?? "" }));
          if (toWrite.length) await saveProjectToDevice(project.id, toWrite);
        }
        const n = chg === null ? finalFiles.length : chg.length;
        setNotice(res.conflicts.length ? `Pulled via local git — ${res.conflicts.length} conflict${res.conflicts.length === 1 ? "" : "s"} to resolve` : `Pulled ${gh.branch} via local git · ${n} file${n === 1 ? "" : "s"}`);
        return;
      }

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
      alertDialog({ title: "Sync failed", message: e.message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return { token, project, gh, changed, canPull, storage: project?.storage, behind, busy, pull, setBehind, setBusy, baseHrefFor, agentReady };
}
