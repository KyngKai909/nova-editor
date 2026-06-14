"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import TopBar from "./TopBar";
import LeftPanel from "./LeftPanel";
import Canvas from "./Canvas";
import Inspector from "./Inspector";
import ExportPanel from "./ExportPanel";
import AiPanel from "./AiPanel";
import CollabSync from "@/components/sync/CollabSync";
import CommentSync from "@/components/sync/CommentSync";
import { useEditor } from "@/store/editorStore";
import { useProjects } from "@/store/projectsStore";
import { useSettings } from "@/store/settingsStore";
import { fsSupported } from "@/lib/fileSystem";
import { saveProjectToDevice } from "@/lib/deviceProject";

const CodeEditor = dynamic(() => import("./CodeEditor"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-ink-3">Loading editor…</div>,
});

export default function EditorShell() {
  const previewMode = useEditor((s) => s.previewMode);
  const viewMode = useEditor((s) => s.viewMode);
  const notice = useEditor((s) => s.notice);
  const setNotice = useEditor((s) => s.setNotice);
  const files = useEditor((s) => s.files);
  const projectId = useEditor((s) => s.projectId);
  const updateProject = useProjects((s) => s.updateProject);
  const [showExport, setShowExport] = useState(false);
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  const [mobile, setMobile] = useState(false);

  // auto-dismiss the transient notice
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2400);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  // autosave: persist the working files (with edits + diff baseline) back to the
  // project so changes survive navigating to the dashboard or closing the browser.
  useEffect(() => {
    if (!projectId || !files.length) return;
    const t = setTimeout(() => updateProject(projectId, { files }), 900);
    return () => clearTimeout(t);
  }, [files, projectId, updateProject]);

  // IDE-style autosave to disk: device-backed projects write their files straight
  // back to the folder on a debounce (the folder handle is already authorized).
  useEffect(() => {
    if (!projectId || !files.length || !fsSupported()) return;
    if (!useSettings.getState().autoSaveToDisk) return;
    const proj = useProjects.getState().projects.find((p) => p.id === projectId);
    if (proj?.storage !== "device") return;
    if (!files.some((f) => f.content !== f.original)) return; // nothing changed
    const t = setTimeout(() => {
      saveProjectToDevice(projectId, files.map((f) => ({ path: f.path, content: f.content }))).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [files, projectId]);

  // keyboard shortcuts: Delete removes the selected node, Cmd/Ctrl+D duplicates
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const st = useEditor.getState();
      // Cmd/Ctrl+S → save a device-backed project to its folder
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        const proj = useProjects.getState().projects.find((p) => p.id === st.projectId);
        if (proj?.storage === "device" && fsSupported()) {
          e.preventDefault();
          saveProjectToDevice(st.projectId!, st.files.map((f) => ({ path: f.path, content: f.content })))
            .then(() => { st.markCommitted(); st.setNotice("Saved to folder on disk"); })
            .catch((er) => { if (er?.name !== "AbortError") st.setNotice(er.message); });
        }
        return;
      }
      if (!st.selectedId) return;
      if ((e.key === "Delete" || e.key === "Backspace") && !st.previewMode) {
        e.preventDefault();
        st.deleteNode(st.selectedId);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        st.duplicateNode(st.selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // on small screens, collapse both panels so the canvas is the focus
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      setMobile(mq.matches);
      if (mq.matches) {
        setLeft(false);
        setRight(false);
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const showLeft = left && !previewMode;
  const showRight = right && !previewMode;
  const drawerOpen = mobile && (showLeft || showRight);

  // on mobile only one drawer at a time
  const openLeft = () => {
    setLeft((v) => !v);
    if (mobile) setRight(false);
  };
  const openRight = () => {
    setRight((v) => !v);
    if (mobile) setLeft(false);
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-bg-2">
      <CollabSync />
      <CommentSync />
      <TopBar
        onExport={() => setShowExport(true)}
        left={left}
        right={right}
        onToggleLeft={openLeft}
        onToggleRight={openRight}
      />

      <div className="relative flex min-h-0 flex-1">
        {/* AI assistant — overlays the left side when open */}
        <AiPanel />

        {/* left panel */}
        <aside
          className={`z-30 h-full shrink-0 overflow-hidden border-r border-line bg-surface transition-[width] duration-200 ${
            showLeft ? "w-[264px]" : "w-0"
          } max-md:absolute max-md:left-0 max-md:top-0 ${showLeft ? "max-md:shadow-2xl" : ""}`}
        >
          <div className="h-full w-[264px]">
            <LeftPanel />
          </div>
        </aside>

        {/* canvas + code */}
        <main className="relative flex min-w-0 flex-1">
          {viewMode !== "code" && (
            <div className={`relative min-w-0 ${viewMode === "split" ? "w-1/2 border-r border-line" : "flex-1"} bg-[radial-gradient(circle_at_50%_-20%,rgba(204,255,2,0.05),transparent_60%)]`}>
              <Canvas />
            </div>
          )}
          {viewMode !== "design" && (
            <div className={`relative min-w-0 ${viewMode === "split" ? "w-1/2" : "flex-1"}`}>
              <CodeEditor />
            </div>
          )}
        </main>

        {/* inspector */}
        <aside
          className={`z-30 h-full shrink-0 overflow-hidden border-l border-line bg-surface transition-[width] duration-200 ${
            showRight ? "w-[288px]" : "w-0"
          } max-md:absolute max-md:right-0 max-md:top-0 ${showRight ? "max-md:shadow-2xl" : ""}`}
        >
          <div className="h-full w-[288px]">
            <Inspector />
          </div>
        </aside>

        {/* mobile drawer backdrop */}
        {drawerOpen && (
          <div
            className="absolute inset-0 z-20 bg-black/50 md:hidden"
            onClick={() => {
              setLeft(false);
              setRight(false);
            }}
          />
        )}
      </div>

      {notice && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 animate-fade-up rounded-full border border-line-2 bg-surface px-4 py-2 text-[12.5px] text-ink shadow-2xl">
          {notice}
        </div>
      )}

      {showExport && <ExportPanel onClose={() => setShowExport(false)} />}
    </div>
  );
}
