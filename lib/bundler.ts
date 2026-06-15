import * as esbuild from "esbuild-wasm";
import type { SourceFile } from "./types";

const ESBUILD_VERSION = "0.28.1";
const CDN = "https://esm.sh";

let initPromise: Promise<void> | null = null;
function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = esbuild.initialize({
      wasmURL: `https://unpkg.com/esbuild-wasm@${ESBUILD_VERSION}/esbuild.wasm`,
      worker: true,
    });
  }
  return initPromise;
}

// Does this file need real bundling? (imports a local file or a non-react npm
// package). React-only / import-free components render fine with plain Babel.
export function needsBundling(content: string): boolean {
  const importRe = /import\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(content))) {
    const spec = m[1];
    if (spec.startsWith(".") || spec.startsWith("/")) return true; // local file
    const pkg = spec.replace(/^(@[^/]+\/[^/]+|[^/]+).*$/, "$1");
    if (pkg !== "react" && pkg !== "react-dom") return true; // 3rd-party dep
  }
  return false;
}

const loaderFor = (path: string): esbuild.Loader => {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".json")) return "json";
  return "js";
};

// Cache of fetched remote (esm.sh) module text, so re-bundling after an edit
// doesn't re-download dependencies. Persists for the page session.
const httpCache = new Map<string, string>();

// Turn a CSS import into a JS module that injects a <style> tag. For CSS
// modules it also exports an identity class-name map so `styles.foo` resolves.
function cssToJs(cssText: string, path: string): string {
  const inject = `var __s=document.createElement("style");__s.textContent=${JSON.stringify(
    cssText
  )};document.head.appendChild(__s);`;
  if (/\.module\.css$/.test(path)) {
    const map: Record<string, string> = {};
    for (const m of cssText.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)) map[m[1]] = m[1];
    return `${inject}export default ${JSON.stringify(map)};`;
  }
  return `${inject}export default {};`;
}

const EXTS = ["", ".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"];

// Bundle a JSX/TSX entry (with its local + npm imports) into a single runnable
// IIFE, resolving 3rd-party deps via esm.sh. The entry is wrapped so it renders
// the component into #root. Returns the JS text. Throws on failure (caller falls
// back to the Babel renderer).
export async function bundleComponent(
  files: SourceFile[],
  entryPath: string,
  instrumentedEntry: string
): Promise<string> {
  await ensureInit();

  const vfs = new Map<string, string>();
  for (const f of files) {
    vfs.set("/" + f.path.replace(/^\//, ""), f.path === entryPath ? instrumentedEntry : f.content);
  }
  const entryKey = "/" + entryPath.replace(/^\//, "");

  const bootstrap = `
import React from "react";
import { createRoot } from "react-dom/client";
import * as __M from ${JSON.stringify(entryKey)};
const Comp = __M.default || Object.values(__M).find((v) => typeof v === "function");
const el = document.getElementById("root");
if (Comp) createRoot(el).render(React.createElement(Comp));
else el.innerHTML = "<p style='color:#888;font-family:system-ui'>No component export found.</p>";
`;

  const resolveVfs = (spec: string, importer: string): string | null => {
    const base = importer && importer !== "<bootstrap>" ? importer.replace(/[^/]*$/, "") : "/";
    const joined = new URL(spec, "file://" + base).pathname;
    for (const ext of EXTS) {
      const cand = (joined + ext).replace(/\/+/g, "/");
      if (vfs.has(cand)) return cand;
    }
    return null;
  };

  const plugin: esbuild.Plugin = {
    name: "nova-resolver",
    setup(build) {
      // synthetic bootstrap entry
      build.onResolve({ filter: /^<bootstrap>$/ }, () => ({ path: "<bootstrap>", namespace: "boot" }));
      build.onLoad({ filter: /.*/, namespace: "boot" }, () => ({ contents: bootstrap, loader: "tsx", resolveDir: "/" }));

      // already-absolute http imports (and their relatives) -> http namespace
      build.onResolve({ filter: /^https?:\/\// }, (a) => ({ path: a.path, namespace: "http" }));
      build.onResolve({ filter: /.*/, namespace: "http" }, (a) => ({
        path: new URL(a.path, a.importer).toString(),
        namespace: "http",
      }));
      build.onLoad({ filter: /.*/, namespace: "http" }, async (a) => {
        let text = httpCache.get(a.path);
        if (text === undefined) {
          const res = await fetch(a.path);
          if (!res.ok) throw new Error(`fetch ${a.path} → ${res.status}`);
          text = await res.text();
          httpCache.set(a.path, text);
        }
        if (a.path.endsWith(".css")) return { contents: cssToJs(text, a.path), loader: "js" };
        return { contents: text, loader: loaderFor(a.path) };
      });

      // TS path aliases "@/x" and "~/x" → project root (or /src) in the vfs.
      build.onResolve({ filter: /^(@\/|~\/)/ }, (a) => {
        if (a.namespace === "http") return undefined;
        const rest = a.path.slice(2);
        for (const prefix of ["/", "/src/"]) {
          const p = resolveVfs(prefix + rest, "<root>");
          if (p) return { path: p, namespace: "vfs" };
        }
        return undefined; // not in the loaded set — let it error out clearly
      });

      // local (relative/absolute) files from the virtual FS
      build.onResolve({ filter: /^[./]/ }, (a) => {
        if (a.namespace === "http") return undefined;
        const p = resolveVfs(a.path, a.importer);
        if (p) return { path: p, namespace: "vfs" };
        return undefined;
      });
      build.onLoad({ filter: /.*/, namespace: "vfs" }, (a) => {
        const contents = vfs.get(a.path) ?? "";
        if (a.path.endsWith(".css")) return { contents: cssToJs(contents, a.path), loader: "js" };
        return { contents, loader: loaderFor(a.path), resolveDir: a.path.replace(/[^/]*$/, "") };
      });

      // bare npm specifiers -> esm.sh
      build.onResolve({ filter: /^[^./]/ }, (a) => {
        if (a.namespace === "http") return undefined;
        return { path: `${CDN}/${a.path}`, namespace: "http" };
      });
    },
  };

  try {
    const result = await esbuild.build({
      entryPoints: ["<bootstrap>"],
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      target: "es2020",
      logLevel: "silent",
      define: {
        "process.env.NODE_ENV": '"production"',
        global: "globalThis",
      },
      plugins: [plugin],
    });
    return result.outputFiles![0].text;
  } catch (e: any) {
    throw new Error(formatBundleError(e, entryPath));
  }
}

function formatBundleError(e: any, entryPath: string): string {
  const msgs = e?.errors as esbuild.Message[] | undefined;
  if (msgs?.length) {
    return msgs
      .map((m) => {
        const loc = m.location;
        const where = loc ? `\n  ${loc.file.replace("/", "") || entryPath}:${loc.line}:${loc.column}` : "";
        const line = loc?.lineText ? `\n  ${loc.lineText.trim()}` : "";
        return `${m.text}${where}${line}`;
      })
      .join("\n\n");
  }
  return e?.message || String(e);
}
