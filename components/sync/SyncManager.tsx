"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/store/authStore";
import { useProjects } from "@/store/projectsStore";
import { canSync, pullAndMerge, pushProject, pushDelete, subscribeRealtime, resetSync } from "@/lib/cloudSync";

// Headless: drives cloud sync while signed in (and Pro/admin). Renders nothing.
export default function SyncManager() {
  const profile = useAuth((s) => s.profile);
  const signedIn = useAuth((s) => s.signedIn);
  const active = signedIn && !!profile && canSync();
  const lastSynced = useRef<Map<string, number>>(new Map());

  // initial pull + realtime + reconnect flush
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      await pullAndMerge();
      if (cancelled) return;
      useProjects.getState().projects.forEach((p) => lastSynced.current.set(p.id, p.updatedAt || 0));
    })();
    const unsub = subscribeRealtime(() => {
      if (!cancelled) pullAndMerge();
    });
    const onOnline = () => pullAndMerge();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      unsub();
      window.removeEventListener("online", onOnline);
      resetSync();
    };
  }, [active]);

  // push local changes as they happen (offline → these just fail and re-flush on
  // reconnect via the online listener / next pull)
  useEffect(() => {
    if (!active) return;
    const unsub = useProjects.subscribe((state) => {
      const seen = new Set<string>();
      for (const p of state.projects) {
        seen.add(p.id);
        const last = lastSynced.current.get(p.id);
        if (last === undefined || (p.updatedAt || 0) > last) {
          lastSynced.current.set(p.id, p.updatedAt || 0);
          pushProject(p).catch(() => {});
        }
      }
      for (const id of Array.from(lastSynced.current.keys())) {
        if (!seen.has(id)) {
          lastSynced.current.delete(id);
          pushDelete(id).catch(() => {});
        }
      }
    });
    return () => unsub();
  }, [active]);

  return null;
}
