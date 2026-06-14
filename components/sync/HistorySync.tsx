"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/authStore";
import { useEditor } from "@/store/editorStore";
import { pushCloudHistory, pullCloudHistory } from "@/lib/cloudHistory";

// Sync the project's undo/redo history to the cloud so it follows you across
// devices (and stays with shared projects). Active for:
//   • your OWN project, on a paid plan (Pro / Studio / admin), or
//   • a SHARED project where you're the owner or an editor.
// Local IndexedDB history still works offline; the cloud copy wins on open.
export default function HistorySync() {
  const projectId = useEditor((s) => s.projectId);
  const ownerId = useEditor((s) => s.ownerId);
  const role = useEditor((s) => s.role);
  const past = useEditor((s) => s.past);
  const future = useEditor((s) => s.future);
  const profile = useAuth((s) => s.profile);

  const cloudOwner = ownerId || profile?.id || null;
  const isPaid = !!profile && (profile.plan === "pro" || profile.plan === "studio" || !!profile.is_admin);
  // shared project → owner/editor may sync; own project → needs a paid plan.
  const active = !!supabase && !!projectId && !!cloudOwner && (ownerId ? role === "owner" || role === "editor" : isPaid);

  const lastPushed = useRef<string>("");

  // Pull on open — the cloud is the cross-device source of truth.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    pullCloudHistory(cloudOwner!, projectId!).then((h) => {
      if (cancelled || !h || useEditor.getState().projectId !== projectId) return;
      const next = { past: Array.isArray(h.past) ? h.past : [], future: Array.isArray(h.future) ? h.future : [] };
      lastPushed.current = JSON.stringify(next).slice(0, 256) + ":" + (next.past.length + next.future.length);
      useEditor.setState(next as any);
    });
    return () => { cancelled = true; };
  }, [active, projectId, cloudOwner]);

  // Push on change (debounced). Skip the no-op echo right after a pull.
  useEffect(() => {
    if (!active) return;
    const sig = JSON.stringify({ past, future }).slice(0, 256) + ":" + (past.length + future.length);
    if (sig === lastPushed.current) return;
    const t = setTimeout(() => {
      lastPushed.current = sig;
      pushCloudHistory(cloudOwner!, projectId!, { past, future });
    }, 3000);
    return () => clearTimeout(t);
  }, [active, past, future, cloudOwner, projectId]);

  return null;
}
