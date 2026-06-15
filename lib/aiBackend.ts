// Where the AI agent reads and writes files. The editor uses the in-memory
// editor store (default, unchanged); the Run tab uses the live WebContainer
// filesystem with write-through to the on-disk folder. Abstracting this lets the
// same agent edit the running app instead of the canvas.

import { fileKind, classifyFile } from "@/lib/importUtils";
import { writeFiles } from "@/lib/fileSystem";

export interface BackendFile {
  path: string;
  category: string;
}

export interface FileBackend {
  list(): Promise<BackendFile[]>;
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<{ ok: boolean; error?: string }>;
}

const EDITABLE = /\.(html?|jsx|tsx)$/i;
const IGNORE = /(^|\/)(node_modules|\.next|\.git|dist|build|out|coverage|\.cache)(\/|$)/;

async function walk(wc: any, dir: string, acc: string[], depth: number): Promise<void> {
  if (depth > 8 || acc.length > 800) return;
  let entries: any[];
  try {
    entries = await wc.fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const name = e.name || e;
    const p = dir === "." ? name : `${dir}/${name}`;
    if (IGNORE.test(p)) continue;
    const isDir = typeof e.isDirectory === "function" ? e.isDirectory() : false;
    if (isDir) await walk(wc, p, acc, depth + 1);
    else if (EDITABLE.test(name)) acc.push(p);
  }
}

// WebContainer-backed file ops, writing through to the on-disk folder handle so
// AI edits land in the user's real files (and git) — not just the container.
// onWrite (path, before, after) lets the Run tab fold these into its undo stack.
export function makeWcBackend(
  wc: any,
  handle: any | null,
  onWrite?: (path: string, before: string, after: string) => void
): FileBackend {
  return {
    async list() {
      const paths: string[] = [];
      await walk(wc, ".", paths, 0);
      return paths.map((p) => ({ path: p, category: classifyFile(p, fileKind(p) || "jsx") }));
    },
    async read(path) {
      try {
        return await wc.fs.readFile(path, "utf-8");
      } catch {
        return null;
      }
    },
    async write(path, content) {
      try {
        let before = "";
        try { before = await wc.fs.readFile(path, "utf-8"); } catch { /* new file */ }
        await wc.fs.writeFile(path, content);
        if (handle) {
          try { await writeFiles(handle, [{ path, content }]); } catch { /* disk write best-effort */ }
        }
        if (before !== content) onWrite?.(path, before, content);
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message || String(e) };
      }
    },
  };
}
