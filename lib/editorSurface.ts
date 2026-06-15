import type { EditorNode } from "./types";

// EditorSurface is the seam between Nova's editing tools (inspector, layers,
// elements palette, comments) and whatever is actually rendering the page. It
// lets ONE set of tools drive two very different backends:
//   • CanvasSurface     — the in-store parsed doc + the sandboxed preview iframe
//                         (lib/editorStore + lib/canvasBridge)
//   • WebContainerSurface — a real dev server running in a WebContainer, edited
//                         through on-disk source + HMR (the Run mode)
//
// The tools depend only on this interface, so a feature added once works in both
// modes instead of being rebuilt twice.
export interface EditorSurface {
  // ── selection + context ────────────────────────────────────────────────
  node: EditorNode | null;          // the currently selected element (normalized)
  selectedId: string | null;
  canEdit: boolean;
  isHtml: boolean;                  // active doc is plain HTML (vs JSX/TSX)
  isComponentInstance: boolean;     // selection is a <Component/> (props, not styles)
  device: string;                   // "desktop" | "tablet" | "mobile"
  readyTick: number;                // bump → re-read computed styles (post-reload)
  files: { path: string; content: string }[];
  projectId: string | null;
  imageAssets: [string, string][];  // [repoPath, blobUrl] for the image picker

  // ── reads ──────────────────────────────────────────────────────────────
  readStyles(id: string): Promise<Record<string, string>>;
  highlight(id: string | null): void;

  // ── edits ──────────────────────────────────────────────────────────────
  setStyle(id: string, prop: string, value: string): void;
  setClassList(id: string, classList: string[]): void;
  setText(id: string, text: string): void;
  setAttr(id: string, name: string, value: string): void;
  removeAttr(id: string, name: string): void;
  setProp(id: string, name: string, value: string): void;   // JSX component prop
  removeProp(id: string, name: string): void;
  duplicate(id: string): void;
  remove(id: string): void;
  applyAsset(path: string, as: "background" | "src"): void;
}
