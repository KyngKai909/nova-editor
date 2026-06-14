"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronRight, FileCode2, Type, Box, Image as ImageIcon, Link2, Square, Code2,
  MousePointer2, Files, Layers, Component, FolderTree, FileText, Copy, Trash2, GripVertical,
  Upload, Columns2, Rows2, Grid3x3, Heading, List, Minus, TextCursorInput, RectangleHorizontal,
} from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { setDragComponent, getDragComponent, setDragElement, getDragElement } from "@/lib/dnd";
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
  const insertElement = useEditor((s) => s.insertElement);
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
    if (!dragSrc && !getDragComponent() && !getDragElement()) return; // nothing draggable in play
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    setDrop(y < 0.3 ? "before" : y > 0.7 ? "after" : "inside");
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const comp = getDragComponent();
    const el = getDragElement();
    if (comp && drop) insertComponent(comp, node.id, drop);
    else if (el && drop) insertElement(el, node.id, drop);
    else if (dragSrc && drop) moveNode(dragSrc, node.id, drop);
    dragSrc = null;
    setDragComponent(null);
    setDragElement(null);
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

/* ── Assets ──────────────────────────────────────────────────────────────── */
function assetKind(path: string): "image" | "svg" | "gif" | "font" | "other" {
  const p = path.toLowerCase();
  if (p.endsWith(".svg")) return "svg";
  if (p.endsWith(".gif")) return "gif";
  if (/\.(png|jpe?g|webp|avif|ico)$/.test(p)) return "image";
  if (/\.(otf|ttf|woff2?)$/.test(p)) return "font";
  return "other";
}

function AssetsTab() {
  const assets = useEditor((s) => s.assets);
  const addAsset = useEditor((s) => s.addAsset);
  const applyAsset = useEditor((s) => s.applyAsset);
  const selectedId = useEditor((s) => s.selectedId);
  const fileRef = useRef<HTMLInputElement>(null);

  const entries = Object.entries(assets);
  const groups: Record<string, [string, string][]> = { image: [], svg: [], gif: [], font: [], other: [] };
  for (const [path, url] of entries) groups[assetKind(path)].push([path, url]);

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) Array.from(e.target.files).forEach((f) => addAsset(f));
    e.target.value = "";
  };

  const visual: { key: string; label: string }[] = [
    { key: "image", label: "Images" },
    { key: "svg", label: "SVG" },
    { key: "gif", label: "GIFs" },
  ];

  return (
    <div className="p-2">
      <input ref={fileRef} type="file" multiple accept="image/*,.svg,.gif,.woff,.woff2,.otf,.ttf" onChange={onUpload} className="hidden" />
      <button
        onClick={() => fileRef.current?.click()}
        className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line-2 py-2 text-[12px] font-medium text-ink-2 transition-colors hover:border-accent/50 hover:text-ink"
      >
        <Upload size={13} /> Add assets
      </button>

      <p className="px-1 pb-2 text-[10.5px] leading-relaxed text-ink-3">
        {selectedId
          ? "Click an asset to apply it to the selected element."
          : "Select an element, then click an asset to apply it."}
      </p>

      {entries.length === 0 && <Empty>No assets yet — images & fonts from your imported project show up here.</Empty>}

      {visual.map(({ key, label }) =>
        groups[key].length > 0 ? (
          <div key={key} className="mb-3">
            <div className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-3">{label} · {groups[key].length}</div>
            <div className="grid grid-cols-3 gap-1.5">
              {groups[key].map(([path, url]) => (
                <button
                  key={path}
                  onClick={() => applyAsset(path)}
                  title={`${path}\nClick to apply to the selected element`}
                  className="group relative aspect-square overflow-hidden rounded-md border border-line bg-bg transition-colors hover:border-accent/60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={path} className="h-full w-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-bg/80 px-1 py-0.5 text-[8px] text-ink-3 opacity-0 transition-opacity group-hover:opacity-100">{path.split("/").pop()}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null
      )}

      {groups.font.length > 0 && (
        <div className="mb-3">
          <div className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-3">Fonts · {groups.font.length}</div>
          <div className="flex flex-col gap-1">
            {groups.font.map(([path]) => (
              <div key={path} className="flex items-center gap-2 rounded-md border border-line bg-bg px-2 py-1.5 text-[11px] text-ink-2">
                <Type size={12} className="shrink-0 text-accent" />
                <span className="truncate font-mono">{path.split("/").pop()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {groups.other.length > 0 && (
        <div className="mb-3">
          <div className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-3">Other · {groups.other.length}</div>
          <div className="flex flex-col gap-1">
            {groups.other.map(([path]) => (
              <div key={path} className="truncate rounded-md border border-line bg-bg px-2 py-1.5 font-mono text-[11px] text-ink-3">{path.split("/").pop()}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Elements palette ────────────────────────────────────────────────────── */
const ELEMENTS: { group: string; items: { label: string; icon: React.ReactNode; html: string }[] }[] = [
  {
    group: "Layout",
    items: [
      { label: "Section", icon: <RectangleHorizontal size={14} />, html: `<section class="px-6 py-16"></section>` },
      { label: "Container", icon: <Box size={14} />, html: `<div class="mx-auto w-full max-w-5xl px-4"></div>` },
      { label: "Div block", icon: <Square size={14} />, html: `<div class="p-4"></div>` },
      { label: "Flex row", icon: <Columns2 size={14} />, html: `<div class="flex items-center gap-4"></div>` },
      { label: "Flex column", icon: <Rows2 size={14} />, html: `<div class="flex flex-col gap-4"></div>` },
      { label: "Grid", icon: <Grid3x3 size={14} />, html: `<div class="grid grid-cols-3 gap-4"></div>` },
    ],
  },
  {
    group: "Typography",
    items: [
      { label: "Heading", icon: <Heading size={14} />, html: `<h2 class="text-2xl font-semibold">Heading</h2>` },
      { label: "Paragraph", icon: <Type size={14} />, html: `<p class="leading-relaxed">Paragraph text goes here.</p>` },
      { label: "Text link", icon: <Link2 size={14} />, html: `<a href="#" class="text-blue-600 underline">Link</a>` },
      { label: "List", icon: <List size={14} />, html: `<ul class="list-disc pl-5"><li>Item one</li><li>Item two</li></ul>` },
    ],
  },
  {
    group: "Forms & media",
    items: [
      { label: "Button", icon: <MousePointer2 size={14} />, html: `<button class="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">Button</button>` },
      { label: "Image", icon: <ImageIcon size={14} />, html: `<img src="https://placehold.co/600x400" alt="" class="w-full" />` },
      { label: "Input", icon: <TextCursorInput size={14} />, html: `<input type="text" placeholder="Text" class="rounded-md border px-3 py-2" />` },
      { label: "Divider", icon: <Minus size={14} />, html: `<hr class="border-t border-gray-200" />` },
    ],
  },
];

function ElementsPalette() {
  const isHtml = useEditor((s) => s.files.find((f) => f.path === s.activePath)?.kind === "html");

  // Click = insert after the selected node, or append into the last top-level node.
  const onClick = (html: string) => {
    const st = useEditor.getState();
    if (st.selectedId) st.insertElement(html, st.selectedId, "after");
    else {
      const last = st.tree[st.tree.length - 1];
      if (last) st.insertElement(html, last.id, "inside");
      else st.setNotice("Open a page first.");
    }
  };

  return (
    <div className="border-b border-line p-2">
      {ELEMENTS.map((g) => (
        <div key={g.group} className="mb-2">
          <div className="px-1 pb-1 text-[9px] font-semibold uppercase tracking-wide text-ink-3">{g.group}</div>
          <div className="grid grid-cols-2 gap-1">
            {g.items.map((it) => (
              <button
                key={it.label}
                draggable
                onDragStart={() => setDragElement(it.html)}
                onDragEnd={() => setDragElement(null)}
                onClick={() => onClick(it.html)}
                title={`${it.label} — drag onto the canvas or a layer, or click to insert`}
                className="flex items-center gap-1.5 rounded-md border border-line bg-bg px-2 py-1.5 text-left text-[11.5px] text-ink-2 transition-colors hover:border-accent/50 hover:text-ink"
              >
                <span className="shrink-0 text-ink-3">{it.icon}</span>
                <span className="truncate">{it.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="px-1 pt-0.5 text-[10px] leading-relaxed text-ink-3">
        {isHtml ? "Drag onto the canvas or a layer, or click to insert." : "Inserts as JSX into the current page."}
      </p>
    </div>
  );
}

/* ── Panel ───────────────────────────────────────────────────────────────── */
type Tab = "pages" | "layers" | "components" | "assets" | "files";
const TABS: { id: Tab; icon: React.ReactNode; label: string }[] = [
  { id: "pages", icon: <Files size={15} />, label: "Pages" },
  { id: "layers", icon: <Layers size={15} />, label: "Layers" },
  { id: "components", icon: <Component size={15} />, label: "Components" },
  { id: "assets", icon: <ImageIcon size={15} />, label: "Assets" },
  { id: "files", icon: <FolderTree size={15} />, label: "Files" },
];

export default function LeftPanel() {
  const files = useEditor((s) => s.files);
  const tree = useEditor((s) => s.tree);
  const selectedId = useEditor((s) => s.selectedId);
  const assetCount = useEditor((s) => Object.keys(s.assets).length);
  const [tab, setTab] = useState<Tab>("layers");

  // selecting an element on the canvas jumps to the Layers tab to reveal it
  useEffect(() => {
    if (selectedId) setTab("layers");
  }, [selectedId]);

  const pages = files.filter((f) => f.category === "page");
  const components = files.filter((f) => f.category === "component");
  const counts: Record<Tab, number> = {
    pages: pages.length, layers: 0, components: components.length, assets: assetCount, files: files.length,
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
          <>
            <ElementsPalette />
            <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-3">Project components</div>
            {components.length ? (
              <>
                {components.map((f) => <FileRow key={f.path} file={f} icon={<Component size={13} />} view="design" draggable />)}
                <p className="px-3 pt-2 text-[10.5px] leading-relaxed text-ink-3">
                  Click to edit in isolation, or drag onto a JSX page (canvas or layer) to insert an instance.
                </p>
              </>
            ) : (
              <p className="px-3 pt-1 text-[10.5px] leading-relaxed text-ink-3">No project components yet — open a .jsx / .tsx file to edit one in isolation.</p>
            )}
          </>
        )}

        {tab === "assets" && <AssetsTab />}

        {tab === "files" && files.map((f) => <FileRow key={f.path} file={f} icon={<FileCode2 size={13} />} view="split" />)}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-4 text-[12px] leading-relaxed text-ink-3">{children}</p>;
}
