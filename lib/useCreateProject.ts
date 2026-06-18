"use client";

import { useRouter } from "next/navigation";
import { useEditor } from "@/store/editorStore";
import { useProjects, type ProjectKind } from "@/store/projectsStore";
import type { SourceFile } from "./types";
import type { AssetMap } from "./assets";
import { fsSupported } from "./fileSystem";
import { hasWorkspace, createProjectFolder } from "./workspace";
import { saveHandle } from "./handleStore";
import { persistAssetMap } from "./assetStore";

interface CreateArgs {
  name: string;
  kind: ProjectKind;
  files: SourceFile[];
  assets?: AssetMap;
  baseHref?: string | null;
  repoUrl?: string;
  github?: { owner: string; repo: string; branch: string; commitSha?: string };
  deviceHandle?: any; // when the user opened an existing folder, use it directly
  allFiles?: { path: string; content: string | Uint8Array }[]; // full clone for disk
}

// Creates a project, opens it in the editor, and — if a projects folder is set
// (or a folder was opened directly) — backs it with a real folder on disk so it
// autosaves there. GitHub imports get a local subfolder too (IDE-style).
export function useCreateProject() {
  const router = useRouter();
  const addProject = useProjects((s) => s.addProject);
  const loadFiles = useEditor((s) => s.loadFiles);

  return async ({ name, kind, files, assets = {}, baseHref = null, repoUrl, github, deviceHandle, allFiles }: CreateArgs) => {
    let handle = deviceHandle ?? null;
    let deviceDir: string | undefined; // set only when NOVA creates the folder
    if (!handle && fsSupported() && (await hasWorkspace())) {
      try {
        const created = await createProjectFolder(name, files, allFiles); // full clone if provided
        handle = created.handle;
        deviceDir = created.dirName;
      } catch {
        handle = null; // fall back to browser storage
      }
    }
    const storage = handle ? ("device" as const) : undefined;

    const rec = addProject({
      name,
      kind,
      files: storage ? undefined : files,
      baseHref,
      repoUrl,
      github,
      storage,
      deviceDir, // undefined for user-opened folders → never auto-deleted from disk
      status: { published: false, github: !!github },
    });
    if (handle) await saveHandle(rec.id, handle);

    loadFiles(files, assets, baseHref, rec.id);
    persistAssetMap(rec.id, assets); // keep imported images/fonts across reloads
    router.push("/editor");
    return rec;
  };
}
