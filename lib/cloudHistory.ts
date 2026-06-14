import { supabase } from "@/lib/supabase";

// Cloud-backed undo/redo history for paid / collaborative projects, so it
// follows you across devices and stays with shared projects. PER USER: each
// collaborator's history is keyed by their own user id, so your undo only ever
// walks through *your* actions — never someone else's. Local IndexedDB remains
// the offline copy; this is an additive backup that wins on open.
//
// History snapshots hold full file content, so we bound what goes to the cloud:
// keep only the most recent steps and skip pathologically large blobs (those
// stay local-only). Most projects fit comfortably.

const MAX_CLOUD_SNAPSHOTS = 20;
const MAX_BYTES = 6 * 1024 * 1024;

type History = { past: unknown[]; future: unknown[] };

export async function pushCloudHistory(ownerId: string, projectId: string, userId: string, h: History): Promise<void> {
  if (!supabase || !ownerId || !projectId || !userId) return;
  const trimmed = {
    past: (h.past || []).slice(-MAX_CLOUD_SNAPSHOTS),
    future: (h.future || []).slice(0, MAX_CLOUD_SNAPSHOTS),
  };
  // rough size guard — JSON length is a fine proxy
  if (JSON.stringify(trimmed).length > MAX_BYTES) return; // too big: stays local-only
  try {
    await supabase
      .from("project_history")
      .upsert(
        { owner_id: ownerId, project_id: projectId, user_id: userId, data: trimmed, updated_at: new Date().toISOString() },
        { onConflict: "owner_id,project_id,user_id" }
      );
  } catch {
    /* best-effort */
  }
}

export async function pullCloudHistory(ownerId: string, projectId: string, userId: string): Promise<History | null> {
  if (!supabase || !ownerId || !projectId || !userId) return null;
  try {
    const { data, error } = await supabase
      .from("project_history")
      .select("data")
      .eq("owner_id", ownerId)
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return data.data as History;
  } catch {
    return null;
  }
}
