import type { SourceFile } from "./types";
import type { AssetMap } from "./assets";
import { fileKind, classifyFile, isAsset } from "./importUtils";
import { fetchRetry, pMapLimit } from "./net";

const API = "https://api.github.com";
const MAX_ASSET_BYTES = 15 * 1024 * 1024;

export interface GitHubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
}

export interface Repo {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  description: string | null;
}

// ── low-level fetch wrapper ──────────────────────────────────────────────────
async function gh(token: string, path: string, init?: RequestInit): Promise<any> {
  // fetchRetry handles transient 5xx/429 + hard rate-limit (throws RateLimitError).
  const res = await fetchRetry(
    path.startsWith("http") ? path : API + path,
    {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers || {}),
      },
    },
    { authed: true }
  );
  if (res.status === 401) throw new Error("Invalid or expired token (401). Reconnect GitHub in Settings.");
  if (res.status === 403) throw new Error("Access denied (403). Check the token's repo permissions.");
  if (res.status === 404) throw new Error("Not found (404) — the token may lack access to this resource.");
  if (!res.ok) throw new Error(`GitHub error ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.status === 204 ? null : res.json();
}

// ── account ──────────────────────────────────────────────────────────────────
export async function getAuthUser(token: string): Promise<GitHubUser> {
  const u = await gh(token, "/user");
  return { login: u.login, name: u.name, avatarUrl: u.avatar_url };
}

// repos the user owns / collaborates on / is an org member of (incl. private)
export async function listRepos(token: string): Promise<Repo[]> {
  const out: Repo[] = [];
  for (let page = 1; page <= 3; page++) {
    const data = await gh(
      token,
      `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`
    );
    for (const r of data) {
      out.push({
        owner: r.owner.login,
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        defaultBranch: r.default_branch,
        updatedAt: r.updated_at,
        description: r.description,
      });
    }
    if (data.length < 100) break;
  }
  return out;
}

export async function listBranches(token: string, owner: string, repo: string): Promise<string[]> {
  const data = await gh(token, `/repos/${owner}/${repo}/branches?per_page=100`);
  return data.map((b: any) => b.name);
}

// ── import (works for private repos via the authenticated API) ────────────────
export async function importRepoFilesAuth(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  onProgress?: (msg: string) => void
): Promise<{ files: SourceFile[]; assets: AssetMap }> {
  onProgress?.("Reading file tree…");
  const br = await gh(token, `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`);
  const treeSha = br.commit.commit.tree.sha;
  const tree = await gh(token, `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`);

  const treeBlobs: any[] = (tree.tree || []).filter((t: any) => t.type === "blob");
  const blobs: { path: string; sha: string }[] = treeBlobs
    .filter((t) => fileKind(t.path) !== null)
    .map((t) => ({ path: t.path, sha: t.sha }));

  if (!blobs.length) throw new Error("No editable .html/.jsx/.tsx files on that branch. (Use a full clone to bring the whole project.)");

  const files: SourceFile[] = [];
  let done = 0;
  await pMapLimit(blobs, 10, async ({ path, sha }) => {
    onProgress?.(`Downloading ${++done}/${blobs.length} files…`);
    try {
      const blob = await gh(token, `/repos/${owner}/${repo}/git/blobs/${sha}`);
      const content = blob.encoding === "base64" ? decodeBase64(blob.content) : blob.content;
      const kind = fileKind(path)!;
      files.push({ path, name: path.split("/").pop() || path, kind, category: classifyFile(path, kind), content, original: content });
    } catch {
      /* skip a single unreadable blob rather than failing the whole import */
    }
  });
  if (!files.length) throw new Error("Found editable files but none could be downloaded — try again.");

  // Download binary assets (images/svg/fonts/…) into real blobs — a true copy.
  const assetBlobs = treeBlobs.filter((t) => isAsset(t.path) && (t.size || 0) <= MAX_ASSET_BYTES);
  const assets: AssetMap = {};
  let ad = 0;
  await pMapLimit(assetBlobs, 8, async ({ path, sha }) => {
    onProgress?.(`Downloading assets ${++ad}/${assetBlobs.length}…`);
    try {
      const blob = await gh(token, `/repos/${owner}/${repo}/git/blobs/${sha}`);
      if (blob.encoding !== "base64" || !blob.content) return;
      assets[path] = URL.createObjectURL(new Blob([base64ToBytes(blob.content) as unknown as BlobPart]));
    } catch {
      /* skip an unreadable asset */
    }
  });

  if (tree.truncated) onProgress?.("Note: repo is large; GitHub truncated the file list — some files may be missing.");
  return { files, assets };
}

// Full clone: download EVERY file (incl. binaries) so the device folder is a
// real working copy. Returns editable SourceFiles (for the editor) + all files
// as raw bytes (to write to disk). Skips node_modules/.git etc.
const CLONE_SKIP = /(^|\/)(node_modules|\.git|\.next|dist|build|\.cache|\.vercel)\//;
export async function cloneRepoFiles(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  onProgress?: (msg: string) => void
): Promise<{ editable: SourceFile[]; all: { path: string; content: Uint8Array }[] }> {
  onProgress?.("Reading file tree…");
  const br = await gh(token, `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`);
  const tree = await gh(token, `/repos/${owner}/${repo}/git/trees/${br.commit.commit.tree.sha}?recursive=1`);
  const blobs: { path: string; sha: string }[] = (tree.tree || [])
    .filter((t: any) => t.type === "blob" && !CLONE_SKIP.test(t.path))
    .slice(0, 2000) // sanity guard (node_modules/.git already excluded)
    .map((t: any) => ({ path: t.path, sha: t.sha }));

  const all: { path: string; content: Uint8Array }[] = [];
  const editable: SourceFile[] = [];
  let done = 0;

  await pMapLimit(blobs, 12, async ({ path, sha }) => {
    try {
      const blob = await gh(token, `/repos/${owner}/${repo}/git/blobs/${sha}`);
      const bytes = blob.encoding === "base64" ? base64ToBytes(blob.content) : new TextEncoder().encode(blob.content);
      all.push({ path, content: bytes });
      const kind = fileKind(path);
      if (kind) {
        const content = new TextDecoder("utf-8").decode(bytes);
        editable.push({ path, name: path.split("/").pop() || path, kind, category: classifyFile(path, kind), content, original: content });
      }
    } catch {
      /* skip unreadable blobs rather than failing the whole clone */
    }
    onProgress?.(`Cloning ${++done}/${blobs.length} files…`);
  });
  if (!editable.length) throw new Error("Cloned the repo but found no editable .html/.jsx/.tsx files to open in the editor.");
  if (tree.truncated) onProgress?.("Note: repo is very large; GitHub truncated the file list — some files may be missing from the clone.");
  return { editable, all };
}

// ── branches ─────────────────────────────────────────────────────────────────
export async function createBranch(
  token: string,
  owner: string,
  repo: string,
  fromBranch: string,
  newBranch: string
): Promise<void> {
  const ref = await gh(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(fromBranch)}`);
  await gh(token, `/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: ref.object.sha }),
  });
}

// ── commit + push (single commit, multiple files, via the Git Data API) ───────
export async function commitFiles(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  changes: { path: string; content: string }[],
  message: string
): Promise<string> {
  const refPath = `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`;
  const ref = await gh(token, refPath);
  const latestSha = ref.object.sha;
  const latest = await gh(token, `/repos/${owner}/${repo}/git/commits/${latestSha}`);

  const tree = await gh(token, `/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: latest.tree.sha,
      tree: changes.map((c) => ({ path: c.path, mode: "100644", type: "blob", content: c.content })),
    }),
  });

  const commit = await gh(token, `/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [latestSha] }),
  });

  await gh(token, `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  });
  return commit.sha;
}

// ── pull request (commit to a new branch + open a PR) ────────────────────────
export async function commitToNewBranchAndPR(
  token: string,
  owner: string,
  repo: string,
  baseBranch: string,
  newBranch: string,
  changes: { path: string; content: string }[],
  message: string,
  prTitle: string,
  prBody?: string
): Promise<string> {
  await createBranch(token, owner, repo, baseBranch, newBranch);
  await commitFiles(token, owner, repo, newBranch, changes, message);
  const pr = await gh(token, `/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({ title: prTitle, head: newBranch, base: baseBranch, body: prBody || message }),
  });
  return pr.html_url as string;
}

// ── create repo ──────────────────────────────────────────────────────────────
export async function createRepo(
  token: string,
  opts: { name: string; isPrivate: boolean; org?: string }
): Promise<Repo> {
  const path = opts.org ? `/orgs/${opts.org}/repos` : `/user/repos`;
  const r = await gh(token, path, {
    method: "POST",
    body: JSON.stringify({ name: opts.name, private: opts.isPrivate, auto_init: true }),
  });
  return {
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch,
    updatedAt: r.updated_at,
    description: r.description,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64.replace(/\n/g, "")), (c) => c.charCodeAt(0));
}
function decodeBase64(b64: string): string {
  return new TextDecoder("utf-8").decode(base64ToBytes(b64));
}
