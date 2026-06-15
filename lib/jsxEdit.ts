import type { EditorNode } from "./types";

// Apply a className or text edit to JSX source by splicing at the exact span
// recorded during parse. Preserves all surrounding formatting. Returns the
// new source string (caller should re-parse afterwards to refresh spans).
export function spliceJsx(
  source: string,
  node: EditorNode,
  kind: "class" | "text",
  value: string
): string {
  const loc = kind === "class" ? node.classLocation : node.textLocation;
  if (!loc) {
    // No existing className attribute — try to add one after the tag name.
    if (kind === "class" && node.sourceLocation) {
      return insertClassName(source, node, value);
    }
    return source;
  }
  return source.slice(0, loc.start) + value + source.slice(loc.end);
}

// Set/replace a CSS property on a JSX element's inline `style={{...}}` object.
// `prop` is camelCase (e.g. "marginTop"). Empty value sets "" (React ignores it).
export function setJsxStyle(
  source: string,
  node: EditorNode,
  prop: string,
  value: string
): string {
  const info = node.jsxStyle;
  if (!info) return source;
  const jsValue = `"${value}"`;

  // existing property -> replace its value span
  const existing = info.props[prop];
  if (info.objExists && existing) {
    return source.slice(0, existing.valStart) + jsValue + source.slice(existing.valEnd);
  }
  // object exists but property missing -> insert at the front of the object
  if (info.objExists && info.objStart != null) {
    const insert = ` ${prop}: ${jsValue},`;
    return source.slice(0, info.objStart) + insert + source.slice(info.objStart);
  }
  // no style attribute at all -> add one after the tag name
  const at = info.tagInsertAt;
  return source.slice(0, at) + ` style={{ ${prop}: ${jsValue} }}` + source.slice(at);
}

// Set/replace a string prop on a JSX element. Existing string prop → splice its
// value; otherwise add a new `name="value"` attribute after the tag name.
export function setJsxProp(source: string, node: EditorNode, name: string, value: string): string {
  const attr = node.jsxAttrs?.find((a) => a.name === name);
  if (attr && attr.valueLoc && !attr.isExpr) {
    return source.slice(0, attr.valueLoc.start) + value + source.slice(attr.valueLoc.end);
  }
  const at = node.jsxStyle?.tagInsertAt;
  if (at == null) return source;
  return source.slice(0, at) + ` ${name}="${value}"` + source.slice(at);
}

// Remove a whole JSX element (its full opening→closing span). When the element
// sits alone on its line, also swallow that line's indentation + trailing newline
// so deletion doesn't leave a blank line behind. Returns null if unlocatable.
export function removeJsxNode(source: string, node: EditorNode): string | null {
  if (!node.sourceLocation) return null;
  let { start } = node.sourceLocation;
  let { end } = node.sourceLocation;
  let s = start;
  while (s > 0 && (source[s - 1] === " " || source[s - 1] === "\t")) s--;
  if (s === 0 || source[s - 1] === "\n") {
    start = s; // element starts the line — include its indentation
    if (source[end] === "\n") end++; // and drop the trailing newline
  }
  return source.slice(0, start) + source.slice(end);
}

// Remove a prop (whole attribute, plus the preceding space).
export function removeJsxProp(source: string, node: EditorNode, name: string): string {
  const attr = node.jsxAttrs?.find((a) => a.name === name);
  if (!attr) return source;
  let start = attr.attrLoc.start;
  if (source[start - 1] === " ") start -= 1;
  return source.slice(0, start) + source.slice(attr.attrLoc.end);
}

// PascalCase component name derived from a file path (Hello.jsx -> Hello).
export function componentNameFromPath(path: string): string {
  const base = (path.split("/").pop() || "Component").replace(/\.(jsx|tsx)$/i, "");
  const pascal = base
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
  return /^[A-Z]/.test(pascal) ? pascal : "C" + pascal;
}

// Relative ESM import path from one file to another (no extension).
export function relativeImportPath(fromPath: string, toPath: string): string {
  const from = fromPath.split("/").slice(0, -1);
  const to = toPath.replace(/\.(jsx|tsx)$/i, "").split("/");
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  const up = from.slice(i).map(() => "..");
  const down = to.slice(i);
  let rel = [...up, ...down].join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

// Add an import for `name` if the file doesn't already import it, placing it
// after the leading block of directives/imports.
export function ensureImport(content: string, name: string, importPath: string): string {
  if (new RegExp(`\\bimport\\s+${name}\\b`).test(content)) return content;
  const lines = content.split("\n");
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith("import ") || /^["']use \w+["'];?$/.test(t) || t === "") idx = i + 1;
    else break;
  }
  lines.splice(idx, 0, `import ${name} from "${importPath}";`);
  return lines.join("\n");
}

// Insert a brand-new className="..." into an element that had none.
function insertClassName(source: string, node: EditorNode, value: string): string {
  const start = node.sourceLocation!.start;
  // Find end of the tag name (e.g. after "<div").
  const tagNameEnd = source.indexOf(node.tag, start) + node.tag.length;
  return (
    source.slice(0, tagNameEnd) +
    ` className="${value}"` +
    source.slice(tagNameEnd)
  );
}
