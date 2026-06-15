// Some files can't render as a standalone component on the design canvas:
// Next.js metadata routes (apple-icon, opengraph-image, …), API route handlers,
// middleware, and anything importing server-only APIs (next/og, next/server,
// next/headers, server-only, node built-ins). For full web apps these are
// previewed by the Run tab (the real dev server in WebContainers), not by the
// per-component bundler — so instead of dumping a scary esbuild error, we show a
// friendly notice that points the user to Code view or Run.

const META_FILE = /(^|\/)(apple-icon|icon|opengraph-image|twitter-image|favicon|sitemap|robots|manifest)\.[tj]sx?$/;
const ROUTE_FILE = /(^|\/)route\.[tj]sx?$/;
const MIDDLEWARE = /(^|\/)middleware\.[tj]sx?$/;
const SERVER_IMPORT = /\bfrom\s+["'](next\/og|next\/server|next\/headers|server-only|node:[^"']+|fs|path|crypto|child_process)["']/;

export function notPreviewableReason(path: string, content: string): string | null {
  if (META_FILE.test(path)) return "This is a Next.js metadata file — it generates an icon/image, not a page.";
  if (ROUTE_FILE.test(path)) return "This is an API route handler — it runs on the server and has no visual output.";
  if (MIDDLEWARE.test(path)) return "This is Next.js middleware — it runs on the server, with no visual output.";
  if (SERVER_IMPORT.test(content)) return "This file uses server-only APIs that can't run on the design canvas.";
  return null;
}
