"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useComments } from "@/store/commentsStore";
import { getHandle } from "@/lib/handleStore";
import { verifyPermission, readDirTree, writeFiles } from "@/lib/fileSystem";
import { APP_BRIDGE, resolveWcPath, findNodeByLine } from "@/lib/runtime";
import { parseJsx } from "@/lib/jsxParser";
import { spliceJsx, setJsxProp, removeJsxProp } from "@/lib/jsxEdit";
import { makeWcBackend } from "@/lib/aiBackend";
import { toTokens, toClassName } from "@/lib/runStyle";
import type { EditorSurface } from "@/lib/editorSurface";
import type { EditorNode } from "@/lib/types";

export type WcPhase = "idle" | "booting" | "mounting" | "installing" | "starting" | "ready" | "error";

export interface WcSelection {
  file?: string;
  line?: number;
  tag: string;
  className: string;
  text: string | null;
  styles?: Record<string, string>;
  id?: string;
}
export interface WcLayerNode {
  id: string;
  tag: string;
  cls?: string;
  text?: string;
  children: WcLayerNode[];
}

// One WebContainer boot per page (the API allows only one).
let wcBootPromise: Promise<any> | null = null;
async function bootContainer() {
  if (!wcBootPromise) {
    wcBootPromise = (async () => {
      const { WebContainer } = await import("@webcontainer/api");
      // credentialless lets the running app pull CORP-less CDNs (Tailwind/fonts/…).
      return WebContainer.boot({ coep: "credentialless" });
    })();
  }
  return wcBootPromise;
}

const DEMO_TREE: Record<string, any> = {
  "package.json": { file: { contents: JSON.stringify({ name: "nova-demo", scripts: { dev: "node server.js" } }) } },
  "server.js": {
    file: {
      contents:
        "const http=require('http');http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<body style=\"font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#0a0a0a;color:#ccff02\"><h1>\\u2713 WebContainer is running your app</h1></body>')}).listen(3000,()=>console.log('listening on http://localhost:3000'));",
    },
  },
};

// Boots a project's dev server in a WebContainer and exposes the bits the editor
// (or the /run page) needs to drive it: phase/url/log, the live selection + DOM
// tree from the injected bridge, an EditorSurface that edits the running source,
// and undo/redo over those edits. `active` gates the boot (so the editor only
// starts a container when webapp mode is actually entered).
export function useWebContainer({
  projectId,
  active,
  device,
}: {
  projectId: string | null;
  active: boolean;
  device: string;
}) {
  const [phase, setPhase] = useState<WcPhase>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  const [selected, setSelected] = useState<WcSelection | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tree, setTree] = useState<WcLayerNode[]>([]);
  const [past, setPast] = useState<{ path: string; before: string; after: string }[]>([]);
  const [future, setFuture] = useState<{ path: string; before: string; after: string }[]>([]);

  const commentsKey = projectId || "run";
  const comments = useComments((s) => s.byProject[commentsKey] || []);
  const commentsPanelOpen = useComments((s) => s.panelOpen);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wcRef = useRef<any>(null);
  const handleRef = useRef<any>(null);
  const append = (s: string) => setLog((l) => [...l.slice(-400), s]);

  const post = useCallback((msg: any) => iframeRef.current?.contentWindow?.postMessage(msg, "*"), []);

  const writeThrough = useCallback(async (path: string, content: string) => {
    const wc = wcRef.current;
    if (!wc) return;
    await wc.fs.writeFile(path, content);
    if (handleRef.current) { try { await writeFiles(handleRef.current, [{ path, content }]); } catch { /* best-effort */ } }
  }, []);

  const record = useCallback((path: string, before: string, after: string) => {
    if (before === after) return;
    setPast((p) => [...p.slice(-59), { path, before, after }]);
    setFuture([]);
  }, []);
  const undo = useCallback(async () => {
    setPast((p) => {
      const last = p[p.length - 1];
      if (!last) return p;
      setFuture((f) => [last, ...f]);
      writeThrough(last.path, last.before);
      return p.slice(0, -1);
    });
  }, [writeThrough]);
  const redo = useCallback(async () => {
    setFuture((f) => {
      const next = f[0];
      if (!next) return f;
      setPast((p) => [...p, next]);
      writeThrough(next.path, next.after);
      return f.slice(1);
    });
  }, [writeThrough]);

  const backend = useMemo(
    () => (url && wcRef.current ? makeWcBackend(wcRef.current, handleRef.current, (p, b, a) => record(p, b, a)) : undefined),
    [url, record]
  );

  // Edit the source file backing the selected element, then let HMR re-render.
  const editFile = useCallback(async (line: number | undefined, file: string | undefined, fn: (content: string, node: any) => string | null) => {
    const wc = wcRef.current;
    if (!wc || !file || !line) return;
    const path = await resolveWcPath(wc.fs, file);
    if (!path) return;
    const content = await wc.fs.readFile(path, "utf-8");
    const node = findNodeByLine(parseJsx(content), content, line);
    if (!node) return;
    const next = fn(content, node);
    if (next && next !== content) { record(path, content, next); await writeThrough(path, next); }
  }, [record, writeThrough]);

  const applyClass = useCallback((className: string, style?: Record<string, string>) => {
    setSelected((sel) => (sel ? { ...sel, className } : sel));
    post({ type: "nova-apply", className, ...(style ? { style } : {}) });
  }, [post]);

  // ── EditorSurface over the WebContainer (mirrors the canvas surface contract) ──
  const selRef = useRef(selected); selRef.current = selected;
  const editFileRef = useRef(editFile); editFileRef.current = editFile;
  const applyClassRef = useRef(applyClass); applyClassRef.current = applyClass;

  const kebab = (p: string) => p.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
  const wcRead = useCallback(async () => selRef.current?.styles ?? {}, []);
  const wcHighlight = useCallback((id: string | null) => { if (id) post({ type: "nova-pick", id }); }, [post]);
  const wcSetStyle = useCallback((_id: string, prop: string, value: string) => {
    const sel = selRef.current; if (!sel) return;
    const kb = kebab(prop);
    const re = new RegExp("^\\[" + kb.replace(/-/g, "\\-") + ":");
    const tokens = toTokens(sel.className).filter((t) => !re.test(t));
    if (value !== "") tokens.push(`[${kb}:${value.replace(/\s+/g, "_")}]`);
    applyClassRef.current(toClassName(tokens), { [prop]: value });
  }, []);
  const wcSetClassList = useCallback((_id: string, classes: string[]) => applyClassRef.current(classes.join(" ")), []);
  const wcSetText = useCallback((_id: string, text: string) => {
    const sel = selRef.current; if (!sel) return;
    setSelected((s) => (s ? { ...s, text } : s));
    post({ type: "nova-apply", text });
    editFileRef.current(sel.line, sel.file, (c, n) => spliceJsx(c, n, "text", text));
  }, [post]);
  const wcSetAttr = useCallback((_id: string, name: string, value: string) => {
    const sel = selRef.current; if (!sel) return;
    editFileRef.current(sel.line, sel.file, (c, n) => setJsxProp(c, n, name, value));
  }, []);
  const wcRemoveAttr = useCallback((_id: string, name: string) => {
    const sel = selRef.current; if (!sel) return;
    editFileRef.current(sel.line, sel.file, (c, n) => removeJsxProp(c, n, name));
  }, []);
  const wcDuplicate = useCallback((_id: string) => {
    const sel = selRef.current; if (!sel) return;
    editFileRef.current(sel.line, sel.file, (c, n) => {
      if (!n.sourceLocation) return null;
      const { start, end } = n.sourceLocation;
      const ls = c.lastIndexOf("\n", start - 1) + 1;
      const indent = (c.slice(ls, start).match(/^[ \t]*/) || [""])[0];
      return c.slice(0, end) + "\n" + indent + c.slice(start, end) + c.slice(end);
    });
  }, []);
  const wcRemove = useCallback((_id: string) => {
    const sel = selRef.current; if (!sel) return;
    post({ type: "nova-remove" });
    editFileRef.current(sel.line, sel.file, (c, n) => {
      const loc = (n as any).sourceLocation;
      if (!loc) return null;
      let { start } = loc; const { end } = loc; let s = start;
      while (s > 0 && (c[s - 1] === " " || c[s - 1] === "\t")) s--;
      let e = end;
      if (s === 0 || c[s - 1] === "\n") { start = s; if (c[e] === "\n") e++; }
      return c.slice(0, start) + c.slice(e);
    });
    setSelected(null); setSelectedId(null);
  }, [post]);
  const wcApplyAsset = useCallback((path: string, as: "background" | "src") => {
    if (as === "src") wcSetAttr("", "src", path);
    else wcSetStyle("", "backgroundImage", `url(${path})`);
  }, [wcSetAttr, wcSetStyle]);

  const surface = useMemo<EditorSurface>(() => {
    const node: EditorNode | null = selected
      ? {
          id: selected.id || "",
          tag: selected.tag,
          attributes: {},
          classList: selected.className ? selected.className.split(/\s+/).filter(Boolean) : [],
          textContent: selected.text ?? "",
          children: [],
          sourceLocation: null,
        }
      : null;
    return {
      node,
      selectedId: selected?.id ?? null,
      canEdit: true,
      isHtml: /\.html?$/i.test(selected?.file || ""),
      isComponentInstance: !!selected && /^[A-Z]/.test(selected.tag),
      device,
      readyTick: 0,
      files: [],
      projectId: commentsKey,
      imageAssets: [],
      readStyles: wcRead,
      highlight: wcHighlight,
      setStyle: wcSetStyle,
      setClassList: wcSetClassList,
      setText: wcSetText,
      setAttr: wcSetAttr,
      removeAttr: wcRemoveAttr,
      setProp: wcSetAttr,
      removeProp: wcRemoveAttr,
      duplicate: wcDuplicate,
      remove: wcRemove,
      applyAsset: wcApplyAsset,
    };
  }, [selected, device, commentsKey, wcRead, wcHighlight, wcSetStyle, wcSetClassList, wcSetText, wcSetAttr, wcRemoveAttr, wcDuplicate, wcRemove, wcApplyAsset]);

  const refreshTree = useCallback(() => post({ type: "nova-tree-request" }), [post]);
  const pickLayer = useCallback((id: string) => post({ type: "nova-pick", id }), [post]);
  const hoverLayer = useCallback((id: string | null) => id && post({ type: "nova-hl", id }), [post]);
  const restart = useCallback(() => setRunId((n) => n + 1), []);

  // bridge messages from the running app: selection, inline text, layer tree, comments
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d?.type) return;
      if (d.type === "nova-select") {
        setSelected({ file: d.file, line: d.line, tag: d.tag, className: d.className || "", text: d.text, styles: d.styles || undefined, id: d.id || undefined });
        setSelectedId(d.id || null);
      } else if (d.type === "nova-text") {
        editFile(d.line, d.file, (c, n) => spliceJsx(c, n, "text", d.text));
      } else if (d.type === "nova-tree") {
        setTree(Array.isArray(d.tree) ? d.tree : []);
      } else if (d.type === "nova-comment-click") {
        useComments.getState().setFocused(d.commentId);
      } else if (d.type === "nova-context") {
        const label = d.text ? String(d.text).slice(0, 28) : d.className ? `${d.tag}.${String(d.className).split(/\s+/)[0]}` : d.tag;
        useComments.getState().setPending({ elementId: d.id, label, x: d.x, y: d.y });
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [editFile]);

  // ask for the layer tree once the app is up
  useEffect(() => {
    if (!url) { setTree([]); return; }
    const t = setTimeout(refreshTree, 800);
    return () => clearTimeout(t);
  }, [url, refreshTree]);

  // comment pins while the inspector's Comments tab is open
  useEffect(() => {
    const pins = commentsPanelOpen
      ? comments.filter((c) => !c.resolved).map((c, i) => ({ id: c.elementId, key: String(i + 1), commentId: c.id, x: c.x, y: c.y }))
      : [];
    post({ type: "nova-comments", pins });
  }, [commentsPanelOpen, comments, url, post]);

  // boot the dev server when active (and on restart)
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      setError(null); setUrl(null); setLog([]);
      try {
        if (typeof window !== "undefined" && !(window as any).crossOriginIsolated)
          throw new Error("This page isn't cross-origin isolated, so the in-browser runtime can't start. Try a hard refresh.");
        if (!projectId) throw new Error("No project specified.");
        const demo = projectId === "__demo__";
        let handle: any = null;
        if (!demo) {
          handle = await getHandle(projectId);
          if (!handle) throw new Error("Live preview needs a folder-backed project (a full clone on disk). Set a projects folder in Settings, then re-import the repo.");
          if (!(await verifyPermission(handle, false))) throw new Error("Folder permission denied.");
          handleRef.current = handle;
        }
        setPhase("booting");
        const wc = await bootContainer();
        wcRef.current = wc;
        if (cancelled) return;
        setPhase("mounting");
        const fsTree = demo ? DEMO_TREE : await readDirTree(handle);
        await wc.mount(fsTree);
        if (cancelled) return;
        try {
          await wc.fs.mkdir("public", { recursive: true }).catch(() => {});
          await wc.fs.writeFile("public/nova-bridge.js", APP_BRIDGE);
        } catch { /* best-effort */ }
        const TAG = '<script src="/nova-bridge.js"></script>';
        const tryInject = async (path: string) => {
          try {
            const src = await wc.fs.readFile(path, "utf-8");
            if (src.includes("nova-bridge")) return true;
            if (src.includes("</body>")) { await wc.fs.writeFile(path, src.replace("</body>", TAG + "</body>")); return true; }
          } catch { /* not present */ }
          return false;
        };
        for (const p of ["index.html", "public/index.html", "app/layout.tsx", "app/layout.jsx", "src/app/layout.tsx", "src/app/layout.jsx", "pages/_document.tsx", "pages/_document.jsx", "src/pages/_document.tsx", "src/pages/_document.jsx"]) {
          if (await tryInject(p)) break;
        }
        try { const pub = await wc.fs.readdir("public"); for (const name of pub) if (/\.html?$/i.test(name)) await tryInject("public/" + name); } catch { /* no public */ }
        let script = "dev";
        try {
          const raw = (fsTree as any)["package.json"].file.contents;
          const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
          const pkg = JSON.parse(text);
          if (!pkg.scripts?.dev) script = pkg.scripts?.start ? "start" : "dev";
        } catch { throw new Error("No package.json at the project root — this doesn't look like a runnable app."); }
        setPhase("installing");
        append("$ npm install");
        const install = await wc.spawn("npm", ["install"]);
        install.output.pipeTo(new WritableStream({ write: (d: string) => { if (!cancelled) append(d); } }));
        const code = await install.exit;
        if (cancelled) return;
        if (code !== 0) throw new Error(`npm install exited with code ${code}.`);
        setPhase("starting");
        append(`\n$ npm run ${script}`);
        wc.on("server-ready", (_port: number, serverUrl: string) => { if (!cancelled) { setUrl(serverUrl); setPhase("ready"); } });
        wc.on("error", (e: any) => !cancelled && setError(e?.message || String(e)));
        const dev = await wc.spawn("npm", ["run", script]);
        dev.output.pipeTo(new WritableStream({ write: (d: string) => { if (!cancelled) append(d); } }));
      } catch (e: any) {
        if (!cancelled) { setError(e?.message || String(e)); setPhase("error"); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, runId, active]);

  return {
    phase, log, error, url, selected, selectedId, tree, surface, backend,
    past, future, undo, redo,
    iframeRef, restart, refreshTree, pickLayer, hoverLayer,
    setSelected, setSelectedId,
  };
}
