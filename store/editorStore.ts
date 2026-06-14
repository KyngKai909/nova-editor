import { create } from "zustand";
import type { EditorNode, SourceFile } from "@/lib/types";
import type { AssetMap } from "@/lib/assets";
import { parseDocument, buildTree, serializeClean } from "@/lib/htmlParser";
import { parseJsx } from "@/lib/jsxParser";
import { spliceJsx, setJsxStyle, setJsxProp, removeJsxProp, componentNameFromPath, relativeImportPath, ensureImport } from "@/lib/jsxEdit";
import { htmlNodeLine, lineOfOffset } from "@/lib/htmlLocate";
import { classifyFile, fileKind } from "@/lib/importUtils";
import { detectTailwind, applyTailwind, tailwindSupports } from "@/lib/tailwind";
import { useSettings } from "@/store/settingsStore";
import {
  applyStyleToIframe,
  applyTextToIframe,
  applyClassToIframe,
  applyAttrToIframe,
  setLeafText,
} from "@/lib/canvasBridge";

export type Device = "desktop" | "tablet" | "mobile";
export const DEVICE_WIDTH: Record<Device, number> = {
  desktop: 1280,
  tablet: 834,
  mobile: 390,
};

interface EditorState {
  files: SourceFile[];
  assets: AssetMap;
  baseHref: string | null;
  activePath: string | null;
  tree: EditorNode[];
  selectedId: string | null;
  hoveredId: string | null;
  htmlDoc: Document | null; // clean source of truth for the active HTML file
  reloadKey: number;        // bump to force a canvas reload
  usesTailwind: boolean;    // active project styles with Tailwind utilities

  device: Device;
  previewMode: boolean;
  zoom: number;
  projectId: string | null;
  viewMode: "design" | "code" | "split";
  codeReveal: { path: string; line: number; ts: number } | null;

  loadFiles: (files: SourceFile[], assets?: AssetMap, baseHref?: string | null, projectId?: string | null) => void;
  selectFile: (path: string) => void;
  selectNode: (id: string | null) => void;
  hoverNode: (id: string | null) => void;

  setDevice: (d: Device) => void;
  togglePreview: () => void;
  setZoom: (z: number) => void;
  setViewMode: (m: "design" | "code" | "split") => void;
  setFileContent: (path: string, content: string) => void;
  upsertFile: (path: string, content: string) => void;
  revealInCode: (nodeId: string) => void;

  updateClassList: (id: string, classList: string[]) => void;
  updateText: (id: string, text: string) => void;
  updateStyle: (id: string, prop: string, value: string) => void;

  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  moveNode: (dragId: string, targetId: string, position: "before" | "after" | "inside") => void;
  insertComponent: (componentPath: string, targetId: string, position: "before" | "after" | "inside") => void;
  updateProp: (id: string, name: string, value: string) => void;
  removeProp: (id: string, name: string) => void;
  updateAttr: (id: string, name: string, value: string) => void;
  removeAttr: (id: string, name: string) => void;

  notice: string | null;
  setNotice: (n: string | null) => void;

  markCommitted: () => void; // reset diff baseline after a successful push

  reset: () => void;
}

function findNode(nodes: EditorNode[], id: string): EditorNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = findNode(n.children, id);
    if (f) return f;
  }
  return null;
}

export const useEditor = create<EditorState>((set, get) => ({
  files: [],
  assets: {},
  baseHref: null,
  activePath: null,
  tree: [],
  selectedId: null,
  hoveredId: null,
  htmlDoc: null,
  reloadKey: 0,
  usesTailwind: false,
  device: "desktop",
  previewMode: false,
  zoom: 1,
  projectId: null,
  viewMode: "design",
  codeReveal: null,
  notice: null,

  loadFiles: (files, assets = {}, baseHref = null, projectId = null) => {
    // backfill category for projects persisted before it existed
    const withCat = files.map((f) =>
      f.category ? f : { ...f, category: classifyFile(f.path, f.kind) }
    );
    set({ files: withCat, assets, baseHref, projectId });
    const firstPage = withCat.find((f) => f.category === "page") || withCat[0];
    if (firstPage) get().selectFile(firstPage.path);
  },

  selectFile: (path) => {
    const { files } = get();
    const file = files.find((f) => f.path === path);
    if (!file) return;
    const usesTailwind = detectTailwind(files, file.content);
    if (file.kind === "html") {
      const doc = parseDocument(file.content);
      set({
        activePath: path,
        htmlDoc: doc,
        tree: buildTree(doc),
        selectedId: null,
        reloadKey: get().reloadKey + 1,
        usesTailwind,
      });
    } else {
      set({
        activePath: path,
        htmlDoc: null,
        tree: parseJsx(file.content),
        selectedId: null,
        reloadKey: get().reloadKey + 1,
        usesTailwind,
      });
    }
  },

  selectNode: (id) => set({ selectedId: id }),
  hoverNode: (id) => set({ hoveredId: id }),

  setDevice: (d) => set({ device: d }),
  togglePreview: () => set({ previewMode: !get().previewMode, selectedId: null }),
  setZoom: (z) => set({ zoom: Math.min(2, Math.max(0.25, z)) }),
  setViewMode: (m) => set({ viewMode: m }),

  // Apply an edit made directly in the code editor: re-parse + reload canvas.
  setFileContent: (path, content) => {
    const { files } = get();
    const file = files.find((f) => f.path === path);
    if (!file || file.content === content) return;
    updateContent(set, files, path, content);
    if (path === get().activePath) {
      if (file.kind === "html") {
        const doc = parseDocument(content);
        set({ htmlDoc: doc, tree: buildTree(doc), reloadKey: get().reloadKey + 1 });
      } else {
        set({ tree: parseJsx(content), reloadKey: get().reloadKey + 1 });
      }
    }
  },

  // Create a file if it doesn't exist, otherwise overwrite it. Used by the AI
  // assistant so it can add new pages/components (only editable html/jsx kinds
  // live in the editor; the canvas re-syncs via setFileContent for existing ones).
  upsertFile: (path, content) => {
    const { files } = get();
    if (files.find((f) => f.path === path)) {
      get().setFileContent(path, content);
      return;
    }
    const kind = fileKind(path);
    if (!kind) return; // non-editable extension — not tracked by the editor
    const file: SourceFile = {
      path,
      name: path.split("/").pop() || path,
      kind,
      category: classifyFile(path, kind),
      content,
      original: "",
    };
    set({ files: [...files, file] });
  },

  // Jump the code editor to the source line of a node (View in Code Editor).
  revealInCode: (nodeId) => {
    const { files, activePath, tree, htmlDoc } = get();
    const file = files.find((f) => f.path === activePath);
    if (!file) return;
    let line = 1;
    if (file.kind === "html" && htmlDoc) {
      line = htmlNodeLine(htmlDoc, nodeId, file.content);
    } else {
      const node = findNode(tree, nodeId);
      if (node?.sourceLocation) line = lineOfOffset(file.content, node.sourceLocation.start);
    }
    set({ viewMode: "split", codeReveal: { path: file.path, line, ts: Date.now() } });
  },

  updateStyle: (id, prop, value) => {
    const { htmlDoc, files, activePath, tree, usesTailwind, device } = get();
    const file = files.find((f) => f.path === activePath);
    if (!file) return;

    // Tailwind projects: write the edit as a utility class (responsive-aware)
    // instead of an inline style, so it's idiomatic and supports breakpoints.
    if (usesTailwind && useSettings.getState().styleAsClasses && tailwindSupports(prop)) {
      const node = findNode(tree, id);
      if (node) {
        const next = applyTailwind(node.classList, prop, value, device);
        if (next) {
          get().updateClassList(id, next);
          return;
        }
      }
    }

    if (file.kind === "html" && htmlDoc) {
      const el = htmlDoc.querySelector(`[data-wfc-id="${id}"]`) as HTMLElement | null;
      if (!el) return;
      const kebab = prop.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
      if (value === "") el.style.removeProperty(kebab);
      else el.style.setProperty(kebab, value);
      applyStyleToIframe(id, prop, value); // mirror to iframe (no reload)
      saveHtml(set, files, activePath, htmlDoc);
      set({ tree: [...tree] });
    } else {
      // JSX: splice the inline style object, mirror to iframe, re-parse for spans
      const node = findNode(tree, id);
      if (!node) return;
      applyStyleToIframe(id, prop, value);
      const newContent = setJsxStyle(file.content, node, prop, value);
      updateContent(set, files, file.path, newContent);
      set({ tree: parseJsx(newContent) });
    }
  },

  updateClassList: (id, classList) => {
    const { files, activePath, tree, htmlDoc } = get();
    const file = files.find((f) => f.path === activePath);
    if (!file) return;
    const node = findNode(tree, id);
    if (!node) return;
    node.classList = classList;

    if (file.kind === "html" && htmlDoc) {
      const el = htmlDoc.querySelector(`[data-wfc-id="${id}"]`);
      if (el) {
        if (classList.length) el.setAttribute("class", classList.join(" "));
        else el.removeAttribute("class");
      }
      applyClassToIframe(id, classList.join(" "));
      saveHtml(set, files, activePath, htmlDoc);
      set({ tree: [...tree] });
    } else {
      const newContent = spliceJsx(file.content, node, "class", classList.join(" "));
      updateContent(set, files, file.path, newContent);
      set({ tree: parseJsx(newContent) });
    }
  },

  updateText: (id, text) => {
    const { files, activePath, tree, htmlDoc } = get();
    const file = files.find((f) => f.path === activePath);
    if (!file) return;
    const node = findNode(tree, id);
    if (!node) return;
    node.textContent = text;

    if (file.kind === "html" && htmlDoc) {
      const el = htmlDoc.querySelector(`[data-wfc-id="${id}"]`);
      if (el) setLeafText(el, text);
      applyTextToIframe(id, text);
      saveHtml(set, files, activePath, htmlDoc);
      set({ tree: [...tree] });
    } else {
      const newContent = spliceJsx(file.content, node, "text", text);
      updateContent(set, files, file.path, newContent);
      set({ tree: parseJsx(newContent) });
    }
  },

  deleteNode: (id) => {
    const { files, activePath, tree, htmlDoc } = get();
    const file = files.find((f) => f.path === activePath);
    if (!file) return;
    if (file.kind === "html" && htmlDoc) {
      const el = htmlDoc.querySelector(`[data-wfc-id="${id}"]`);
      if (!el || el === htmlDoc.body) return;
      el.remove();
      reloadHtml(set, get, files, activePath, htmlDoc, null);
    } else {
      const node = findNode(tree, id);
      if (!node?.sourceLocation) return;
      const { start, end } = node.sourceLocation;
      const newContent = file.content.slice(0, start) + file.content.slice(end);
      updateContent(set, files, file.path, newContent);
      set({ tree: parseJsx(newContent), selectedId: null, reloadKey: get().reloadKey + 1 });
    }
  },

  duplicateNode: (id) => {
    const { files, activePath, tree, htmlDoc } = get();
    const file = files.find((f) => f.path === activePath);
    if (!file) return;
    if (file.kind === "html" && htmlDoc) {
      const el = htmlDoc.querySelector(`[data-wfc-id="${id}"]`);
      if (!el || el === htmlDoc.body) return;
      const clone = el.cloneNode(true) as Element;
      el.after(clone);
      reloadHtml(set, get, files, activePath, htmlDoc, null);
    } else {
      const node = findNode(tree, id);
      if (!node?.sourceLocation) return;
      const { start, end } = node.sourceLocation;
      const snippet = file.content.slice(start, end);
      const indent = lineIndent(file.content, start);
      const newContent =
        file.content.slice(0, end) + "\n" + indent + snippet + file.content.slice(end);
      updateContent(set, files, file.path, newContent);
      set({ tree: parseJsx(newContent), reloadKey: get().reloadKey + 1 });
    }
  },

  moveNode: (dragId, targetId, position) => {
    const { files, activePath, htmlDoc } = get();
    const file = files.find((f) => f.path === activePath);
    if (!file || dragId === targetId) return;
    // structural reorder is supported for HTML (live Document model)
    if (file.kind === "html" && htmlDoc) {
      const drag = htmlDoc.querySelector(`[data-wfc-id="${dragId}"]`);
      const target = htmlDoc.querySelector(`[data-wfc-id="${targetId}"]`);
      if (!drag || !target || drag === target || drag.contains(target)) return;
      if (position === "inside") target.appendChild(drag);
      else if (position === "before") target.before(drag);
      else target.after(drag);
      reloadHtml(set, get, files, activePath, htmlDoc, null);
    }
  },

  insertComponent: (componentPath, targetId, position) => {
    const { files, activePath, tree } = get();
    const file = files.find((f) => f.path === activePath);
    if (!file || componentPath === activePath) return;
    if (file.kind !== "jsx") {
      get().setNotice("Drop components onto a JSX/TSX page.");
      return;
    }
    const node = findNode(tree, targetId);
    if (!node?.sourceLocation) return;

    const name = componentNameFromPath(componentPath);
    const importPath = relativeImportPath(file.path, componentPath);
    const tag = `<${name} />`;
    const content = file.content;

    let offset: number;
    let insertText: string;
    if (position === "before") {
      offset = node.sourceLocation.start;
      insertText = tag + "\n" + lineIndent(content, offset);
    } else if (position === "inside" && node.children[0]?.sourceLocation) {
      offset = node.children[0].sourceLocation.start;
      insertText = tag + "\n" + lineIndent(content, offset);
    } else {
      offset = node.sourceLocation.end;
      insertText = "\n" + lineIndent(content, node.sourceLocation.start) + tag;
    }

    let newContent = content.slice(0, offset) + insertText + content.slice(offset);
    newContent = ensureImport(newContent, name, importPath);
    updateContent(set, files, file.path, newContent);
    set({ tree: parseJsx(newContent), reloadKey: get().reloadKey + 1 });
    get().setNotice(`Inserted <${name} />`);
  },

  updateProp: (id, name, value) => {
    const { files, activePath, tree } = get();
    const file = files.find((f) => f.path === activePath);
    if (!file || file.kind !== "jsx") return;
    const node = findNode(tree, id);
    if (!node) return;
    const newContent = setJsxProp(file.content, node, name, value);
    updateContent(set, files, file.path, newContent);
    set({ tree: parseJsx(newContent), reloadKey: get().reloadKey + 1 });
  },

  removeProp: (id, name) => {
    const { files, activePath, tree } = get();
    const file = files.find((f) => f.path === activePath);
    if (!file || file.kind !== "jsx") return;
    const node = findNode(tree, id);
    if (!node) return;
    const newContent = removeJsxProp(file.content, node, name);
    updateContent(set, files, file.path, newContent);
    set({ tree: parseJsx(newContent), reloadKey: get().reloadKey + 1 });
  },

  // Set an HTML attribute (id, href, alt, data-*, …). JSX routes to prop editing.
  updateAttr: (id, name, value) => {
    const { files, activePath, tree, htmlDoc } = get();
    const file = files.find((f) => f.path === activePath);
    if (!file) return;
    if (file.kind === "jsx") {
      if (value === "") get().removeProp(id, name);
      else get().updateProp(id, name, value);
      return;
    }
    if (!htmlDoc) return;
    const el = htmlDoc.querySelector(`[data-wfc-id="${id}"]`) as HTMLElement | null;
    if (!el) return;
    if (value === "") el.removeAttribute(name);
    else el.setAttribute(name, value);
    const node = findNode(tree, id);
    if (node) {
      const attrs = { ...node.attributes };
      if (value === "") delete attrs[name];
      else attrs[name] = value;
      node.attributes = attrs;
    }
    applyAttrToIframe(id, name, value); // live, no reload
    saveHtml(set, files, activePath, htmlDoc);
    set({ tree: [...tree] });
  },

  removeAttr: (id, name) => {
    const { files, activePath } = get();
    const file = files.find((f) => f.path === activePath);
    if (!file) return;
    if (file.kind === "jsx") get().removeProp(id, name);
    else get().updateAttr(id, name, "");
  },

  setNotice: (n) => set({ notice: n }),

  markCommitted: () =>
    set({ files: get().files.map((f) => ({ ...f, original: f.content })) }),

  reset: () =>
    set({ files: [], assets: {}, baseHref: null, activePath: null, tree: [], selectedId: null, htmlDoc: null, projectId: null }),
}));

// Re-derive content + tree from a mutated HTML Document and reload the canvas.
function reloadHtml(
  set: (p: Partial<EditorState>) => void,
  get: () => EditorState,
  files: SourceFile[],
  path: string | null,
  doc: Document,
  selectId: string | null
) {
  const content = serializeClean(doc);
  const fresh = parseDocument(content); // reassigns stable ids
  updateContent(set, files, path!, content);
  set({ htmlDoc: fresh, tree: buildTree(fresh), selectedId: selectId, reloadKey: get().reloadKey + 1 });
}

function lineIndent(content: string, offset: number): string {
  const lineStart = content.lastIndexOf("\n", offset - 1) + 1;
  const m = content.slice(lineStart, offset).match(/^[ \t]*/);
  return m ? m[0] : "";
}

function saveHtml(
  set: (p: Partial<EditorState>) => void,
  files: SourceFile[],
  path: string | null,
  doc: Document
) {
  if (!path) return;
  updateContent(set, files, path, serializeClean(doc));
}

function updateContent(
  set: (partial: Partial<EditorState>) => void,
  files: SourceFile[],
  path: string,
  content: string
) {
  set({ files: files.map((f) => (f.path === path ? { ...f, content } : f)) });
}
