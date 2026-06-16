"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useProjects } from "@/store/projectsStore";
import { useOpenProject } from "@/components/editor/useOpenProject";
import EditorShell from "@/components/editor/EditorShell";

// Per-project editor route: /editor/{projectId}. If the project is already loaded
// (navigated from the dashboard) it renders immediately; on a deep link / refresh
// it rehydrates the record from the persisted projects store and loads it.
export default function EditorProjectPage() {
  const params = useParams();
  const projectId = String(params.projectId || "");
  const loadedId = useEditor((s) => s.projectId);
  const hasFiles = useEditor((s) => s.files.length > 0);
  const projects = useProjects((s) => s.projects);
  const open = useOpenProject();
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">("loading");

  // The persisted projects store rehydrates asynchronously (encrypted storage), so
  // wait for that before deciding a project doesn't exist — otherwise a refresh /
  // deep link races the store and falsely 404s.
  const persist = (useProjects as unknown as { persist?: { hasHydrated: () => boolean; onFinishHydration: (cb: () => void) => () => void } }).persist;
  const [hydrated, setHydrated] = useState(() => persist?.hasHydrated?.() ?? true);
  useEffect(() => {
    if (hydrated || !persist) return;
    if (persist.hasHydrated()) { setHydrated(true); return; }
    return persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated, persist]);

  useEffect(() => {
    if (loadedId === projectId && hasFiles) { setStatus("ready"); return; }
    if (!hydrated) { setStatus("loading"); return; }
    const p = projects.find((x) => x.id === projectId);
    if (!p) { setStatus("notfound"); return; }
    let alive = true;
    setStatus("loading");
    open(p).then(() => alive && setStatus("ready")).catch(() => alive && setStatus("notfound"));
    return () => { alive = false; };
  }, [projectId, loadedId, hasFiles, projects, open, hydrated]);

  if (loadedId === projectId && hasFiles) return <EditorShell />;
  if (status === "notfound") {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-bg px-6 text-center">
        <div>
          <p className="text-[15px] font-semibold text-ink">Project not found</p>
          <p className="mt-1 text-[13px] text-ink-3">It may have been opened on another device or removed.</p>
          <Link href="/dashboard" className="mt-4 inline-block rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink">Back to dashboard</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-bg">
      <Loader2 size={22} className="animate-spin text-accent" />
    </div>
  );
}
