import type { SourceFile } from "./types";

// File-granularity 3-way merge — the same model git uses, applied to Nova's
// working copy. For each path we have three sides:
//   BASE   = the file's `original` (pristine as imported / last synced)
//   LOCAL  = the file's `content` (the user's in-Nova edits)
//   REMOTE = the freshly re-fetched content from the branch HEAD now
//
// Non-overlapping changes auto-merge (remote touched file A, you edited file B).
// A file changed on BOTH sides is a conflict — we keep your version so no work
// is lost, rebase its baseline to REMOTE (so the diff shows local-vs-remote),
// and report the path so the UI can flag it for manual resolution.

export interface MergeResult {
  files: SourceFile[];   // the merged working set
  pulled: string[];      // fast-forwarded from remote (you hadn't touched them)
  kept: string[];        // your edits kept (remote hadn't touched them)
  added: string[];       // new files that appeared upstream
  removed: string[];     // files deleted upstream (you hadn't touched them)
  conflicts: string[];   // edited on both sides (or edited locally + deleted upstream)
}

export function mergeThreeWay(local: SourceFile[], remote: SourceFile[]): MergeResult {
  const localByPath = new Map(local.map((f) => [f.path, f]));
  const remoteByPath = new Map(remote.map((f) => [f.path, f]));
  // local order first, then any remote-only paths — keeps the file list stable
  const paths = [...localByPath.keys(), ...remote.filter((f) => !localByPath.has(f.path)).map((f) => f.path)];

  const files: SourceFile[] = [];
  const pulled: string[] = [];
  const kept: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  const conflicts: string[] = [];

  for (const path of paths) {
    const L = localByPath.get(path);
    const R = remoteByPath.get(path);

    if (L && R) {
      const base = L.original ?? "";
      const loc = L.content;
      const rem = R.content;
      if (loc === rem) {
        files.push({ ...R, original: rem });            // already in sync
      } else if (loc === base) {
        files.push({ ...R, original: rem });            // remote-only change → take it
        pulled.push(path);
      } else if (rem === base) {
        files.push({ ...L, original: rem });            // local-only change → keep it
        kept.push(path);
      } else {
        files.push({ ...L, original: rem });            // both changed → conflict, keep local
        conflicts.push(path);
      }
    } else if (L && !R) {
      if (!L.original) {
        files.push(L);                                  // brand-new local file (never upstream) → keep
      } else if (L.content === L.original) {
        removed.push(path);                             // deleted upstream, untouched locally → drop
      } else {
        files.push(L);                                  // deleted upstream but you edited it → conflict
        conflicts.push(path);
      }
    } else if (!L && R) {
      files.push({ ...R, original: R.content });        // new file upstream → add
      added.push(path);
    }
  }

  return { files, pulled, kept, added, removed, conflicts };
}

// One-line human summary of a merge for a toast/notice.
export function summarizeMerge(m: MergeResult): string {
  const bits: string[] = [];
  if (m.pulled.length) bits.push(`${m.pulled.length} updated`);
  if (m.added.length) bits.push(`${m.added.length} added`);
  if (m.removed.length) bits.push(`${m.removed.length} removed`);
  if (m.kept.length) bits.push(`${m.kept.length} kept local`);
  if (m.conflicts.length) bits.push(`${m.conflicts.length} conflict${m.conflicts.length === 1 ? "" : "s"}`);
  return bits.length ? bits.join(" · ") : "Already up to date";
}
