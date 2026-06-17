"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, DEVICE_WIDTH } from "@/store/editorStore";
import { instrument } from "@/lib/htmlParser";
import { injectJsxIds, prepareJsxModule } from "@/lib/jsxCanvas";
import { setIframe, highlight, hoverElement, setPreview, markCanvasReady, resetCanvasReady, applyCommentPins, BRIDGE_SCRIPT, STORAGE_SHIM } from "@/lib/canvasBridge";
import { useComments } from "@/store/commentsStore";
import { bundleComponent, needsBundling } from "@/lib/bundler";
import { notPreviewableReason } from "@/lib/previewable";
import { getDragComponent, setDragComponent, getDragElement, setDragElement } from "@/lib/dnd";

function buildJsxDoc(source: string, tree: any, isolate: boolean): string {
  const injected = injectJsxIds(source, tree);
  const { code, render } = prepareJsxModule(injected);
  const renderCall = render
    ? `ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(${render}));`
    : `document.getElementById('root').innerHTML="<p style='color:#888;font-family:system-ui'>No component export detected — edits still apply to source.</p>";`;
  const body = isolate
    ? "body{margin:0;min-height:100vh;display:grid;place-items:center;padding:48px;background:transparent;font-family:system-ui,sans-serif}"
    : "body{margin:0;padding:16px;font-family:system-ui,sans-serif}";
  return `<!doctype html><html><head>
    <meta charset="utf-8"/>
    <script>${STORAGE_SHIM}</script>
    <script src="https://cdn.tailwindcss.com"></script>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <style>${body}
      [data-wfc-hover]{outline:1.5px solid rgba(204,255,2,.55)!important;outline-offset:-1px}
      [data-wfc-peek]{outline:1.5px dashed rgba(204,255,2,.7)!important;outline-offset:-1px}
      [data-wfc-sel]{outline:2px solid #ccff02!important;outline-offset:-1px}
      [data-wfc-editing]{outline:2px solid #ccff02!important;cursor:text!important}</style>
  </head><body><div id="root"></div>
    <script type="text/babel" data-presets="react,typescript">
      const {useState,useEffect,useRef,useMemo,useCallback,Fragment}=React;
      try { ${code}
        ${renderCall}
      } catch(err){
        document.getElementById('root').innerHTML="<pre style='color:#c33;white-space:pre-wrap;font-family:monospace'>Preview error: "+err.message+"\\n\\nEdits still apply to source.</pre>";
      }
    </script>
    <script>${BRIDGE_SCRIPT}</script>
  </body></html>`;
}

// Document for a fully bundled component (real imports resolved via esbuild).
function buildBundledDoc(bundleJs: string, isolate: boolean): string {
  const body = isolate
    ? "body{margin:0;min-height:100vh;display:grid;place-items:center;padding:48px;background:transparent;font-family:system-ui,sans-serif}"
    : "body{margin:0;padding:16px;font-family:system-ui,sans-serif}";
  return `<!doctype html><html><head>
    <meta charset="utf-8"/>
    <script>${STORAGE_SHIM}</script>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>${body}
      [data-wfc-hover]{outline:1.5px solid rgba(204,255,2,.55)!important;outline-offset:-1px}
      [data-wfc-peek]{outline:1.5px dashed rgba(204,255,2,.7)!important;outline-offset:-1px}
      [data-wfc-sel]{outline:2px solid #ccff02!important;outline-offset:-1px}
      [data-wfc-editing]{outline:2px solid #ccff02!important;cursor:text!important}</style>
  </head><body><div id="root"></div>
    <script>window.addEventListener("error",function(e){var r=document.getElementById("root");if(r&&!r.children.length)r.innerHTML="<pre style='color:#c33;white-space:pre-wrap;font-family:monospace'>Runtime error: "+e.message+"</pre>";});</script>
    <script>${bundleJs}</script>
    <script>${BRIDGE_SCRIPT}</script>
  </body></html>`;
}

// Shown in the canvas when a bundle fails — surfaces the real esbuild error.
function buildErrorDoc(message: string, isolate: boolean): string {
  const bg = isolate ? "transparent" : "#fff";
  const esc = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:${bg};font-family:ui-monospace,Menlo,monospace;display:grid;place-items:center;min-height:100vh;padding:32px}
    .box{max-width:560px;border:1px solid rgba(255,80,80,.3);background:rgba(255,60,60,.06);border-radius:12px;padding:20px;color:#e66}
    .t{font-family:system-ui,sans-serif;font-weight:600;font-size:13px;color:#f88;margin-bottom:10px;display:flex;align-items:center;gap:8px}
    pre{white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.6;margin:0;color:#f0a0a0}
  </style></head><body><div class="box">
    <div class="t">⚠ Could not bundle this component</div>
    <pre>${esc}</pre>
  </div></body></html>`;
}

// Shown when a file can't render on the design canvas (server-only / metadata /
// route files) — a calm pointer to Code view + Run, not a red error.
function buildNoticeDoc(message: string, isolate: boolean): string {
  const bg = isolate ? "transparent" : "#fff";
  const esc = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:${bg};font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:32px;color:#444}
    .box{max-width:420px;text-align:center}
    .ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;margin:0 auto 14px;background:rgba(120,120,120,.1);color:#888;font-size:22px}
    .t{font-weight:600;font-size:14px;color:#333;margin-bottom:6px}
    p{font-size:12.5px;line-height:1.6;margin:0;color:#777}
    .hint{margin-top:12px;font-size:11.5px;color:#999}
  </style></head><body><div class="box">
    <div class="ic">◍</div>
    <div class="t">Not previewable on the canvas</div>
    <p>${esc}</p>
    <p class="hint">Switch to <b>Code</b> to edit it, or hit <b>Run&nbsp;▶</b> to preview the whole app live in the canvas.</p>
  </div></body></html>`;
}

// Find a node by data-wfc-id in the editor tree (for right-click comments).
function findInTree(nodes: any[], id: string): any {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = findInTree(n.children, id);
    if (f) return f;
  }
  return null;
}

// Resolve a link href clicked in the canvas (preview) to a project page file, so
// cross-page links switch the canvas like browsing the real site. Handles
// absolute (/about), relative (./about.html), clean URLs (/about → about.html),
// directory indexes, and a basename fallback. Returns the file path or null.
function resolvePageHref(href: string, currentPath: string | null, files: { path: string }[]): string | null {
  const h = (href || "").split("#")[0].split("?")[0].trim();
  if (!h) return null;
  const pages = files.filter((f) => /\.html?$/i.test(f.path));
  if (!pages.length) return null;
  let raw: string;
  if (h.charAt(0) === "/") {
    raw = h.slice(1);
  } else {
    const dir = currentPath && currentPath.includes("/") ? currentPath.slice(0, currentPath.lastIndexOf("/") + 1) : "";
    raw = dir + h;
  }
  const parts: string[] = [];
  for (const seg of raw.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  const path = parts.join("/");
  const candidates = [path, path + ".html", path + ".htm", (path ? path + "/" : "") + "index.html", path || "index.html"];
  for (const c of candidates) {
    const m = pages.find((p) => p.path === c || p.path.replace(/^public\//, "") === c);
    if (m) return m.path;
  }
  const base = (path.split("/").pop() || path).replace(/\.html?$/i, "");
  if (base) {
    const m = pages.find((p) => (p.path.split("/").pop() || "").replace(/\.html?$/i, "") === base);
    if (m) return m.path;
  }
  return null;
}

export default function Canvas() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  const files = useEditor((s) => s.files);
  const assets = useEditor((s) => s.assets);
  const baseHref = useEditor((s) => s.baseHref);
  const activePath = useEditor((s) => s.activePath);
  const htmlDoc = useEditor((s) => s.htmlDoc);
  const tree = useEditor((s) => s.tree);
  const selectedId = useEditor((s) => s.selectedId);
  const hoveredId = useEditor((s) => s.hoveredId);
  const reloadKey = useEditor((s) => s.reloadKey);
  const usesTailwind = useEditor((s) => s.usesTailwind);
  const device = useEditor((s) => s.device);
  const customWidth = useEditor((s) => s.customWidth);
  const zoom = useEditor((s) => s.zoom);
  const previewMode = useEditor((s) => s.previewMode);
  const selectNode = useEditor((s) => s.selectNode);
  const hoverNode = useEditor((s) => s.hoverNode);
  const updateText = useEditor((s) => s.updateText);
  const insertComponent = useEditor((s) => s.insertComponent);
  const insertElement = useEditor((s) => s.insertElement);
  const projectId = useEditor((s) => s.projectId);
  const panelOpen = useComments((s) => s.panelOpen);
  const commentsByProject = useComments((s) => s.byProject);

  const file = files.find((f) => f.path === activePath);
  const isolate = file?.category === "component";
  const [doc, setDoc] = useState("");
  const [bundling, setBundling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!file) { setDoc(""); return; }

    // non-visual files (css/ts/json/config/md) aren't rendered on the canvas
    if (file.kind === "code") { setDoc(buildNoticeDoc("This is a code file — edit it in the Code view.", isolate)); return; }

    if (file.kind === "html") {
      const html = htmlDoc ? instrument(htmlDoc, assets, BRIDGE_SCRIPT, baseHref || undefined, usesTailwind) : "";
      // Tag the doc with reloadKey so a revert that produces byte-identical HTML
      // still changes srcDoc and forces a real iframe reload. Live edits mutate
      // the iframe DOM via postMessage without re-serializing srcDoc, so an undo
      // that rolls those back yields the same string — without this marker React
      // skips the srcDoc update, the iframe never reloads, and the optimistic
      // mutation lingers (undo appears to do nothing / needs a second click).
      setDoc(html ? `${html}\n<!--rk:${reloadKey}-->` : "");
      return;
    }

    // Server-only / metadata / route files can't render standalone — show a
    // calm notice (Code view / Run) instead of attempting to bundle them.
    const reason = notPreviewableReason(file.path, file.content, files);
    if (reason) { setDoc(buildNoticeDoc(reason, isolate)); return; }

    // JSX/TSX: bundle if it has real imports, else use the fast Babel renderer.
    if (needsBundling(file.content)) {
      setBundling(true);
      const injected = injectJsxIds(file.content, tree);
      bundleComponent(files, file.path, injected)
        .then((js) => { if (!cancelled) setDoc(buildBundledDoc(js, isolate)); })
        .catch((err) => { if (!cancelled) setDoc(buildErrorDoc(String(err?.message || err), isolate)); })
        .finally(() => { if (!cancelled) setBundling(false); });
    } else {
      setDoc(buildJsxDoc(file.content, tree, isolate));
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.path, file?.kind, reloadKey, file?.kind === "jsx" ? file?.content : null]);

  // Draw comment pins on the canvas while the Comments panel is open (cleared
  // otherwise). Queued through the bridge until the iframe is ready.
  useEffect(() => {
    const list = (projectId ? commentsByProject[projectId] : undefined) || [];
    const pins = panelOpen
      ? list.filter((c) => !c.resolved).map((c, i) => ({ id: c.elementId, key: String(i + 1), commentId: c.id, x: c.x, y: c.y }))
      : [];
    applyCommentPins(pins);
  }, [panelOpen, projectId, commentsByProject, doc]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d?.type) return;
      if (d.type === "wfc-select") selectNode(d.id);
      else if (d.type === "wfc-hover") hoverNode(d.id);
      else if (d.type === "wfc-navigate") {
        // a link to another project page was clicked in preview → switch to it
        const st = useEditor.getState();
        const target = resolvePageHref(d.href, st.activePath, st.files);
        if (target && target !== st.activePath) st.selectFile(target);
      }
      else if (d.type === "wfc-text") updateText(d.id, d.text);
      else if (d.type === "wfc-drop") {
        const comp = getDragComponent();
        const el = getDragElement();
        if (comp && d.id) insertComponent(comp, d.id, "after");
        else if (el && d.id) insertElement(el, d.id, "after");
        setDragComponent(null);
        setDragElement(null);
      } else if (d.type === "wfc-comment-click") {
        highlight(d.id);
        useComments.getState().setFocused(d.commentId);
      } else if (d.type === "wfc-context") {
        // right-click on the canvas → start a comment pinned where clicked
        const n = findInTree(useEditor.getState().tree, d.id);
        const label = n
          ? n.textContent ? n.textContent.slice(0, 28) : n.classList[0] ? `${n.tag}.${n.classList[0]}` : n.tag
          : d.id;
        useComments.getState().setPending({ elementId: d.id, label, x: d.x, y: d.y });
      } else if (d.type === "wfc-ready") {
        // the iframe's bridge is up — flush queued commands and re-apply state
        markCanvasReady();
        // signal the inspector to re-read computed styles now that the freshly
        // reloaded canvas is laid out (e.g. after undo/redo), so it isn't stale.
        useEditor.setState((s) => ({ canvasReadyTick: s.canvasReadyTick + 1 }));
        const st = useEditor.getState();
        highlight(st.selectedId);
        setPreview(st.previewMode);
        // re-draw comment pins on the freshly loaded canvas
        const cs = useComments.getState();
        const list = (st.projectId ? cs.byProject[st.projectId] : undefined) || [];
        applyCommentPins(cs.panelOpen ? list.filter((c) => !c.resolved).map((c, i) => ({ id: c.elementId, key: String(i + 1), commentId: c.id, x: c.x, y: c.y })) : []);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [selectNode, hoverNode, updateText, insertComponent, insertElement]);

  // register the iframe element once (its contentWindow is read fresh per post)
  useEffect(() => {
    setIframe(iframeRef.current);
    return () => setIframe(null);
  }, []);

  // a new srcDoc is about to load — invalidate readiness until wfc-ready
  useEffect(() => {
    resetCanvasReady();
  }, [doc]);

  useEffect(() => {
    const elc = containerRef.current;
    if (!elc) return;
    const update = (w: number) => setContainerW((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
    const ro = new ResizeObserver((e) => update(e[0].contentRect.width));
    ro.observe(elc);
    update(elc.clientWidth);
    return () => ro.disconnect();
  }, [file]);

  useEffect(() => { highlight(selectedId); }, [selectedId]);
  useEffect(() => { if (hoveredId !== selectedId) hoverElement(hoveredId); else hoverElement(null); }, [hoveredId, selectedId]);
  useEffect(() => { setPreview(previewMode); }, [previewMode]);

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-3">
        Select a file to start editing.
      </div>
    );
  }

  const width = customWidth ?? DEVICE_WIDTH[device];
  // auto-fit so the device frame always fits the available canvas width,
  // then apply the user's zoom on top (Webflow-style).
  const fit = containerW ? Math.min(1, (containerW - 56) / width) : 1;
  const scale = fit * zoom;

  return (
    <div
      ref={containerRef}
      className="scroll-thin relative h-full w-full overflow-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) selectNode(null);
      }}
    >
      {/* safe center: centers the frame but aligns to the start (and stays
          scrollable) when it's wider than the viewport, instead of clipping it */}
      <div className="flex min-h-full items-start [justify-content:safe_center] p-7">
        <div
          className="shrink-0"
          style={{
            width: width * scale,
            height: `calc((100dvh - 110px) * ${scale})`,
          }}
        >
          <div
            style={{
              width,
              height: "calc(100dvh - 110px)",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <div
              className={`relative h-full overflow-hidden rounded-xl border shadow-2xl transition-colors ${
                previewMode ? "border-line" : "border-line-2"
              } ${isolate ? "bg-[#0e0e11]" : "bg-white"}`}
              style={
                isolate
                  ? {
                      backgroundColor: "#0e0e11",
                      backgroundImage:
                        "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
                      backgroundSize: "18px 18px",
                    }
                  : undefined
              }
            >
              <iframe
                ref={iframeRef}
                title="canvas"
                // allow-same-origin is required: an opaque-origin sandbox makes
                // localStorage/cookies/indexedDB throw SecurityError in Chromium,
                // which crashes real imported sites and renders blank. True
                // isolation needs a separate-origin canvas (a follow-up); keys
                // are encrypted at rest in the meantime.
                className={`h-full w-full border-0 ${isolate ? "bg-transparent" : "bg-white"}`}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                srcDoc={doc}
              />
              {bundling && (
                <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-full border border-line bg-bg/90 px-3 py-1 text-[11px] text-ink-2 backdrop-blur">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Bundling imports…
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* device label */}
      <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-line bg-surface/80 px-2.5 py-0.5 text-[10px] tabular-nums text-ink-3 backdrop-blur">
        {isolate && <span className="text-accent">component · </span>}
        {customWidth ? "custom" : device} · {width}px · {Math.round(scale * 100)}%
      </div>
    </div>
  );
}
