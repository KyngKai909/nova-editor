import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/authStore";
import { useProjects, type ProjectRecord } from "@/store/projectsStore";

// Cloud backup + cross-device sync (the paid feature). Local IndexedDB stays the
// source of truth; the cloud is a mirror. SAFETY INVARIANT: a pull NEVER deletes
// a local project — it only adds cloud-only projects and updates ones the cloud
// has a newer version of (last-write-wins by ProjectRecord.updatedAt). So a sync
// glitch can't lose your work.

let uid: string | null = null;

// Gated to Pro (and admins, so it can be tested). Stripe flips plan → 'pro'.
export function canSync(): boolean {
  const p = useAuth.getState().profile;
  return !!supabase && !!p && (p.plan === "pro" || p.is_admin);
}

async function getUid(): Promise<string | null> {
  if (uid) return uid;
  const { data } = await supabase!.auth.getUser();
  uid = data.user?.id ?? null;
  return uid;
}

export function resetSync() {
  uid = null;
}

export async function pushProject(p: ProjectRecord): Promise<void> {
  if (!supabase) return;
  const u = await getUid();
  if (!u) return;
  await supabase
    .from("cloud_projects")
    .upsert(
      { user_id: u, id: p.id, name: p.name, data: p, updated_at: new Date(p.updatedAt || Date.now()).toISOString(), deleted: false },
      { onConflict: "user_id,id" }
    );
}

export async function pushDelete(id: string): Promise<void> {
  if (!supabase) return;
  const u = await getUid();
  if (!u) return;
  await supabase
    .from("cloud_projects")
    .upsert({ user_id: u, id, data: {}, deleted: true, updated_at: new Date().toISOString() }, { onConflict: "user_id,id" });
}

// Pull cloud → local. Additive only (never removes a local project). Then push
// anything local that the cloud is missing or has an older copy of.
export async function pullAndMerge(): Promise<void> {
  if (!supabase) return;
  const u = await getUid();
  if (!u) return;
  const { data, error } = await supabase.from("cloud_projects").select("id, data, deleted").eq("user_id", u);
  if (error || !data) return;

  const local = useProjects.getState().projects;
  const localById = new Map(local.map((p) => [p.id, p]));
  const next = [...local];

  for (const row of data as { id: string; data: ProjectRecord; deleted: boolean }[]) {
    if (row.deleted) continue; // don't re-add a deleted project; never remove a local one
    const cloud = row.data;
    if (!cloud?.id) continue;
    const localP = localById.get(row.id);
    if (!localP) {
      next.unshift(cloud); // cloud-only → add locally
    } else if ((cloud.updatedAt || 0) > (localP.updatedAt || 0)) {
      const i = next.findIndex((p) => p.id === row.id); // cloud newer → replace
      if (i >= 0) next[i] = cloud;
    }
  }
  useProjects.setState({ projects: next });

  // upload local projects the cloud doesn't have (or has older)
  const cloudById = new Map((data as any[]).map((r) => [r.id, r]));
  for (const p of useProjects.getState().projects) {
    const row = cloudById.get(p.id);
    const cloudUpdated = row && !row.deleted ? (row.data as ProjectRecord)?.updatedAt || 0 : -1;
    if (!row || (p.updatedAt || 0) > cloudUpdated) pushProject(p).catch(() => {});
  }
}

// Live updates from other devices (best-effort; requires realtime enabled on the
// table). Re-pulls on any change — pull is idempotent, so our own echoes are no-ops.
export function subscribeRealtime(onRemote: () => void): () => void {
  if (!supabase) return () => {};
  const ch = supabase
    .channel("cloud_projects_sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "cloud_projects" }, () => onRemote())
    .subscribe();
  return () => {
    supabase!.removeChannel(ch);
  };
}
