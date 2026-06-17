"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useComments } from "@/store/commentsStore";
import { useEnvVars } from "@/store/envStore";
import { extractComponentControls, type PropControl } from "@/lib/componentProps";
import { hashLock, getDepSnapshot, putDepSnapshot } from "@/lib/depCache";
import { getHandle } from "@/lib/handleStore";
import { verifyPermission, readDirTree, readFlatFiles, writeFiles } from "@/lib/fileSystem";
import { APP_BRIDGE, resolveWcPath, findNodeByLine } from "@/lib/runtime";
import { parseJsx } from "@/lib/jsxParser";
import { spliceJsx, setJsxProp, removeJsxProp } from "@/lib/jsxEdit";
import { makeWcBackend } from "@/lib/aiBackend";
import { runProject, streamLogs, stopRun as stopLocalRun, writeFiles as writeLocalFiles, attachRun, runnerProxyUrl } from "@/lib/localRunner";
import { useRunner } from "@/store/runnerStore";
import { classifyFile, fileKind } from "@/lib/importUtils";
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
export interface WcPageRoute { route: string; label: string; path: string; }

// Map a page file to the URL route the dev server serves it at. `appBase` is the
// subdir the app is actually served from (e.g. "app" for a Vite frontend nested in
// a contracts repo), stripped first so routes are relative to the served root.
function routeForPage(path: string, appBase = ""): string | null {
  let pp = path;
  if (appBase && (pp === appBase || pp.startsWith(appBase + "/"))) pp = pp.slice(appBase.length + 1);
  const p = pp.replace(/^src\//, "");
  let m = p.match(/^app\/(.*\/)?page\.[tj]sx?$/); // Next App Router
  if (m) return "/" + (m[1] || "").replace(/\/$/, "");
  m = p.match(/^pages\/(.+)\.[tj]sx?$/); // Next Pages Router
  if (m) {
    if (/_app|_document|api\//.test(m[1])) return null;
    return "/" + m[1].replace(/\/index$/, "").replace(/^index$/, "");
  }
  m = p.match(/^(?:public\/)?(.+)\.html?$/); // static html
  if (m) return "/" + (m[1] === "index" ? "" : m[1] + ".html");
  return null;
}

// PascalCase name guessed from a component file path (named-export fallback).
function pascalName(path: string): string {
  let base = path.split("/").pop()!.replace(/\.[tj]sx?$/, "");
  if (base.toLowerCase() === "index") base = path.split("/").slice(-2, -1)[0] || "Component";
  return base.replace(/(^|[-_ ])(\w)/g, (_m, _s, c: string) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, "");
}

// Relative import specifier from one project file to another (extension stripped).
function relImport(fromFile: string, toFile: string): string {
  const fromDir = fromFile.split("/").slice(0, -1);
  const to = toFile.replace(/\.[tj]sx?$/, "").split("/");
  let i = 0;
  while (i < fromDir.length && i < to.length && fromDir[i] === to[i]) i++;
  const rel = [...fromDir.slice(i).map(() => ".."), ...to.slice(i)].join("/");
  return rel.startsWith(".") ? rel : "./" + rel;
}

// The preview route's content before any component is picked. Written at boot so
// Next registers the route in its initial scan (see boot for why).
function previewPlaceholder(): string {
  return `"use client";
export default function NovaPreview() {
  return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 48, fontFamily: "system-ui", color: "#888" }}>Pick a component in the Components tab to preview it here.</div>;
}
`;
}

// An ephemeral preview page: finds the component's export (default or named) and
// renders it centered. As a route it inherits the app's root layout — providers,
// fonts, global CSS — so app-tied components render with their real context.
function previewSource(rel: string, name: string, props: Record<string, any> = {}): string {
  return `"use client";
import * as __M from ${JSON.stringify(rel)};
const __C = (__M.default || __M[${JSON.stringify(name)}] || Object.values(__M).find((v) => typeof v === "function"));
const __P = ${JSON.stringify(props)};
export default function NovaPreview() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 48 }}>
      {__C ? <__C {...__P} /> : <p style={{ fontFamily: "system-ui", color: "#888" }}>No component export found in ${rel}</p>}
    </div>
  );
}
`;
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
// Parse raw .env text (KEY=value lines, # comments, optional quotes) into a map.
function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of (text || "").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim().replace(/^export\s+/, "");
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (k) out[k] = v;
  }
  return out;
}
// Merge Nova-provided vars over an existing .env.local (Nova wins), serialized back.
function mergeEnv(existing: string, overlay: Record<string, string>): string {
  const merged = { ...parseEnv(existing), ...overlay };
  return Object.entries(merged).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
}

// Find the directory to run the dev server from. Many repos aren't a web app at
// the root (a Hardhat/monorepo with the frontend in app/, apps/web, etc.), so we
// scan the root + one level of subdirs (and apps/* , packages/*) for a package.json
// whose dev/start script looks like a web dev server. Falls back to the root if it
// has any dev/start script; returns null if nothing's runnable.
const WEB_DEV = /(vite|next|react-scripts|astro|@remix-run|remix |nuxt|vue-cli-service|parcel|webpack|http-server|\bserve\b|gatsby|svelte-kit|sveltekit|solid-start|@redwoodjs|rsbuild|docusaurus|expo|ng serve|preact)/i;
async function findAppRoot(wc: any): Promise<{ dir: string; script: string } | null> {
  const readPkg = async (dir: string) => {
    try { return JSON.parse(await wc.fs.readFile((dir ? dir + "/" : "") + "package.json", "utf-8")); } catch { return null; }
  };
  const dirs: string[] = [""];
  try {
    for (const e of await wc.fs.readdir(".", { withFileTypes: true }))
      if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") dirs.push(e.name);
  } catch { /* ignore */ }
  for (const parent of ["apps", "packages"]) {
    try {
      for (const e of await wc.fs.readdir(parent, { withFileTypes: true }))
        if (e.isDirectory()) dirs.push(parent + "/" + e.name);
    } catch { /* no such dir */ }
  }
  let best: { dir: string; script: string; score: number } | null = null;
  let rootFallback: { dir: string; script: string } | null = null;
  for (const dir of dirs) {
    const pkg = await readPkg(dir);
    const sc = pkg?.scripts;
    if (!sc) continue;
    const script = sc.dev ? "dev" : sc.start ? "start" : null;
    if (!script) continue;
    if (dir === "" && !rootFallback) rootFallback = { dir: "", script };
    const cmd = String(sc[script] || "");
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (!(WEB_DEV.test(cmd) || Object.keys(deps).some((d) => WEB_DEV.test(d)))) continue;
    const depth = dir ? dir.split("/").length : 0;
    const named = /(^|\/)(app|web|frontend|client|site|www)$/.test(dir) ? 1 : 0;
    const score = (dir === "" ? 4 : 0) + named * 2 - depth + (WEB_DEV.test(cmd) ? 1 : 0);
    if (!best || score > best.score) best = { dir, script, score };
  }
  return best ? { dir: best.dir, script: best.script } : rootFallback;
}

// Flat-file equivalents of findAppRoot / resolveWcPath for the local-runner path,
// which works over a sent file list ({path,content}[]) instead of a WebContainer fs.
function detectAppRootFlat(files: { path: string; content: string; encoding?: string }[]): { dir: string; script: string } | null {
  let best: { dir: string; script: string; score: number } | null = null;
  let rootFallback: { dir: string; script: string } | null = null;
  for (const f of files) {
    if (f.encoding || !/(^|\/)package\.json$/.test(f.path)) continue;
    const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
    let pkg: any; try { pkg = JSON.parse(f.content); } catch { continue; }
    const sc = pkg?.scripts; if (!sc) continue;
    const script = sc.dev ? "dev" : sc.start ? "start" : null;
    if (!script) continue;
    if (dir === "" && !rootFallback) rootFallback = { dir: "", script };
    const cmd = String(sc[script] || "");
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (!(WEB_DEV.test(cmd) || Object.keys(deps).some((d) => WEB_DEV.test(d)))) continue;
    const depth = dir ? dir.split("/").length : 0;
    const named = /(^|\/)(app|web|frontend|client|site|www)$/.test(dir) ? 1 : 0;
    const score = (dir === "" ? 4 : 0) + named * 2 - depth + (WEB_DEV.test(cmd) ? 1 : 0);
    if (!best || score > best.score) best = { dir, script, score };
  }
  return best ? { dir: best.dir, script: best.script } : rootFallback;
}
// Detect the router kind + base dir for the live component-preview route, from
// the flat file list (mirrors the inject-loop the WebContainer boot uses, but the
// agent's proxy injects the bridge so here we only need to find the route home).
function detectRouterFlat(files: { path: string }[], appBase: string): { kind: "app" | "pages" | "static"; base: string } {
  const paths = new Set(files.map((f) => f.path));
  const exists = (p: string) => paths.has(`${p}.tsx`) || paths.has(`${p}.jsx`) || paths.has(`${p}.ts`) || paths.has(`${p}.js`);
  for (const layout of [`${appBase}app/layout`, `${appBase}src/app/layout`])
    if (exists(layout)) return { kind: "app", base: layout.replace(/\/layout$/, "") };
  for (const doc of [`${appBase}pages/_document`, `${appBase}src/pages/_document`])
    if (exists(doc)) return { kind: "pages", base: doc.replace(/\/_document$/, "") };
  for (const dir of [`${appBase}pages`, `${appBase}src/pages`])
    if (files.some((f) => f.path.startsWith(`${dir}/`) && /\.[tj]sx?$/.test(f.path))) return { kind: "pages", base: dir };
  return { kind: "static", base: "" };
}

// Resolve a bridge-reported source file to a key in the sent-file cache. The
// bridge path is relative to the dev-server root (= the app subdir), so we also
// try prefixing appDir and a suffix/endsWith match.
function resolveLocalPath(file: string, appDir: string, keys: Iterable<string>): string | null {
  const noSlash = file.replace(/^\//, "");
  const cands = new Set<string>([file, noSlash]);
  if (appDir) cands.add(`${appDir}/${noSlash}`);
  const parts = noSlash.split("/");
  for (let i = 0; i < parts.length; i++) cands.add(parts.slice(i).join("/"));
  const keySet = new Set(keys);
  for (const c of cands) if (keySet.has(c)) return c;
  for (const k of keySet) if (k.endsWith("/" + noSlash)) return k;
  return null;
}

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
  const [pages, setPages] = useState<WcPageRoute[]>([]);
  const [route, setRoute] = useState("/");
  // the component currently being previewed (Components tab) + its live props
  const [previewComp, setPreviewComp] = useState<{ path: string; name: string; controls: PropControl[]; props: Record<string, any> } | null>(null);
  const [past, setPast] = useState<{ path: string; before: string; after: string }[]>([]);
  const [future, setFuture] = useState<{ path: string; before: string; after: string }[]>([]);

  const commentsKey = projectId || "run";
  const comments = useComments((s) => s.byProject[commentsKey] || []);
  const commentsPanelOpen = useComments((s) => s.panelOpen);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wcRef = useRef<any>(null);
  const handleRef = useRef<any>(null);
  // router kind/base detected at boot, for the live component-preview route
  const routerRef = useRef<{ kind: "app" | "pages" | "static"; base: string } | null>(null);
  // subdir the app is served from (e.g. "app"), so routes are relative to it
  const appDirRef = useRef("");
  const append = (s: string) => setLog((l) => [...l.slice(-400), s]);

  // ── local-runner path (run on the user's machine via the companion agent) ──
  const runnerToken = useRunner((s) => s.token);
  const runtime = useRunner((s) => s.runtime);
  const runtimeRef = useRef(runtime); runtimeRef.current = runtime;
  const runnerTokenRef = useRef(runnerToken); runnerTokenRef.current = runnerToken;
  const localRunIdRef = useRef<string | null>(null);
  const localFilesRef = useRef<Map<string, string>>(new Map()); // path -> content, for editFile reads
  const localStopRef = useRef<(() => void) | null>(null); // close the log SSE stream
  const [localBackend, setLocalBackend] = useState<ReturnType<typeof makeWcBackend> | undefined>(undefined);

  const post = useCallback((msg: any) => iframeRef.current?.contentWindow?.postMessage(msg, "*"), []);

  const writeThrough = useCallback(async (path: string, content: string) => {
    // local runner: patch the agent's copy (→ HMR) and the on-disk folder (persist)
    if (localRunIdRef.current && runnerTokenRef.current) {
      localFilesRef.current.set(path, content);
      try { await writeLocalFiles(runnerTokenRef.current, localRunIdRef.current, [{ path, content }]); } catch { /* best-effort */ }
      if (handleRef.current) { try { await writeFiles(handleRef.current, [{ path, content }]); } catch { /* best-effort */ } }
      return;
    }
    const wc = wcRef.current;
    if (!wc) return;
    await wc.fs.writeFile(path, content);
    if (handleRef.current) { try { await writeFiles(handleRef.current, [{ path, content }]); } catch { /* best-effort */ } }
  }, []);
  const writeThroughRef = useRef(writeThrough); writeThroughRef.current = writeThrough;

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
    () => localBackend ?? (url && wcRef.current ? makeWcBackend(wcRef.current, handleRef.current, (p, b, a) => record(p, b, a)) : undefined),
    [url, record, localBackend]
  );

  // Edit the source file backing the selected element, then let HMR re-render.
  const editFile = useCallback(async (line: number | undefined, file: string | undefined, fn: (content: string, node: any) => string | null) => {
    // local runner: read from the sent-file cache (no WC fs), AST-edit, write back.
    if (localRunIdRef.current) {
      if (!file || !line) return;
      const path = resolveLocalPath(file, appDirRef.current, localFilesRef.current.keys());
      if (!path) return;
      const content = localFilesRef.current.get(path);
      if (content == null) return;
      const node = findNodeByLine(parseJsx(content), content, line);
      if (!node) return;
      const next = fn(content, node);
      if (next && next !== content) { record(path, content, next); await writeThrough(path, next); }
      return;
    }
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
  const clearLog = useCallback(() => setLog([]), []);

  // Navigate the running app to a route (Pages tab) — point the iframe at it and
  // drop the current selection (it belonged to the previous page).
  const goToRoute = useCallback((r: string) => {
    if (!url || !iframeRef.current) return;
    iframeRef.current.src = url.replace(/\/$/, "") + (r === "/" ? "/" : r);
    setRoute(r);
    setSelected(null);
    setSelectedId(null);
    if (r !== "/__nova_preview") setPreviewComp(null); // navigated off the component preview
  }, [url]);

  // Preview a single project component live, by itself, in the running app frame
  // (Components tab). Writes an ephemeral route into the WebContainer ONLY — never
  // through to disk/git — that renders just this component, then navigates to it.
  // It inherits the app's real layout/providers/CSS, so app-tied components work.
  // Write the preview route (pre-registered at boot) for a component with the
  // given props, so navigating to it renders <Component {...props} />.
  const writePreviewFile = useCallback(async (componentPath: string, name: string, props: Record<string, any>) => {
    const info = routerRef.current;
    if (!info || info.kind === "static") return;
    const file = info.kind === "app" ? `${info.base}/__nova_preview/page.tsx` : `${info.base}/__nova_preview.tsx`;
    const src = previewSource(relImport(file, componentPath), name, props);
    // ephemeral preview route — written to the runtime only, never through to disk/git
    if (localRunIdRef.current && runnerTokenRef.current) {
      try { await writeLocalFiles(runnerTokenRef.current, localRunIdRef.current, [{ path: file, content: src }]); } catch { /* best-effort */ }
      return;
    }
    const wc = wcRef.current;
    if (!wc) return;
    await wc.fs.writeFile(file, src);
  }, []);

  const previewComponent = useCallback(async (componentPath: string) => {
    const local = !!localRunIdRef.current;
    const wc = wcRef.current;
    const info = routerRef.current;
    if (!url || (!local && !wc)) { append("\n[nova] Start the app (▶) before previewing a component."); return; }
    if (!info || info.kind === "static") {
      append("\n[nova] Live component preview needs a Next.js app (App or Pages Router).");
      return;
    }
    const name = pascalName(componentPath);
    let controls: PropControl[] = [];
    try {
      const key = resolveLocalPath(componentPath, appDirRef.current, localFilesRef.current.keys()) || componentPath;
      const content = local ? localFilesRef.current.get(key) ?? null : await wc!.fs.readFile(componentPath, "utf-8");
      if (content) controls = extractComponentControls(content);
    } catch { /* no props */ }
    const props: Record<string, any> = {};
    for (const c of controls) props[c.name] = c.default;
    setPreviewComp({ path: componentPath, name, controls, props });
    try {
      await writePreviewFile(componentPath, name, props);
      goToRoute("/__nova_preview");
    } catch (e: any) {
      append("\n[nova] Couldn't write the preview route: " + (e?.message || e));
    }
  }, [url, goToRoute, writePreviewFile]);

  // Live-edit a previewed component's prop → rewrite the route → HMR re-renders.
  const setPreviewProp = useCallback((name: string, value: any) => {
    setPreviewComp((pc) => {
      if (!pc) return pc;
      const props = { ...pc.props, [name]: value };
      writePreviewFile(pc.path, pc.name, props).catch(() => {});
      return { ...pc, props };
    });
  }, [writePreviewFile]);

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
      } else if (d.type === "nova-console") {
        append("\n[app] " + (d.text || ""));
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

  // derive the app's pages/routes from its files (for the Pages tab)
  useEffect(() => {
    if (!url || !backend) { setPages([]); setRoute("/"); return; }
    let alive = true;
    backend.list().then((list) => {
      if (!alive) return;
      const seen = new Set<string>();
      const out: WcPageRoute[] = [];
      for (const f of list) {
        if (f.category !== "page") continue;
        const r = routeForPage(f.path, appDirRef.current);
        if (r == null || seen.has(r)) continue;
        seen.add(r);
        out.push({ route: r, label: r === "/" ? "/ (home)" : r, path: f.path });
      }
      out.sort((a, b) => a.route.localeCompare(b.route));
      setPages(out);
    });
    return () => { alive = false; };
  }, [url, backend]);

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
    const useLocal = runtimeRef.current === "local" && !!runnerTokenRef.current;

    // Run the project on the native companion agent instead of a WebContainer.
    // The agent injects the SAME bridge into the served HTML (via its proxy), so
    // selection/inspect/tree/component-preview all work identically — only
    // execution moves to the user's machine.
    async function bootLocal() {
      const token = runnerTokenRef.current as string;
      const runKey = `nova-local-run:${projectId}`;
      const hadRun = !!localRunIdRef.current; // in-session restart vs. a fresh mount
      if (localRunIdRef.current) { try { stopLocalRun(token, localRunIdRef.current); } catch { /* gone */ } localRunIdRef.current = null; try { sessionStorage.removeItem(runKey); } catch { /* no ss */ } }
      if (localStopRef.current) { localStopRef.current(); localStopRef.current = null; }
      routerRef.current = { kind: "static", base: "" };
      const demo = projectId === "__demo__";
      let files: { path: string; content: string; encoding?: "base64" }[];
      if (demo) {
        files = [
          { path: "package.json", content: JSON.stringify({ name: "nova-demo", scripts: { dev: "node server.js" } }) },
          { path: "server.js", content: "const http=require('http');http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<body style=\"font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#0a0a0a;color:#ccff02\"><h1>\\u2713 The local runner is running your app</h1></body>')}).listen(3000,()=>console.log('Local:   http://localhost:3000/'));" },
        ];
      } else {
        const handle = await getHandle(projectId as string);
        if (!handle) throw new Error("The local runner needs a folder-backed project (a full clone on disk). Set a projects folder in Settings, then re-import the repo.");
        if (!(await verifyPermission(handle, false))) throw new Error("Folder permission denied.");
        handleRef.current = handle;
        setPhase("mounting");
        files = await readFlatFiles(handle);
      }
      if (cancelled) return;
      const app = demo ? { dir: "", script: "dev" } : detectAppRootFlat(files);
      if (!app) throw new Error("Couldn't find a runnable web app here — no package.json with a dev or start script (Vite/Next/etc.).");
      appDirRef.current = app.dir;
      const appBase = app.dir ? app.dir + "/" : "";
      if (app.dir) append(`[nova] Running the web app in ./${app.dir} on your machine\n`);
      // apply Nova-managed env vars by merging them into the .env.local we send
      try {
        const overlay = parseEnv(projectId ? useEnvVars.getState().byProject[projectId] || "" : "");
        if (Object.keys(overlay).length) {
          const envPath = `${appBase}.env.local`;
          const cur = files.find((f) => f.path === envPath);
          const merged = mergeEnv(cur?.content || "", overlay);
          if (cur) cur.content = merged; else files.push({ path: envPath, content: merged });
          append(`[nova] Applied ${Object.keys(overlay).length} env var(s) to ${appBase}.env.local\n`);
        }
      } catch { /* best-effort */ }
      // seed the edit-read cache (text files) + a backend for the Pages tab — from
      // the REAL project files, before adding the ephemeral preview route below.
      localFilesRef.current = new Map(files.filter((f) => !f.encoding).map((f) => [f.path, f.content]));
      const fileList = files.map((f) => ({ path: f.path, category: classifyFile(f.path, fileKind(f.path) || "jsx") }));
      setLocalBackend({
        list: async () => fileList,
        read: async (p: string) => localFilesRef.current.get(p) ?? null,
        write: async (p: string, content: string) => { await writeThroughRef.current(p, content); return { ok: true }; },
      });

      // detect the router + pre-register the live component-preview route NOW, so
      // the dev server scans it at startup (routes added after start can 404 — same
      // constraint as the WebContainer path). previewComponent just rewrites it.
      routerRef.current = detectRouterFlat(files, appBase);
      const rinfo = routerRef.current;
      if (rinfo.kind === "app") files.push({ path: `${rinfo.base}/__nova_preview/page.tsx`, content: previewPlaceholder() });
      else if (rinfo.kind === "pages") files.push({ path: `${rinfo.base}/__nova_preview.tsx`, content: previewPlaceholder() });

      // re-attach to a still-running agent run after a Nova reload (skip reinstall).
      // Only on a fresh mount — an in-session restart wants a clean run.
      if (!hadRun) {
        let prevRid: string | null = null;
        try { prevRid = sessionStorage.getItem(runKey); } catch { /* no ss */ }
        if (prevRid) {
          const att = await attachRun(token, prevRid);
          if (cancelled) return;
          if (att) {
            localRunIdRef.current = prevRid;
            append("[nova] Re-attached to the dev server already running on your machine (skipping reinstall).\n");
            setPhase("starting");
            localStopRef.current = streamLogs(
              token, prevRid,
              (s) => { if (!cancelled) append(s); },
              () => { if (!cancelled) { setUrl(runnerProxyUrl()); setPhase("ready"); } },
              (code) => { if (!cancelled && code) { setError(`The dev server exited (code ${code}). Check the console for details.`); setPhase("error"); } if (code) { try { sessionStorage.removeItem(runKey); } catch { /* no ss */ } } },
            );
            return;
          }
          try { sessionStorage.removeItem(runKey); } catch { /* no ss */ }
        }
      }

      setPhase("installing");
      append(`$ npm install + npm run ${app.script} (on your machine)\n`);
      const rid = await runProject(token, files, { bridge: APP_BRIDGE, cwd: app.dir, script: app.script, install: true });
      if (cancelled) { try { stopLocalRun(token, rid); } catch { /* gone */ } return; }
      localRunIdRef.current = rid;
      try { sessionStorage.setItem(runKey, rid); } catch { /* no ss */ }
      setPhase("starting");
      localStopRef.current = streamLogs(
        token, rid,
        (s) => { if (!cancelled) append(s); },
        () => { if (!cancelled) { setUrl(runnerProxyUrl()); setPhase("ready"); } },
        (code) => { if (!cancelled && code) { setError(`The dev server exited (code ${code}). Check the console for details.`); setPhase("error"); } if (code) { try { sessionStorage.removeItem(runKey); } catch { /* no ss */ } } },
      );
    }

    (async () => {
      setError(null); setUrl(null); setLog([]); setLocalBackend(undefined);
      try {
        if (!projectId) throw new Error("No project specified.");
        if (useLocal) { await bootLocal(); return; }
        localRunIdRef.current = null; // back on the in-browser path
        if (typeof window !== "undefined" && !(window as any).crossOriginIsolated)
          throw new Error("This page isn't cross-origin isolated, so the in-browser runtime can't start. Try a hard refresh.");
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

        // Find which directory actually holds the runnable web app (the repo root
        // is often a Hardhat/monorepo with the frontend in app/, apps/web, …).
        const app = demo ? { dir: "", script: "dev" } : await findAppRoot(wc);
        if (!app) throw new Error("Couldn't find a runnable web app here — no package.json with a dev or start script (Vite/Next/etc.). If the app lives in a subfolder, it should still be detected; otherwise this repo may be contracts/library-only.");
        if (cancelled) return;
        appDirRef.current = app.dir;
        const appBase = app.dir ? app.dir + "/" : "";
        if (app.dir) append(`[nova] Running the web app in ./${app.dir}\n`);

        try {
          await wc.fs.mkdir(`${appBase}public`, { recursive: true }).catch(() => {});
          await wc.fs.writeFile(`${appBase}public/nova-bridge.js`, APP_BRIDGE);
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
        routerRef.current = { kind: "static", base: "" };
        for (const rel of ["index.html", "public/index.html", "app/layout.tsx", "app/layout.jsx", "src/app/layout.tsx", "src/app/layout.jsx", "pages/_document.tsx", "pages/_document.jsx", "src/pages/_document.tsx", "src/pages/_document.jsx"]) {
          const p = appBase + rel;
          if (await tryInject(p)) {
            if (/\bapp\/layout\./.test(rel)) routerRef.current = { kind: "app", base: p.replace(/\/layout\.[tj]sx$/, "") };
            else if (/pages\/_document\./.test(rel)) routerRef.current = { kind: "pages", base: p.replace(/\/_document\.[tj]sx$/, "") };
            break;
          }
        }
        try { const pub = await wc.fs.readdir(`${appBase}public`); for (const name of pub) if (/\.html?$/i.test(name)) await tryInject(`${appBase}public/` + name); } catch { /* no public */ }
        // Pre-register the live component-preview route BEFORE the dev server
        // starts, so Next picks it up in its initial route scan. (WebContainer fs
        // events don't reliably trigger Next's runtime route detection, so a route
        // added later would 404 forever.) previewComponent just rewrites this file.
        try {
          const info = routerRef.current;
          if (info?.kind === "app") {
            await wc.fs.mkdir(`${info.base}/__nova_preview`, { recursive: true }).catch(() => {});
            await wc.fs.writeFile(`${info.base}/__nova_preview/page.tsx`, previewPlaceholder());
          } else if (info?.kind === "pages") {
            await wc.fs.writeFile(`${info.base}/__nova_preview.tsx`, previewPlaceholder());
          }
        } catch { /* best-effort */ }
        // Apply the project's Nova-managed env vars: merge them into the app's
        // .env.local (Nova wins) so the dev server (Vite/Next) loads them. Stored
        // encrypted client-side; only ever written into this local container.
        try {
          const overlay = parseEnv(projectId ? useEnvVars.getState().byProject[projectId] || "" : "");
          if (Object.keys(overlay).length) {
            let existing = "";
            try { existing = await wc.fs.readFile(`${appBase}.env.local`, "utf-8"); } catch { /* none yet */ }
            await wc.fs.writeFile(`${appBase}.env.local`, mergeEnv(existing, overlay));
            append(`[nova] Applied ${Object.keys(overlay).length} env var(s) to ${appBase}.env.local\n`);
          }
        } catch { /* best-effort */ }

        const script = app.script;
        const spawnOpts = app.dir ? { cwd: app.dir } : undefined;

        // node_modules cache: if a snapshot exists for this exact lockfile, mount
        // it and skip install. Purely an accelerator — any failure here falls
        // through to a normal install, so boot behaves identically without it.
        let cacheKey: string | null = null;
        let restored = false;
        try {
          let lockText = "";
          for (const ln of ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"]) {
            try { lockText = await wc.fs.readFile(`${appBase}${ln}`, "utf-8"); if (lockText) break; } catch { /* next */ }
          }
          if (lockText) {
            cacheKey = "v1:" + (await hashLock(lockText));
            const snap = await getDepSnapshot(cacheKey);
            if (snap && !cancelled) {
              setPhase("installing");
              append("\n[nova] Restoring node_modules from cache (skipping install)…\n");
              await wc.fs.mkdir(`${appBase}node_modules`, { recursive: true }).catch(() => {});
              await wc.mount(snap, { mountPoint: `${appBase}node_modules` });
              restored = true;
            }
          }
        } catch { /* fall back to a normal install */ }

        if (!restored) {
          setPhase("installing");
          append(`$ npm install${app.dir ? ` (in ./${app.dir})` : ""}`);
          const install = await wc.spawn("npm", ["install"], spawnOpts);
          install.output.pipeTo(new WritableStream({ write: (d: string) => { if (!cancelled) append(d); } }));
          const code = await install.exit;
          if (cancelled) return;
          if (code !== 0) throw new Error(`npm install exited with code ${code}.`);
        }

        setPhase("starting");
        append(`\n$ npm run ${script}`);
        wc.on("server-ready", (_port: number, serverUrl: string) => {
          if (cancelled) return;
          setUrl(serverUrl);
          setPhase("ready");
          // first install only: snapshot node_modules in the background for next time
          if (cacheKey && !restored) {
            wc.export(`${appBase}node_modules`, { format: "binary" })
              .then((snap: Uint8Array) => putDepSnapshot(cacheKey as string, snap))
              .then(() => append("\n[nova] Cached node_modules — restarts will skip install."))
              .catch(() => { /* quota / unavailable */ });
          }
        });
        wc.on("error", (e: any) => !cancelled && setError(e?.message || String(e)));
        const dev = await wc.spawn("npm", ["run", script], spawnOpts);
        dev.output.pipeTo(new WritableStream({ write: (d: string) => { if (!cancelled) append(d); } }));
      } catch (e: any) {
        if (!cancelled) { setError(e?.message || String(e)); setPhase("error"); }
      }
    })();
    return () => {
      cancelled = true;
      // close the local log stream; the dev server keeps running on the agent
      // (the next local boot stops the previous run before starting a new one).
      if (localStopRef.current) { localStopRef.current(); localStopRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, runId, active]);

  return {
    phase, log, error, url, selected, selectedId, tree, surface, backend,
    pages, route, goToRoute, previewComponent, previewComp, setPreviewProp,
    past, future, undo, redo, editFile,
    iframeRef, restart, clearLog, refreshTree, pickLayer, hoverLayer,
    setSelected, setSelectedId,
  };
}
