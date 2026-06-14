"use client";

import { useEffect } from "react";
import { useEditor } from "@/store/editorStore";
import { supabase } from "@/lib/supabase";

// For a SHARED project (ownerId set — i.e. a collaborator opened someone else's
// project), an owner/editor's edits push back to the OWNER's cloud_projects row
// so everyone stays in sync. RLS still enforces that only editors can write, so
// a viewer/commentor's attempt is a no-op server-side too. The owner editing
// their OWN project has ownerId=null and is handled by the normal SyncManager.
export default function CollabSync() {
  const ownerId = useEditor((s) => s.ownerId);
  const role = useEditor((s) => s.role);
  const projectId = useEditor((s) => s.projectId);
  const files = useEditor((s) => s.files);

  useEffect(() => {
    if (!supabase || !ownerId || !projectId || !files.length) return;
    if (role !== "owner" && role !== "editor") return;
    const t = setTimeout(async () => {
      // Merge into the existing cloud record so name/baseHref/etc. are preserved.
      const { data: row } = await supabase!
        .from("cloud_projects")
        .select("data")
        .eq("user_id", ownerId)
        .eq("id", projectId)
        .single();
      const base = (row?.data as Record<string, unknown>) || { id: projectId };
      const rec = { ...base, id: projectId, files, updatedAt: Date.now() };
      await supabase!
        .from("cloud_projects")
        .update({ data: rec, updated_at: new Date().toISOString() })
        .eq("user_id", ownerId)
        .eq("id", projectId);
    }, 1500);
    return () => clearTimeout(t);
  }, [files, ownerId, projectId, role]);

  return null;
}
