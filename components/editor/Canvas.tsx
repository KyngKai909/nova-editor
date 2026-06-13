"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, DEVICE_WIDTH } from "@/store/editorStore";
import { instrument } from "@/lib/htmlParser";
import { injectJsxIds, prepareJsxModule } from "@/lib/jsxCanvas";
import { setIframe, highlight, hoverElement, setPreview, markCanvasReady, resetCanvasReady, BRIDGE_SCRIPT, STORAGE_SHIM } from "@/lib/canvasBridge";
import { bundleComponent, needsBundling } from "@/lib/bundler";
import { getDragComponent, setDragComponent } from "@/lib/dnd";

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
  const zoom = useEditor((s) => s.zoom);
  const previewMode = useEditor((s) => s.previewMode);
  const selectNode = useEditor((s) => s.selectNode);
  const hoverNode = useEditor((s) => s.hoverNode);
  const updateText = useEditor((s) => s.updateText);
  const insertComponent = useEditor((s) => s.insertComponent);

  const file = files.find((f) => f.path === activePath);
  const isolate = file?.category === "component";
  const [doc, setDoc] = useState("");
  const [bundling, setBundling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!file) { setDoc(""); return; }

    if (file.kind === "html") {
      setDoc(htmlDoc ? instrument(htmlDoc, assets, BRIDGE_SCRIPT, baseHref || undefined, usesTailwind) : "");
      return;
    }

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

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d?.type) return;
      if (d.type === "wfc-select") selectNode(d.id);
      else if (d.type === "wfc-hover") hoverNode(d.id);
      else if (d.type === "wfc-text") updateText(d.id, d.text);
      else if (d.type === "wfc-drop") {
        const comp = getDragComponent();
        if (comp && d.id) insertComponent(comp, d.id, "after");
        setDragComponent(null);
      } else if (d.type === "wfc-ready") {
        // the iframe's bridge is up — flush queued commands and re-apply state
        markCanvasReady();
        const st = useEditor.getState();
        highlight(st.selectedId);
        setPreview(st.previewMode);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [selectNode, hoverNode, updateText, insertComponent]);

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

  const width = DEVICE_WIDTH[device];
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
      <div className="flex min-h-full items-start justify-center p-7">
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
                // No allow-same-origin: the canvas runs untrusted code in an
                // opaque origin and cannot reach the parent (where keys live).
                className={`h-full w-full border-0 ${isolate ? "bg-transparent" : "bg-white"}`}
                sandbox="allow-scripts"
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
        {device} · {width}px · {Math.round(scale * 100)}%
      </div>
    </div>
  );
}
