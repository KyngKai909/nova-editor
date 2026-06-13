"use client";

import {
  Monitor, Tablet, Smartphone, Eye, Pencil, Minus, Plus,
  PanelLeft, PanelRight, Upload, ArrowLeft, Code2, Columns2, LayoutGrid, HardDrive, Play, Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEditor, DEVICE_WIDTH, type Device } from "@/store/editorStore";
import { useProjects } from "@/store/projectsStore";
import { useAi } from "@/store/aiStore";
import GitBar from "@/components/github/GitBar";

const DEVICES: { id: Device; icon: React.ReactNode; label: string }[] = [
  { id: "desktop", icon: <Monitor size={15} />, label: "Desktop" },
  { id: "tablet", icon: <Tablet size={15} />, label: "Tablet" },
  { id: "mobile", icon: <Smartphone size={15} />, label: "Mobile" },
];

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
  const files = useEditor((s) => s.files);
  const activePath = useEditor((s) => s.activePath);
  const projectId = useEditor((s) => s.projectId);
  const isDevice = useProjects((s) => s.projects.find((p) => p.id === projectId)?.storage === "device");
  const device = useEditor((s) => s.device);
  const setDevice = useEditor((s) => s.setDevice);
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const previewMode = useEditor((s) => s.previewMode);
  const togglePreview = useEditor((s) => s.togglePreview);
  const viewMode = useEditor((s) => s.viewMode);
  const setViewMode = useEditor((s) => s.setViewMode);
  const aiOpen = useAi((s) => s.open);
  const setAiOpen = useAi((s) => s.setOpen);
  const changed = files.filter((f) => f.content !== f.original).length;

  const VIEWS = [
    { id: "design" as const, icon: <LayoutGrid size={14} />, label: "Design" },
    { id: "split" as const, icon: <Columns2 size={14} />, label: "Split" },
    { id: "code" as const, icon: <Code2 size={14} />, label: "Code" },
  ];

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3">
      {/* left cluster */}
      <div className="flex min-w-0 items-center gap-1.5">
        <Link
          href="/dashboard"
          className="grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-raise hover:text-ink"
          title="Dashboard"
        >
          <ArrowLeft size={15} />
        </Link>
        <button
          onClick={onToggleLeft}
          className={`grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-raise ${left ? "text-ink" : "text-ink-3"}`}
          title="Toggle layers"
        >
          <PanelLeft size={15} />
        </button>
        <button
          onClick={() => setAiOpen(!aiOpen)}
          className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors ${
            aiOpen ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-raise hover:text-ink"
          }`}
          title="Nova AI assistant"
        >
          <Sparkles size={14} />
          <span className="hidden lg:inline">AI</span>
        </button>
        <div className="ml-1 hidden min-w-0 items-center gap-2 sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="truncate font-mono text-[12px] text-ink-2">{activePath}</span>
          {isDevice && (
            <span title="Auto-saving to your folder on disk" className="flex items-center gap-1 rounded-full border border-line px-1.5 py-0.5 text-[10px] text-ink-3">
              <HardDrive size={10} /> auto-save
            </span>
          )}
          {changed > 0 && (
            <span title={isDevice ? "Changes since import — auto-saved to your folder" : "Unsaved changes (in browser)"} className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              {changed} edited
            </span>
          )}
        </div>
      </div>

      {/* center: breakpoints */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-lg border border-line bg-bg p-0.5">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              onClick={() => setDevice(d.id)}
              title={`${d.label} · ${DEVICE_WIDTH[d.id]}px`}
              className={`grid h-7 w-8 place-items-center rounded-md transition-colors ${
                device === d.id ? "bg-raise text-ink" : "text-ink-3 hover:text-ink"
              }`}
            >
              {d.icon}
            </button>
          ))}
        </div>
        <span className="hidden w-12 text-center text-[11px] tabular-nums text-ink-3 md:block">
          {DEVICE_WIDTH[device]}px
        </span>
        <div className="hidden items-center gap-0.5 rounded-lg border border-line bg-bg p-0.5 md:flex">
          <button onClick={() => setZoom(zoom - 0.1)} className="grid h-7 w-7 place-items-center rounded-md text-ink-3 hover:bg-raise hover:text-ink">
            <Minus size={13} />
          </button>
          <button onClick={() => setZoom(1)} className="w-11 text-center text-[11px] tabular-nums text-ink-2 hover:text-ink">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => setZoom(zoom + 0.1)} className="grid h-7 w-7 place-items-center rounded-md text-ink-3 hover:bg-raise hover:text-ink">
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* right cluster */}
      <div className="flex items-center gap-1.5">
        <div className="hidden items-center gap-1.5 sm:flex">
          <GitBar />
        </div>
        <div className="mr-1 hidden items-center gap-0.5 rounded-lg border border-line bg-bg p-0.5 sm:flex">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setViewMode(v.id)}
              title={v.label}
              className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors ${
                viewMode === v.id ? "bg-raise text-ink" : "text-ink-3 hover:text-ink"
              }`}
            >
              {v.icon}
              <span className="hidden lg:inline">{v.label}</span>
            </button>
          ))}
        </div>
        {isDevice && (
          <button
            onClick={() => window.open(`/run?project=${projectId}`, "_blank")}
            title="Run the full app in a browser sandbox (new tab)"
            className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-raise hover:text-ink"
          >
            <Play size={13} /> <span className="hidden lg:inline">Run app</span>
          </button>
        )}
        <button
          onClick={togglePreview}
          className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors ${
            previewMode ? "bg-accent text-accent-ink" : "border border-line text-ink-2 hover:bg-raise hover:text-ink"
          }`}
        >
          {previewMode ? <Pencil size={13} /> : <Eye size={13} />}
          <span className="hidden sm:inline">{previewMode ? "Edit" : "Preview"}</span>
        </button>
        <button
          onClick={onToggleRight}
          className={`grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-raise ${right ? "text-ink" : "text-ink-3"}`}
          title="Toggle inspector"
        >
          <PanelRight size={15} />
        </button>
        <button
          onClick={onExport}
          className="flex h-7 items-center gap-1.5 rounded-md bg-ink px-3 text-[12px] font-semibold text-bg transition-colors hover:bg-white"
        >
          <Upload size={13} />
          <span className="hidden sm:inline">Publish{changed ? ` (${changed})` : ""}</span>
        </button>
      </div>
    </header>
  );
}
