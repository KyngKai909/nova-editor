"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronRight, FileCode2, Type, Box, Image as ImageIcon, Link2, Square, Code2,
  MousePointer2, Files, Layers, Component, FolderTree, FileText, Copy, Trash2, GripVertical,
} from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { setDragComponent, getDragComponent } from "@/lib/dnd";
import type { EditorNode, SourceFile } from "@/lib/types";

// id of the layer row currently being dragged (module-level so it crosses rows)
let dragSrc: string | null = null;

// does this node's subtree contain the given id (i.e. is it an ancestor)?
function subtreeHas(node: EditorNode, id: string | null): boolean {
  if (!id) return false;
  for (const c of node.children) if (c.id === id || subtreeHas(c, id)) return true;
  return false;
}

function tagIcon(tag: string) {
  if (["p", "span", "h1", "h2", "h3", "h4", "h5", "h6", "b", "strong", "em", "small", "li"].includes(tag))
    return <Type size={12} />;
  if (tag === "img") return <ImageIcon size={12} />;
  if (tag === "a") return <Link2 size={12} />;
  if (["section", "div", "main", "header", "footer", "nav", "article", "aside", "ul"].includes(tag))
    return <Box size={12} />;
  return <Square size={12} />;
}

/* ── Layers ──────────────────────────────────────────────────────────────── */
function LayerRow({ node, depth }: { node: EditorNode; depth: number }) {
  const selectedId = useEditor((s) => s.selectedId);
  const hoveredId = useEditor((s) => s.hoveredId);
  const selectNode = useEditor((s) => s.selectNode);
  const hoverNode = useEditor((s) => s.hoverNode);
  const revealInCode = useEditor((s) => s.revealInCode);
  const duplicateNode = useEditor((s) => s.duplicateNode);
  const deleteNode = useEditor((s) => s.deleteNode);
  const moveNode = useEditor((s) => s.moveNode);
  const insertComponent = useEditor((s) => s.insertComponent);
  const isHtml = useEditor((s) => s.files.find((f) => f.path === s.activePath)?.kind === "html");
  const [open, setOpen] = useState(false); // collapsed by default
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [drop, setDrop] = useState<"before" | "after" | "inside" | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const hasChildren = node.children.length > 0;
  const active = selectedId === node.id;
  const peek = hoveredId === node.id;
  const label = node.textContent ? node.textContent.slice(0, 22) : node.tag;

  // auto-expand the path to the selected node, and scroll the active row in view
  useEffect(() => {
    if (selectedId && node.id !== selectedId && subtreeHas(node, selectedId)) setOpen(true);
  }, [selectedId, node]);
  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onDragOver = (e: React.DragEvent) => {
    if (dragSrc === node.id) return;
    if (!dragSrc && !getDragComponent()) return; // nothing draggable in play
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    setDrop(y < 0.3 ? "before" : y > 0.7 ? "after" : "inside");
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const comp = getDragComponent();
    if (comp && drop) insertComponent(comp, node.id, drop);
    else if (dragSrc && drop) moveNode(dragSrc, node.id, drop);
    dragSrc = null;
    setDragComponent(null);
    setDrop(null);
  };

  return (
    <div>
      <div
        ref={rowRef}
        draggable={isHtml}
        onDragStart={() => { dragSrc = node.id; }}
        onDragEnd={() => { dragSrc = null; setDrop(null); }}
        onDragOver={onDragOver}
        onDragLeave={() => setDrop(null)}
        onDrop={onDrop}
        onClick={() => selectNode(node.id)}
        onMouseEnter={() => hoverNode(node.id)}
        onMouseLeave={() => hoverNode(null)}
        onContextMenu={(e) => { e.preventDefault(); selectNode(node.id); setMenu({ x: e.clientX, y: e.clientY }); }}
        style={{ paddingLeft: 6 + depth * 13 }}
        className={`group relative flex h-[26px] cursor-pointer items-center gap-1.5 pr-2 text-[12px] transition-colors ${
          active ? "bg-accent/15 text-ink" : peek ? "bg-raise/60 text-ink" : "text-ink-2 hover:bg-raise/40"
        } ${drop === "inside" ? "ring-1 ring-inset ring-accent/60" : ""}`}
      >
        {drop === "before" && <span className="absolute inset-x-1 top-0 h-0.5 rounded bg-accent" />}
        {drop === "after" && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded bg-accent" />}
        <button
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded ${hasChildren ? "text-ink-3 hover:text-ink" : "opacity-0"}`}
        >
          <ChevronRight size={11} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <span className={`shrink-0 ${active ? "text-accent" : "text-ink-3"}`}>{tagIcon(node.tag)}</span>
        <span className="truncate">
          <span className={active ? "text-accent" : "text-ink-3"}>{node.tag}</span>
          {node.textContent && <span className="ml-1.5 text-ink-2">{label}</span>}
          {!node.textContent && node.classList[0] && (
            <span className="ml-1.5 font-mono text-[10px] text-ink-3">.{node.classList[0]}</span>
          )}
        </span>
      </div>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="fixed z-50 w-52 overflow-hidden rounded-lg border border-line-2 bg-surface py-1 shadow-2xl" style={{ left: menu.x, top: menu.y }}>
            <button onClick={() => { revealInCode(node.id); setMenu(null); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-ink-2 transition-colors hover:bg-raise">
              <Code2 size={13} className="text-accent" /> View in Code Editor
            </button>
            <button onClick={() => { selectNode(node.id); setMenu(null); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-ink-2 transition-colors hover:bg-raise">
              <MousePointer2 size={13} className="text-ink-3" /> Select on canvas
            </button>
            <div className="my-1 h-px bg-line" />
            <button onClick={() => { duplicateNode(node.id); setMenu(null); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-ink-2 transition-colors hover:bg-raise">
              <Copy size={13} className="text-ink-3" /> Duplicate
            </button>
            <button onClick={() => { deleteNode(node.id); setMenu(null); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-red-400 transition-colors hover:bg-raise">
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </>
      )}

      {hasChildren && open && node.children.map((c) => <LayerRow key={c.id} node={c} depth={depth + 1} />)}
    </div>
  );
}

/* ── File list (used by Pages / Components / Files) ──────────────────────── */
function FileRow({
  file, icon, view, draggable,
}: {
  file: SourceFile; icon: React.ReactNode; view: "design" | "split"; draggable?: boolean;
}) {
  const activePath = useEditor((s) => s.activePath);
  const selectFile = useEditor((s) => s.selectFile);
  const setViewMode = useEditor((s) => s.setViewMode);
  const active = activePath === file.path;
  return (
    <button
      draggable={draggable}
      onDragStart={() => draggable && setDragComponent(file.path)}
      onDragEnd={() => setDragComponent(null)}
      onClick={() => { selectFile(file.path); setViewMode(view); }}
      title={
        draggable
          ? `${file.name} — drag onto a JSX page, or click to edit`
          : view === "split"
          ? `${file.path} — open in code editor`
          : file.path
      }
      className={`group flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
        active ? "bg-raise text-ink" : "text-ink-2 hover:bg-raise/40"
      }`}
    >
      {draggable && (
        <GripVertical size={12} className="shrink-0 text-ink-3/40 transition-colors group-hover:text-ink-3" />
      )}
      <span className={`shrink-0 ${active ? "text-accent" : "text-ink-3"}`}>{icon}</span>
      <span className="truncate">{file.name}</span>
      <span className="ml-auto shrink-0 text-[9px] uppercase text-ink-3">{file.kind}</span>
    </button>
  );
}

/* ── Panel ───────────────────────────────────────────────────────────────── */
type Tab = "pages" | "layers" | "components" | "files";
const TABS: { id: Tab; icon: React.ReactNode; label: string }[] = [
  { id: "pages", icon: <Files size={15} />, label: "Pages" },
  { id: "layers", icon: <Layers size={15} />, label: "Layers" },
  { id: "components", icon: <Component size={15} />, label: "Components" },
  { id: "files", icon: <FolderTree size={15} />, label: "Files" },
];

export default function LeftPanel() {
  const files = useEditor((s) => s.files);
  const tree = useEditor((s) => s.tree);
  const selectedId = useEditor((s) => s.selectedId);
  const [tab, setTab] = useState<Tab>("layers");

  // selecting an element on the canvas jumps to the Layers tab to reveal it
  useEffect(() => {
    if (selectedId) setTab("layers");
  }, [selectedId]);

  const pages = files.filter((f) => f.category === "page");
  const components = files.filter((f) => f.category === "component");
  const counts: Record<Tab, number> = {
    pages: pages.length, layers: 0, components: components.length, files: files.length,
  };
  const activeLabel = TABS.find((t) => t.id === tab)!.label;

  return (
    <div className="flex h-full flex-col">
      {/* icon tab rail */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-line p-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            title={t.label}
            className={`relative grid h-8 flex-1 place-items-center rounded-md transition-colors ${
              tab === t.id ? "bg-raise text-ink" : "text-ink-3 hover:text-ink"
            }`}
          >
            {t.icon}
            {counts[t.id] > 0 && t.id !== "layers" && (
              <span className="absolute right-1 top-0.5 text-[8px] tabular-nums text-ink-3">{counts[t.id]}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex h-7 shrink-0 items-center px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        {activeLabel}
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-2">
        {tab === "layers" && (
          tree.length ? tree.map((n) => <LayerRow key={n.id} node={n} depth={0} />)
            : <Empty>Select a page or component to see its layers.</Empty>
        )}

        {tab === "pages" && (
          pages.length ? pages.map((f) => <FileRow key={f.path} file={f} icon={<FileText size={13} />} view="design" />)
            : <Empty>No pages detected.</Empty>
        )}

        {tab === "components" && (
          components.length ? (
            <>
              {components.map((f) => <FileRow key={f.path} file={f} icon={<Component size={13} />} view="design" draggable />)}
              <p className="px-3 pt-3 text-[10.5px] leading-relaxed text-ink-3">
                Click to edit in isolation, or drag onto a JSX page (canvas or layer) to insert an instance.
              </p>
            </>
          ) : <Empty>No components — open a .jsx / .tsx file to edit one in isolation.</Empty>
        )}

        {tab === "files" && files.map((f) => <FileRow key={f.path} file={f} icon={<FileCode2 size={13} />} view="split" />)}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-4 text-[12px] leading-relaxed text-ink-3">{children}</p>;
}
