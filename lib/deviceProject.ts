import type { SourceFile } from "./types";
import type { AssetMap } from "./assets";
import { pickDirectory, readDirectory, writeFiles, verifyPermission } from "./fileSystem";
import { saveHandle, getHandle } from "./handleStore";

// Pick a folder and read it into a project (used when creating/opening a folder).
export async function openFolder(
  onProgress?: (m: string) => void
): Promise<{ handle: any; name: string; files: SourceFile[]; assets: AssetMap }> {
  const handle = await pickDirectory();
  const { files, assets } = await readDirectory(handle, onProgress);
  return { handle, name: handle.name, files, assets };
}

// Re-read a device-backed project's folder when reopening it from the dashboard.
export async function reopenFolder(
  projectId: string
): Promise<{ files: SourceFile[]; assets: AssetMap }> {
  const handle = await getHandle(projectId);
  if (!handle) throw new Error("This folder isn't linked in this browser. Open it again to relink.");
  if (!(await verifyPermission(handle, false)))
    throw new Error("Permission to read the folder was denied.");
  return readDirectory(handle);
}

// Save the project's files back to disk. If not yet folder-backed, prompt for a
// folder and link it. Returns the handle (so the caller can mark it as device-backed).
export async function saveProjectToDevice(
  projectId: string,
  files: { path: string; content: string }[]
): Promise<{ handle: any; linked: boolean }> {
  let handle = await getHandle(projectId);
  let linked = false;
  if (!handle) {
    handle = await pickDirectory();
    await saveHandle(projectId, handle);
    linked = true;
  }
  if (!(await verifyPermission(handle, true)))
    throw new Error("Permission to write to the folder was denied.");
  await writeFiles(handle, files);
  return { handle, linked };
}

export { saveHandle };
