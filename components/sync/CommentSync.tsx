"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/authStore";
import { useEditor } from "@/store/editorStore";
import { useComments, type Comment } from "@/store/commentsStore";

// Live comment sync (Phase 8). Comments for the active project mirror to the
// cloud `project_comments` table so collaborators see each other's comments in
// real time. RLS enforces who can read/add/edit (viewers read-only). Local
// IndexedDB stays the working copy; the cloud is authoritative for shared rows.

type Row = {
  id: string; element_id: string; element_label: string | null; body: string;
  x: number | null; y: number | null; author_id: string | null; resolved: boolean; created_at: string;
};

const hash = (c: Comment) => `${c.body}|${c.resolved}|${c.elementId}|${c.x ?? ""}|${c.y ?? ""}`;

const toLocal = (r: Row, projectId: string, myId: string | null): Comment => ({
  id: r.id,
  projectId,
  elementId: r.element_id,
  elementLabel: r.element_label || "",
  body: r.body,
  author: r.author_id && r.author_id === myId ? "You" : "Collaborator",
  resolved: r.resolved,
  createdAt: new Date(r.created_at).getTime(),
  x: r.x ?? undefined,
  y: r.y ?? undefined,
});

const toRow = (c: Comment, ownerId: string, projectId: string, myId: string | null) => ({
  id: c.id,
  owner_id: ownerId,
  project_id: projectId,
  element_id: c.elementId,
  element_label: c.elementLabel,
  body: c.body,
  x: c.x ?? null,
  y: c.y ?? null,
  author_id: myId,
  resolved: c.resolved,
});

export default function CommentSync() {
  const projectId = useEditor((s) => s.projectId);
  const ownerId = useEditor((s) => s.ownerId);
  const role = useEditor((s) => s.role);
  const profile = useAuth((s) => s.profile);
  const signedIn = useAuth((s) => s.signedIn);

  // The cloud comments live under the project OWNER (self for own projects).
  const cloudOwner = ownerId || profile?.id || null;
  const myId = profile?.id || null;
  const active = !!supabase && signedIn && !!projectId && !!cloudOwner;
  const canWrite = role !== "viewer"; // viewers never push (RLS would reject too)

  // hash of every row we've reconciled, so the push observer skips cloud echoes
  const synced = useRef<Map<string, string>>(new Map());

  // pull + realtime
  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const pull = async () => {
      const { data, error } = await supabase!
        .from("project_comments")
        .select("id, element_id, element_label, body, x, y, author_id, resolved, created_at")
        .eq("owner_id", cloudOwner!)
        .eq("project_id", projectId!);
      if (cancelled || error || !data) return;

      const rows = data as Row[];
      const cloudIds = new Set(rows.map((r) => r.id));
      const local = useComments.getState().byProject[projectId!] || [];

      const merged: Comment[] = rows.map((r) => toLocal(r, projectId!, myId));
      for (const c of local) {
        if (cloudIds.has(c.id)) continue;            // already adopted from cloud
        if (synced.current.has(c.id)) continue;      // was synced, now gone → deleted remotely
        merged.push(c);                              // never synced → keep (will push)
      }
      merged.sort((a, b) => a.createdAt - b.createdAt);

      useComments.setState((s) => ({ byProject: { ...s.byProject, [projectId!]: merged } }));
      // remember the hashes of cloud-backed rows so we don't re-push them
      synced.current = new Map(rows.map((r) => [r.id, hash(toLocal(r, projectId!, myId))]));
    };

    pull();
    const ch = supabase!
      .channel(`pc_${cloudOwner}_${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_comments", filter: `project_id=eq.${projectId}` }, () => pull())
      .subscribe();
    return () => { cancelled = true; supabase!.removeChannel(ch); };
  }, [active, projectId, cloudOwner, myId]);

  // push local adds / edits / removes
  useEffect(() => {
    if (!active || !canWrite) return;
    const unsub = useComments.subscribe((state) => {
      const list = state.byProject[projectId!] || [];
      const seen = new Set<string>();
      for (const c of list) {
        seen.add(c.id);
        const h = hash(c);
        if (synced.current.get(c.id) !== h) {
          synced.current.set(c.id, h);
          supabase!.from("project_comments").upsert(toRow(c, cloudOwner!, projectId!, myId)).then(() => {}, () => {});
        }
      }
      for (const id of Array.from(synced.current.keys())) {
        if (!seen.has(id)) {
          synced.current.delete(id);
          supabase!.from("project_comments").delete().eq("id", id).then(() => {}, () => {});
        }
      }
    });
    return () => unsub();
  }, [active, canWrite, projectId, cloudOwner, myId]);

  return null;
}
