import type { SourceFile } from "./types";

export function fileKind(path: string): SourceFile["kind"] | null {
  if (path.endsWith(".html") || path.endsWith(".htm")) return "html";
  if (path.endsWith(".jsx") || path.endsWith(".tsx")) return "jsx";
  return null;
}

// Classify a file as a full "page" (screen / document you navigate to) or a
// reusable "component". HTML files are always pages; JSX/TSX are components
// unless their path/name looks route-level.
export function classifyFile(path: string, kind: SourceFile["kind"]): SourceFile["category"] {
  if (kind === "html") return "page";
  const p = path.toLowerCase();
  if (/(^|\/)(pages|app|routes|views|screens)\//.test(p)) return "page";
  const name = (path.split("/").pop() || "").replace(/\.(jsx|tsx)$/i, "");
  if (/^(page|home|index|app|layout|screen|root)$/i.test(name) || /page$/i.test(name)) return "page";
  return "component";
}

const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|avif|ico|otf|ttf|woff2?|css|mp4|webm)$/i;

export function isAsset(path: string): boolean {
  return ASSET_RE.test(path);
}

// When a folder is uploaded, every path is prefixed with the folder name
// (e.g. "clearpath-website/index.html"). Strip that shared first segment so
// references inside the HTML ("assets/logo.png") line up with our file paths.
export function stripCommonRoot(paths: string[]): (p: string) => string {
  if (!paths.length) return (p) => p;
  const segs = paths.map((p) => p.split("/"));
  const first = segs[0][0];
  const allShare =
    segs.length > 1 && segs.every((s) => s.length > 1 && s[0] === first);
  return (p) => (allShare ? p.split("/").slice(1).join("/") : p);
}

// Build editable SourceFiles from raw {path, content} entries.
export function toSourceFiles(
  entries: { path: string; content: string }[]
): SourceFile[] {
  const strip = stripCommonRoot(entries.map((e) => e.path));
  const out: SourceFile[] = [];
  for (const { path: raw, content } of entries) {
    const path = strip(raw);
    const kind = fileKind(path);
    if (!kind) continue;
    out.push({
      path,
      name: path.split("/").pop() || path,
      kind,
      category: classifyFile(path, kind),
      content,
      original: content,
    });
  }
  return out;
}
