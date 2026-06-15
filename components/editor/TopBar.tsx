"use client";

import { useEffect, useState } from "react";
import {
  Monitor, Tablet, Smartphone, Eye, Pencil, Minus, Plus,
  PanelLeft, PanelRight, Upload, ArrowLeft, Code2, Columns2, LayoutGrid, HardDrive, Play, Sparkles,
  Users, Undo2, Redo2,
} from "lucide-react";
import Link from "next/link";
import { useEditor, DEVICE_WIDTH, type Device } from "@/store/editorStore";
import { useProjects } from "@/store/projectsStore";
import { useAi } from "@/store/aiStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useRouteTransition } from "@/components/transition/RouteTransition";
import GitBar from "@/components/github/GitBar";
import CollaboratorsModal from "@/components/collab/CollaboratorsModal";

const ROLE_LABEL: Record<string, string> = { editor: "Editor", commentor: "Commenter", viewer: "Viewer" };

const DEVICES: { id: Device; icon: React.ReactNode; label: string }[] = [
  { id: "desktop", icon: <Monitor size={15} />, label: "Desktop · 1280px" },
  { id: "tablet", icon: <Tablet size={15} />, label: "Tablet · 834px" },
  { id: "mobile", icon: <Smartphone size={15} />, label: "Mobile · 390px" },
];

const Divider = () => <div className="mx-1 hidden h-5 w-px bg-line lg:block" />;

// Editable canvas width — type any size to preview at it (Webflow/Webstudio-style).
function WidthField() {
  const customWidth = useEditor((s) => s.customWidth);
  const device = useEditor((s) => s.device);
  const setCustomWidth = useEditor((s) => s.setCustomWidth);
  const w = customWidth ?? DEVICE_WIDTH[device];
  const [v, setV] = useState(String(w));
  useEffect(() => setV(String(w)), [w]);
  const commit = () => {
    const n = parseInt(v, 10);
    if (n && n !== w) setCustomWidth(n);
    else setV(String(w));
  };
  return (
    <div title="Canvas width — type a custom size" className="flex h-7 items-center rounded-md px-1.5">
      <input
        value={v}
        onChange={(e) => setV(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        inputMode="numeric"
        className={`w-9 bg-transparent text-right text-[11px] tabular-nums outline-none ${customWidth ? "text-accent" : "text-ink-2"}`}
      />
      <span className="ml-0.5 text-[10px] text-ink-3">px</span>
    </div>
  );
}

export default function TopBar({
  onExport,
  left,
  right,
  onToggleLeft,
  onToggleRight,
}: {
  onExport: () => void;
  left: boolean;
  right: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
}) {
  const { navigate } = useRouteTransition();
  const files = useEditor((s) => s.files);
  const activePath = useEditor((s) => s.activePath);
  const projectId = useEditor((s) => s.projectId);
  const isDevice = useProjects((s) => s.projects.find((p) => p.id === projectId)?.storage === "device");
  const device = useEditor((s) => s.device);
  const customWidth = useEditor((s) => s.customWidth);
  const setDevice = useEditor((s) => s.setDevice);
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const previewMode = useEditor((s) => s.previewMode);
  const togglePreview = useEditor((s) => s.togglePreview);
  const viewMode = useEditor((s) => s.viewMode);
  const setViewMode = useEditor((s) => s.setViewMode);
  const aiOpen = useAi((s) => s.open);
  const setAiOpen = useAi((s) => s.setOpen);
  const role = useEditor((s) => s.role);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const [shareOpen, setShareOpen] = useState(false);
  const changed = files.filter((f) => f.content !== f.original).length;
  const canShare = isSupabaseConfigured() && role === "owner" && !!projectId;
  const canEdit = role === "owner" || role === "editor";

  const VIEWS = [
    { id: "design" as const, icon: <LayoutGrid size={14} />, label: "Design" },
    { id: "split" as const, icon: <Columns2 size={14} />, label: "Split" },
    { id: "code" as const, icon: <Code2 size={14} />, label: "Code" },
  ];

  const iconBtn = "grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-raise hover:text-ink";

  return (
    <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line bg-surface px-3">
      {/* LEFT — navigate · history · file */}
      <div className="flex min-w-0 items-center gap-1">
        <Link href="/dashboard" onClick={(e) => { e.preventDefault(); navigate("/dashboard"); }} title="Dashboard" className={`${iconBtn} text-ink-3`}>
          <ArrowLeft size={15} />
        </Link>
        <button onClick={onToggleLeft} title="Toggle layers" className={`${iconBtn} ${left ? "text-ink" : "text-ink-3"}`}>
          <PanelLeft size={15} />
        </button>
        <button
          onClick={() => setAiOpen(!aiOpen)}
          title="Nova AI assistant"
          className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors ${aiOpen ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-raise hover:text-ink"}`}
        >
          <Sparkles size={14} />
          <span className="hidden lg:inline">AI</span>
        </button>

        {canEdit && (
          <>
            <Divider />
            {/* preventDefault on mousedown so the button doesn't steal focus from
                a focused inspector input — otherwise the input blur-commits a
                phantom edit and the first undo just reverts that, not your change. */}
            <button onMouseDown={(e) => e.preventDefault()} onClick={undo} disabled={!canUndo} title="Undo (⌘Z)" className={`${iconBtn} text-ink-3 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-3`}>
              <Undo2 size={15} />
            </button>
            <button onMouseDown={(e) => e.preventDefault()} onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)" className={`${iconBtn} text-ink-3 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-3`}>
              <Redo2 size={15} />
            </button>
          </>
        )}

        <div className="ml-1.5 hidden min-w-0 items-center gap-2 lg:flex">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span className="truncate font-mono text-[12px] text-ink-2">{activePath}</span>
          {isDevice && (
            <span title="Auto-saving to your folder on disk" className="flex shrink-0 items-center gap-1 rounded-full border border-line px-1.5 py-0.5 text-[10px] text-ink-3">
              <HardDrive size={10} /> auto-save
            </span>
          )}
          {changed > 0 && (
            <span title={isDevice ? "Changes since import — auto-saved to your folder" : "Unsaved changes (in browser)"} className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              {changed} edited
            </span>
          )}
        </div>
      </div>

      {/* CENTER — canvas size, dead center (device presets + custom width) */}
      <div className="hidden items-center rounded-lg border border-line bg-bg p-0.5 md:flex">
        {DEVICES.map((d) => (
          <button
            key={d.id}
            onClick={() => setDevice(d.id)}
            title={d.label}
            className={`grid h-7 w-8 place-items-center rounded-md transition-colors ${device === d.id && !customWidth ? "bg-raise text-ink" : "text-ink-3 hover:text-ink"}`}
          >
            {d.icon}
          </button>
        ))}
        <div className="mx-0.5 h-5 w-px bg-line" />
        <WidthField />
        {/* zoom lives in the same canvas-size container, divided like the px input */}
        <div className="mx-0.5 h-5 w-px bg-line" />
        <button onClick={() => setZoom(zoom - 0.1)} title="Zoom out" className={`${iconBtn} text-ink-3`}><Minus size={13} /></button>
        <button onClick={() => setZoom(1)} title="Reset zoom" className="w-10 text-center text-[11px] tabular-nums text-ink-2 hover:text-ink">{Math.round(zoom * 100)}%</button>
        <button onClick={() => setZoom(zoom + 0.1)} title="Zoom in" className={`${iconBtn} text-ink-3`}><Plus size={13} /></button>
      </div>

      {/* RIGHT — view · result · ship */}
      <div className="flex items-center justify-end gap-1">
        <div className="hidden items-center gap-0.5 rounded-lg border border-line bg-bg p-0.5 sm:flex">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setViewMode(v.id)}
              title={v.label}
              className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors ${viewMode === v.id ? "bg-raise text-ink" : "text-ink-3 hover:text-ink"}`}
            >
              {v.icon}
              <span className="hidden xl:inline">{v.label}</span>
            </button>
          ))}
        </div>

        <Divider />

        {isDevice && (
          <button onClick={() => window.open(`/run?project=${projectId}`, "_blank")} title="Run the full app in a sandbox (new tab)" className={`${iconBtn} border border-line text-ink-2`}>
            <Play size={13} />
          </button>
        )}
        <button
          onClick={togglePreview}
          title={previewMode ? "Back to editing" : "Preview"}
          className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors ${previewMode ? "bg-accent text-accent-ink" : "border border-line text-ink-2 hover:bg-raise hover:text-ink"}`}
        >
          {previewMode ? <Pencil size={13} /> : <Eye size={13} />}
          <span className="hidden lg:inline">{previewMode ? "Edit" : "Preview"}</span>
        </button>

        <Divider />

        <div className="hidden sm:block"><GitBar /></div>
        {canShare && (
          <button onClick={() => setShareOpen(true)} title="Invite collaborators" className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-raise hover:text-ink">
            <Users size={13} /> <span className="hidden lg:inline">Share</span>
          </button>
        )}
        {role !== "owner" && (
          <span title={`You have ${ROLE_LABEL[role] || role} access`} className="flex h-7 items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 text-[11px] font-medium text-accent">
            <Users size={12} /> <span className="hidden lg:inline">{ROLE_LABEL[role] || role}</span>
          </span>
        )}
        <button onClick={onToggleRight} title="Toggle inspector" className={`${iconBtn} ${right ? "text-ink" : "text-ink-3"}`}>
          <PanelRight size={15} />
        </button>
        <button onClick={onExport} className="flex h-7 items-center gap-1.5 rounded-md bg-ink px-3 text-[12px] font-semibold text-bg transition-colors hover:bg-white">
          <Upload size={13} />
          <span className="hidden sm:inline">Publish{changed ? ` (${changed})` : ""}</span>
        </button>
      </div>

      {shareOpen && <CollaboratorsModal onClose={() => setShareOpen(false)} />}
    </header>
  );
}
