"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useEditor } from "@/store/editorStore";
import ImportPanel from "@/components/editor/ImportPanel";
import EditorShell from "@/components/editor/EditorShell";

export default function EditorPage() {
  const router = useRouter();
  const files = useEditor((s) => s.files);
  const projectId = useEditor((s) => s.projectId);

  // Canonicalize: if a project is loaded, reflect it in the URL (/editor/{id}).
  useEffect(() => {
    if (files.length && projectId) router.replace(`/editor/${projectId}`);
  }, [files.length, projectId, router]);

  // A loaded-but-unsaved import (no projectId) still edits here; otherwise import.
  if (files.length) return <EditorShell />;
  return <ImportPanel />;
}
