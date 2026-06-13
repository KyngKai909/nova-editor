"use client";

import { useEditor } from "@/store/editorStore";
import ImportPanel from "@/components/editor/ImportPanel";
import EditorShell from "@/components/editor/EditorShell";

export default function EditorPage() {
  const files = useEditor((s) => s.files);
  return files.length ? <EditorShell /> : <ImportPanel />;
}
