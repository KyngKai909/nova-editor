import type { SourceFile } from "./types";
import { fileKind, classifyFile } from "./importUtils";
import { fetchRetry, pMapLimit, RateLimitError } from "./net";

interface RepoRef {
  owner: string;
  repo: string;
  branch?: string;
}

// Robustly parse whatever a user pastes. Accepts:
//   https://github.com/owner/repo                     · with or without https/www
//   https://github.com/owner/repo.git                 · trailing .git
//   https://github.com/owner/repo/tree/<branch>[/...]  · branch from a deep link
//   https://github.com/owner/repo/blob/<branch>/file   · blob/file links
//   git@github.com:owner/repo.git                      · ssh remotes
//   owner/repo                                         · bare shorthand
// (query strings / hashes are stripped.)
export function parseRepoUrl(input: string): RepoRef | null {
  let s = (input || "").trim();
  if (!s) return null;
  s = s
    .replace(/^git@github\.com:/i, "github.com/")
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/[?#].*$/, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");

  const full = s.match(/^github\.com\/([^/]+)\/([^/]+)(?:\/(?:tree|blob)\/([^/]+))?(?:\/.*)?$/i);
  if (full) return { owner: full[1], repo: full[2], branch: full[3] || undefined };

  const short = s.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (short) return { owner: short[1], repo: short[2] };
  return null;
}

// Fetch the editable (.html/.jsx/.tsx) files from a PUBLIC repo without a token.
// Tree comes from the API (1 call); file bodies come from raw.githubusercontent
// (higher limits than the API), pulled concurrently with retry.
export async function fetchRepoFiles(
  ref: RepoRef,
  onProgress?: (msg: string) => void
): Promise<{ files: SourceFile[]; baseHref: string; owner: string; repo: string; branch: string; truncated: boolean }> {
  const { owner, repo } = ref;
  let branch = ref.branch;

  if (!branch) {
    onProgress?.("Resolving default branch…");
    const meta = await ghJson(`https://api.github.com/repos/${owner}/${repo}`);
    branch = meta.default_branch || "main";
  }

  onProgress?.(`Reading file tree (${branch})…`);
  const tree = await ghJson(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch!)}?recursive=1`
  );

  const all: { path: string }[] = (tree.tree || []).filter((t: any) => t.type === "blob");
  const editable = all.filter((t) => fileKind(t.path) !== null);

  if (!editable.length) {
    // Help the user understand *why* nothing imported.
    const exts = new Set(all.map((t) => (t.path.split(".").pop() || "").toLowerCase()).filter(Boolean));
    const seen = [...exts].slice(0, 8).join(", ");
    throw new Error(
      all.length
        ? `No editable .html/.jsx/.tsx files in this repo (found: ${seen}). Nova edits HTML & React (JSX/TSX) — connect GitHub to clone the whole project, or check the branch.`
        : "That branch looks empty. Double-check the repo and branch."
    );
  }

  const files: SourceFile[] = [];
  let done = 0;
  await pMapLimit(editable, 8, async ({ path }) => {
    onProgress?.(`Downloading ${++done}/${editable.length} files…`);
    const raw = await fetchRetry(
      `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch!)}/${path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`
    );
    if (!raw.ok) return; // skip a file that won't load rather than failing the whole import
    const content = await raw.text();
    const kind = fileKind(path)!;
    files.push({ path, name: path.split("/").pop() || path, kind, category: classifyFile(path, kind), content, original: content });
  });

  if (!files.length) throw new Error("Found editable files but none could be downloaded. Try again, or connect GitHub.");

  const baseHref = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/`;
  return { files, baseHref, owner, repo, branch: branch!, truncated: !!tree.truncated };
}

async function ghJson(url: string): Promise<any> {
  const res = await fetchRetry(url, { headers: { Accept: "application/vnd.github+json" } });
  if (res.status === 404) throw new Error("Repo or branch not found — it may be private. Connect GitHub to import private repos.");
  if (res.status === 403 || res.status === 429) throw new RateLimitError(undefined, false);
  if (!res.ok) throw new Error(`GitHub API error ${res.status}. Try again, or connect GitHub.`);
  return res.json();
}
