"use client";

import { useEditor } from "@/store/editorStore";
import { readStyles, highlight } from "@/lib/canvasBridge";
import type { EditorSurface } from "@/lib/editorSurface";
import type { EditorNode } from "@/lib/types";

function find(nodes: EditorNode[], id: string | null): EditorNode | null {
  if (!id) return null;
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = find(n.children, id);
    if (f) return f;
  }
  return null;
}

const IMG = /\.(png|jpe?g|gif|svg|webp|avif)$/i;

// EditorSurface backed by the canvas: the parsed doc in the editor store +
// computed-style reads over the sandboxed preview iframe (canvasBridge). This is
// the default backend for the editor; the Run mode supplies a WebContainer one.
export function useCanvasSurface(): EditorSurface {
  const tree = useEditor((s) => s.tree);
  const selectedId = useEditor((s) => s.selectedId);
  const files = useEditor((s) => s.files);
  const activePath = useEditor((s) => s.activePath);
  const device = useEditor((s) => s.device);
  const readyTick = useEditor((s) => s.canvasReadyTick);
  const assets = useEditor((s) => s.assets);
  const role = useEditor((s) => s.role);
  const projectId = useEditor((s) => s.projectId);
  const setStyle = useEditor((s) => s.updateStyle);
  const setClassList = useEditor((s) => s.updateClassList);
  const setText = useEditor((s) => s.updateText);
  const setAttr = useEditor((s) => s.updateAttr);
  const removeAttr = useEditor((s) => s.removeAttr);
  const setProp = useEditor((s) => s.updateProp);
  const removeProp = useEditor((s) => s.removeProp);
  const duplicate = useEditor((s) => s.duplicateNode);
  const remove = useEditor((s) => s.deleteNode);
  const applyAsset = useEditor((s) => s.applyAsset);

  const node = find(tree, selectedId);
  const isHtml = files.find((f) => f.path === activePath)?.kind === "html";
  const isComponentInstance = !isHtml && !!node && /^[A-Z]/.test(node.tag) && node.tag !== "{expr}";
  const imageAssets = Object.entries(assets).filter(([p]) => IMG.test(p)) as [string, string][];

  return {
    node,
    selectedId,
    canEdit: role === "owner" || role === "editor",
    isHtml: !!isHtml,
    isComponentInstance,
    device,
    readyTick,
    files,
    projectId,
    imageAssets,
    readStyles,
    highlight,
    setStyle,
    setClassList,
    setText,
    setAttr,
    removeAttr,
    setProp,
    removeProp,
    duplicate,
    remove,
    applyAsset,
  };
}
