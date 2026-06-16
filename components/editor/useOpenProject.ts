"use client";

import { useCallback } from "react";
import { useEditor } from "@/store/editorStore";
import { useProjects, type ProjectRecord } from "@/store/projectsStore";
import { useGitHub } from "@/store/githubStore";
import { importGithub } from "@/lib/importFlow";
import { importRepoFilesAuth } from "@/lib/githubApi";
import { reopenFolder } from "@/lib/deviceProject";

// Loads a project record's files into the editor store — the single source of
// truth shared by the dashboard (opening a card) and /editor/[projectId] (deep
// link / refresh). A saved working copy wins; otherwise we re-open the folder or
// re-fetch from GitHub. Throws if the project can't be reopened.
export function useOpenProject() {
  const loadFiles = useEditor((s) => s.loadFiles);
  const updateProject = useProjects((s) => s.updateProject);
  const token = useGitHub((s) => s.token);

  return useCallback(
    async (p: ProjectRecord) => {
      if (p.files?.length) {
        loadFiles(p.files, {}, p.baseHref ?? null, p.id);
      } else if (p.storage === "device") {
        const { files, assets } = await reopenFolder(p.id);
        loadFiles(files, assets, null, p.id);
      } else if (p.github && token) {
        const { files, assets, commitSha } = await importRepoFilesAuth(token, p.github.owner, p.github.repo, p.github.branch);
        loadFiles(files, assets, p.baseHref ?? null, p.id);
        if (commitSha !== p.github.commitSha) updateProject(p.id, { github: { ...p.github, commitSha } });
      } else if (p.repoUrl) {
        const res = await importGithub(p.repoUrl);
        loadFiles(res.files, res.assets, res.baseHref, p.id);
      } else {
        throw new Error("Connect GitHub to reopen this repo project.");
      }
    },
    [loadFiles, updateProject, token]
  );
}
