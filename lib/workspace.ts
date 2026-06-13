import type { SourceFile } from "./types";
import { pickDirectory, writeFiles, verifyPermission } from "./fileSystem";
import { saveHandle, getHandle, deleteHandle } from "./handleStore";

// The user's chosen "projects folder". New projects get their own subfolder
// created inside it automatically (no repeated pickers) — the IDE-style layout.
const WORKSPACE_KEY = "__workspace__";

const WORKSPACE_DIR = "Nova Editor";

// Let the user pick a location, then keep everything tidy inside a single
// "Nova Editor" folder there. Returns the display name shown in the UI.
export async function pickWorkspace(): Promise<string> {
  const root = await pickDirectory();
  const ws = await root.getDirectoryHandle(WORKSPACE_DIR, { create: true });
  await saveHandle(WORKSPACE_KEY, ws);
  return `${root.name}/${WORKSPACE_DIR}`;
}

export async function getWorkspace(): Promise<any | null> {
  return getHandle(WORKSPACE_KEY);
}

export async function hasWorkspace(): Promise<boolean> {
  return !!(await getHandle(WORKSPACE_KEY));
}

export async function clearWorkspace(): Promise<void> {
  await deleteHandle(WORKSPACE_KEY);
}

// Create a fresh, uniquely-named subfolder in the workspace and write the
// project's files into it. Pass `all` (raw bytes for every file) for a full
// clone; otherwise the editable text files are written. Returns the handle.
export async function createProjectFolder(
  name: string,
  files: SourceFile[],
  all?: { path: string; content: string | Uint8Array }[]
): Promise<any> {
  const ws = await getWorkspace();
  if (!ws) throw new Error("No projects folder set.");
  if (!(await verifyPermission(ws, true))) throw new Error("Permission to the projects folder was denied.");

  const base = (name || "project").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  const dirName = await uniqueDirName(ws, base);
  const dir = await ws.getDirectoryHandle(dirName, { create: true });
  await writeFiles(dir, all ?? files.map((f) => ({ path: f.path, content: f.content })));
  return dir;
}

async function uniqueDirName(ws: any, base: string): Promise<string> {
  let name = base;
  let i = 1;
  // loop until a name that doesn't already exist
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await ws.getDirectoryHandle(name); // throws if it doesn't exist
      name = `${base}-${i++}`;
    } catch {
      return name;
    }
  }
}
