"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  MoreHorizontal, Globe, GitBranch, FileCode2, Trash2, ExternalLink, Copy, HardDrive, Download,
} from "lucide-react";
import type { ProjectRecord } from "@/store/projectsStore";
import { downloadZip } from "@/lib/zip";

const KIND_LABEL: Record<string, string> = {
  folder: "Folder", github: "GitHub", paste: "Snippet", sample: "Sample",
};

function relativeTime(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function ProjectCard({
  project,
  onOpen,
  onDelete,
  onDuplicate,
  onTogglePublish,
}: {
  project: ProjectRecord;
  onOpen: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onTogglePublish: () => void;
}) {
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLButtonElement>(null);
  // Render the preview at a fixed 1280px "desktop" width and scale it so the
  // scaled width always equals the card width — fills the 16:10 box at any size.
  const [scale, setScale] = useState(0.28);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const openMenu = () => {
    const r = menuBtnRef.current!.getBoundingClientRect();
    setMenu({ top: r.bottom + 4, left: Math.min(r.right - 176, window.innerWidth - 184) });
  };

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / 1280);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const htmlFile = project.files?.find((f) => f.kind === "html");
  const previewDoc = useMemo(() => {
    if (!htmlFile) return null;
    const isFull = /<html[\s>]/i.test(htmlFile.content);
    if (isFull) return htmlFile.content; // complete document, render as-is
    const base = project.baseHref ? `<base href="${project.baseHref}">` : "";
    return `<!doctype html><html><head><meta charset="utf-8">${base}<script src="https://cdn.tailwindcss.com"></script><style>body{margin:0}</style></head><body>${htmlFile.content}</body></html>`;
  }, [htmlFile, project.baseHref]);

  const initial = project.name.charAt(0).toUpperCase();

  return (
    <div className="group relative flex h-full flex-col rounded-2xl border border-line bg-surface transition-colors hover:border-line-2">
      {/* preview */}
      <button
        ref={previewRef}
        onClick={onOpen}
        className="relative block aspect-[16/10] w-full overflow-hidden rounded-t-2xl border-b border-line bg-bg-2"
      >
        {previewDoc ? (
          <div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ width: 1280, height: 1280 * 0.625, transform: `scale(${scale})` }}>
            <iframe title={project.name} sandbox="allow-scripts" srcDoc={previewDoc} className="h-full w-full border-0 bg-white" />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(204,255,2,0.16),transparent_60%)]">
            <span className="font-display text-5xl font-semibold text-ink-3">{initial}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg-2/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-line bg-bg/80 px-2 py-0.5 text-[10px] font-medium text-ink-2 backdrop-blur">
          {project.storage === "device" ? <HardDrive size={11} /> : <FileCode2 size={11} />}
          {project.storage === "device" ? "On device" : KIND_LABEL[project.kind]}
        </span>
      </button>

      {/* meta */}
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="truncate font-display text-[15px] font-semibold tracking-tight">{project.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-3">
            <span>{relativeTime(project.updatedAt)}</span>
            <span>·</span>
            <span>{project.files?.length ?? "—"} files</span>
          </div>
        </button>

        <div className="flex items-center gap-1.5">
          {(project.github || project.status.github) && (
            <Tip label={project.github ? `GitHub: ${project.github.owner}/${project.github.repo}` : "Imported from GitHub"}>
              <span className="grid h-6 w-6 place-items-center rounded-md bg-raise text-ink-2 transition-colors hover:text-ink">
                <GitBranch size={13} />
              </span>
            </Tip>
          )}
          <Tip label={project.status.published ? "Published" : "Draft — not published"}>
            <span
              className={`grid h-6 w-6 place-items-center rounded-md transition-colors ${
                project.status.published ? "bg-accent/15 text-accent" : "bg-raise text-ink-3 hover:text-ink"
              }`}
            >
              <Globe size={13} />
            </span>
          </Tip>

          <Tip label="More actions">
            <button ref={menuBtnRef} onClick={openMenu} className="grid h-6 w-6 place-items-center rounded-md text-ink-3 transition-colors hover:bg-raise hover:text-ink">
              <MoreHorizontal size={15} />
            </button>
          </Tip>
        </div>
      </div>

      {menu &&
        createPortal(
          <div
            className="fixed z-[70] w-44 overflow-hidden rounded-lg border border-line-2 bg-surface py-1 shadow-2xl"
            style={{ top: menu.top, left: menu.left }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <MenuItem icon={<ExternalLink size={13} />} label="Open in editor" onClick={() => { setMenu(null); onOpen(); }} />
            <MenuItem icon={<Globe size={13} />} label={project.status.published ? "Unpublish" : "Publish"} onClick={() => { onTogglePublish(); setMenu(null); }} />
            <MenuItem icon={<Copy size={13} />} label="Duplicate" onClick={() => { onDuplicate(); setMenu(null); }} />
            {!!project.files?.length && (
              <MenuItem
                icon={<Download size={13} />}
                label="Download .zip"
                onClick={() => {
                  downloadZip(project.name, project.files!.map((f) => ({ path: f.path, content: f.content })));
                  setMenu(null);
                }}
              />
            )}
            <div className="my-1 h-px bg-line" />
            <MenuItem icon={<Trash2 size={13} />} label="Delete" danger onClick={() => { onDelete(); setMenu(null); }} />
          </div>,
          document.body
        )}
    </div>
  );
}

// Small styled tooltip on hover (shows immediately, unlike the native delay).
function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-line-2 bg-bg px-2 py-1 text-[10px] text-ink-2 opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">
        {label}
      </span>
    </span>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-raise ${
        danger ? "text-red-400" : "text-ink-2"
      }`}
    >
      {icon} {label}
    </button>
  );
}
