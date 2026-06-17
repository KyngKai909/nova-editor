import type { SourceFile } from "./types";
import type { AssetMap } from "./assets";
import { toSourceFiles, isAsset, stripCommonRoot, fileKind } from "./importUtils";
import { fetchRepoFiles, parseRepoUrl } from "./github";

export interface ImportResult {
  files: SourceFile[];
  assets: AssetMap;
  baseHref: string | null;
  repoUrl?: string;
  github?: { owner: string; repo: string; branch: string };
  suggestedName: string;
  warning?: string; // non-fatal note to surface to the user (e.g. truncated tree)
}

export async function importFolder(fileList: FileList): Promise<ImportResult> {
  const all = Array.from(fileList);
  const strip = stripCommonRoot(all.map((f) => (f as any).webkitRelativePath || f.name));
  const entries: { path: string; content: string }[] = [];
  const assets: AssetMap = {};
  let root = "project";
  for (const f of all) {
    const rel = (f as any).webkitRelativePath || f.name;
    if (rel.includes("/")) root = rel.split("/")[0];
    const path = strip(rel);
    if (fileKind(path)) entries.push({ path: rel, content: await f.text() });
    else if (isAsset(path)) assets[path] = URL.createObjectURL(f);
  }
  const files = toSourceFiles(entries);
  if (!files.length) throw new Error("No editable files (.html / .jsx / .tsx / .ts / .css … ) found in that selection.");
  return { files, assets, baseHref: null, suggestedName: root };
}

export async function importGithub(
  url: string,
  onProgress?: (m: string) => void
): Promise<ImportResult> {
  const ref = parseRepoUrl(url);
  if (!ref) throw new Error("Enter a GitHub URL like https://github.com/owner/repo");
  const { files, assets, baseHref, owner, repo, branch, truncated } = await fetchRepoFiles(ref, onProgress);
  return {
    files,
    assets,
    baseHref,
    repoUrl: url,
    github: { owner, repo, branch },
    suggestedName: repo,
    warning: truncated
      ? "This repo is large enough that GitHub truncated the file list — some files may be missing. Connect GitHub and clone for the complete project."
      : undefined,
  };
}

export function importPaste(name: string, code: string): ImportResult {
  if (!code.trim()) throw new Error("Paste some HTML or JSX first.");
  const files = toSourceFiles([{ path: name, content: code }]);
  if (!files.length) throw new Error("File name must end in .html, .jsx or .tsx.");
  return { files, assets: {}, baseHref: null, suggestedName: name.replace(/\.[^.]+$/, "") };
}

export async function importSample(): Promise<ImportResult> {
  const content = await (await fetch("/samples/landing.html")).text();
  return {
    files: toSourceFiles([{ path: "landing.html", content }]),
    assets: {},
    baseHref: null,
    suggestedName: "Sample landing",
  };
}
