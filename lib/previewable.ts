import type { SourceFile } from "./types";

// Decide whether a file can render as a standalone component on the design
// canvas. It can't when it's a Next.js metadata/route/middleware file, when it
// (or anything it imports) pulls in Next.js runtime or server-only APIs, or when
// it imports local modules the editor doesn't load into the bundler (stores,
// utilities, CSS — i.e. non .html/.jsx/.tsx files). For those, the Run tab (the
// real dev server) is the right preview, so we show a calm notice instead of a
// raw esbuild error.

const META_FILE = /(^|\/)(apple-icon|icon|opengraph-image|twitter-image|favicon|sitemap|robots|manifest)\.[tj]sx?$/;
const ROUTE_FILE = /(^|\/)route\.[tj]sx?$/;
const MIDDLEWARE = /(^|\/)middleware\.[tj]sx?$/;

// Next.js runtime modules that only work inside a running Next app.
const NEXT_RUNTIME = /^next\/(link|navigation|router|image|font|headers|og|server|script|dynamic|cache)\b/;
// Server-only / Node built-ins.
const SERVER_IMPORT = /^(server-only|node:|fs|path|crypto|child_process|os|stream|http|https|net)$/;

const EXTS = ["", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".json", ".css", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"];

const norm = (p: string) => p.replace(/\/+/g, "/").replace(/^\//, "");

// Resolve a local/aliased import to a loaded file path, or null if not loaded.
function resolveLocal(spec: string, importer: string, paths: Set<string>): string | null {
  const tries: string[] = [];
  if (spec.startsWith("@/") || spec.startsWith("~/")) {
    tries.push("/" + spec.slice(2), "/src/" + spec.slice(2));
  } else if (spec.startsWith("/")) {
    tries.push(spec);
  } else {
    const dir = "/" + importer.replace(/[^/]*$/, "");
    tries.push(new URL(spec, "file://" + dir).pathname);
  }
  for (const t of tries) {
    for (const ext of EXTS) {
      const cand = norm(t + ext);
      if (paths.has(cand)) return cand;
    }
  }
  return null;
}

function importsOf(content: string): string[] {
  const re = /import\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) out.push(m[1] || m[2] || m[3]);
  return out;
}

export function notPreviewableReason(path: string, content: string, files: SourceFile[]): string | null {
  if (META_FILE.test(path)) return "This is a Next.js metadata file — it generates an icon/image, not a page.";
  if (ROUTE_FILE.test(path)) return "This is an API route handler — it runs on the server and has no visual output.";
  if (MIDDLEWARE.test(path)) return "This is Next.js middleware — it runs on the server, with no visual output.";

  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const paths = new Set(files.map((f) => f.path));

  // Walk the local import graph (bounded). Flag the first thing that can't run
  // on the canvas, so the notice explains the actual reason.
  const visited = new Set<string>();
  const queue: Array<[string, string]> = [[path, content]];
  let steps = 0;
  while (queue.length && steps++ < 500) {
    const [p, c] = queue.shift()!;
    if (visited.has(p)) continue;
    visited.add(p);
    for (const spec of importsOf(c)) {
      if (NEXT_RUNTIME.test(spec)) return "This uses Next.js runtime features (routing, image, fonts) that only run in the live app.";
      if (SERVER_IMPORT.test(spec)) return "This file uses server-only APIs that can't run on the design canvas.";
      const isLocal = spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("@/") || spec.startsWith("~/");
      if (!isLocal) continue; // npm package — esm.sh resolves it
      const resolved = resolveLocal(spec, p, paths);
      if (!resolved) return "This imports project modules the canvas can't load (stores, utilities or styles). Preview it in Run.";
      const child = byPath.get(resolved);
      if (child != null && !visited.has(resolved)) queue.push([resolved, child]);
    }
  }
  return null;
}
