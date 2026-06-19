import { supabase } from "@/lib/supabase";
import type { ProjectRecord } from "@/store/projectsStore";

// Client helpers for the collaboration backend (Phase 8). All access control is
// enforced server-side by RLS + the invite_collaborator() RPC; these are thin
// wrappers the UI calls.

export type Role = "editor" | "commentor" | "viewer";
// The role used inside the editor — owners get the same powers as editors.
export type EditorRole = "owner" | Role;

export interface Collaborator {
  email: string;
  role: Role;
  status: string; // 'pending' | 'active'
  collaborator_id: string | null;
}

export interface SharedProject {
  owner_id: string;
  project_id: string;
  role: Role;
  name: string | null;
  data: ProjectRecord;
  rev: number;
  updated_at: string;
  // true when this is an editor invite currently capped to comment-only because
  // the owner isn't on Studio (auto-restores when they resubscribe).
  downgraded?: boolean;
}

// Invite (or re-role) a collaborator. Throws with the server message — e.g. the
// Studio gate on editor invites.
export async function inviteCollaborator(projectId: string, email: string, role: Role): Promise<string> {
  if (!supabase) throw new Error("Sign in to invite collaborators.");
  const { data, error } = await supabase.rpc("invite_collaborator", {
    p_project: projectId,
    p_email: email.trim().toLowerCase(),
    p_role: role,
  });
  if (error) throw new Error(error.message);
  return (data as string) || "pending";
}

export async function listCollaborators(projectId: string): Promise<Collaborator[]> {
  if (!supabase) return [];
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data } = await supabase
    .from("project_collaborators")
    .select("email, role, status, collaborator_id")
    .eq("owner_id", auth.user.id)
    .eq("project_id", projectId)
    .order("created_at");
  return (data as Collaborator[]) || [];
}

export async function removeCollaborator(projectId: string, email: string): Promise<void> {
  if (!supabase) return;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await supabase
    .from("project_collaborators")
    .delete()
    .eq("owner_id", auth.user.id)
    .eq("project_id", projectId)
    .eq("email", email);
}

// Projects shared WITH the current user (for the dashboard).
export async function mySharedProjects(): Promise<SharedProject[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("my_shared_projects");
  if (error) return [];
  return (data as SharedProject[]) || [];
}

// How many editor collaborators the current user OWNS — used to warn a lapsed
// owner that their editors are paused until they resubscribe to Studio.
export async function myEditorCollaboratorCount(): Promise<number> {
  if (!supabase) return 0;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return 0;
  const { count } = await supabase
    .from("project_collaborators")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", auth.user.id)
    .eq("role", "editor");
  return count || 0;
}
