import type { SourceFile } from "./types";
import type { AssetMap } from "./assets";
import { fileKind, classifyFile } from "./importUtils";

// File System Access API — read/write real folders on the user's disk.
// Chromium only; callers should feature-detect with fsSupported().
export function fsSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".cache", ".vercel"]);
const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|avif|ico|otf|ttf|woff2?|css|mp4|webm)$/i;

export async function pickDirectory(): Promise<any> {
  return (window as any).showDirectoryPicker({ mode: "readwrite" });
}

export async function verifyPermission(handle: any, write: boolean): Promise<boolean> {
  const opts = { mode: write ? "readwrite" : "read" };
  if ((await handle.queryPermission?.(opts)) === "granted") return true;
  if ((await handle.requestPermission?.(opts)) === "granted") return true;
  return false;
}

// Recursively read a directory into editable SourceFiles + asset blob URLs.
export async function readDirectory(
  root: any,
  onProgress?: (msg: string) => void
): Promise<{ files: SourceFile[]; assets: AssetMap }> {
  const files: SourceFile[] = [];
  const assets: AssetMap = {};

  async function walk(dir: any, prefix: string) {
    for await (const [name, handle] of dir.entries()) {
      if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === "file") {
        const kind = fileKind(path);
        if (kind) {
          if (files.length >= 80) continue;
          onProgress?.(`Reading ${path}`);
          const content = await (await handle.getFile()).text();
          files.push({ path, name, kind, category: classifyFile(path, kind), content, original: content });
        } else if (ASSET_RE.test(name)) {
          assets[path] = URL.createObjectURL(await handle.getFile());
        }
      } else if (handle.kind === "directory") {
        await walk(handle, path);
      }
    }
  }

  await walk(root, "");
  if (!files.length) throw new Error("No .html / .jsx / .tsx files found in that folder.");
  return { files, assets };
}

// Read an entire directory into a WebContainer FileSystemTree (nested
// {directory} / {file:{contents}}). Skips node_modules/.git etc. — npm install
// regenerates them and they'd be huge.
export async function readDirTree(dir: any): Promise<Record<string, any>> {
  const tree: Record<string, any> = {};
  for await (const [name, handle] of dir.entries()) {
    if (SKIP_DIRS.has(name)) continue;
    if (handle.kind === "file") {
      const buf = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      tree[name] = { file: { contents: buf } };
    } else if (handle.kind === "directory") {
      tree[name] = { directory: await readDirTree(handle) };
    }
  }
  return tree;
}

// Read an entire directory into a FLAT list for the local runner agent. Text
// files ride as strings; binary assets (images/fonts/media) ride base64 so they
// survive the JSON transport. Skips node_modules/.git etc. (the agent reinstalls).
const BINARY_RE = /\.(png|jpe?g|gif|webp|avif|ico|otf|ttf|woff2?|eot|mp4|webm|mov|mp3|wav|ogg|flac|pdf|wasm|zip|gz|woff)$/i;
export async function readFlatFiles(
  dir: any,
  prefix = "",
): Promise<{ path: string; content: string; encoding?: "base64" }[]> {
  const out: { path: string; content: string; encoding?: "base64" }[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (SKIP_DIRS.has(name) || name === ".git") continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "file") {
      const file = await handle.getFile();
      if (BINARY_RE.test(name)) {
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        out.push({ path, content: btoa(bin), encoding: "base64" });
      } else {
        out.push({ path, content: await file.text() });
      }
    } else if (handle.kind === "directory") {
      out.push(...(await readFlatFiles(handle, path)));
    }
  }
  return out;
}

// Write the given files back into the directory, creating subfolders as needed.
// Content may be text or raw bytes (for binary files in a full clone).
export async function writeFiles(
  root: any,
  files: { path: string; content: string | Uint8Array }[]
): Promise<void> {
  for (const f of files) {
    const parts = f.path.split("/");
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: true });
    }
    const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await fh.createWritable();
    await writable.write(f.content);
    await writable.close();
  }
}
