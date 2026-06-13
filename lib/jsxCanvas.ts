import type { EditorNode } from "./types";

// Inject data-wfc-id="..." into each JSX element's opening tag so the rendered
// DOM can be mapped back to a node on click. Insertions are applied back-to-front
// to keep earlier offsets valid.
export function injectJsxIds(source: string, tree: EditorNode[]): string {
  const inserts: { at: number; text: string }[] = [];
  const collect = (n: EditorNode) => {
    if (n.sourceLocation && n.tag !== "{expr}") {
      const tagAt = source.indexOf(n.tag, n.sourceLocation.start);
      if (tagAt !== -1) {
        inserts.push({ at: tagAt + n.tag.length, text: ` data-wfc-id="${n.id}"` });
      }
    }
    n.children.forEach(collect);
  };
  tree.forEach(collect);

  inserts.sort((a, b) => b.at - a.at);
  let out = source;
  for (const ins of inserts) {
    out = out.slice(0, ins.at) + ins.text + out.slice(ins.at);
  }
  return out;
}

// Best-effort transform of a JSX/TSX module into something runnable in the
// browser with Babel standalone: strip imports/exports and find a component
// to render. Not a real bundler — good enough to preview simple components.
export function prepareJsxModule(source: string): { code: string; render: string } {
  let code = source;

  // drop import lines
  code = code.replace(/^\s*import\s.*$/gm, "");

  // collect default export name
  let renderName = "";
  const defFn = code.match(/export\s+default\s+function\s+([A-Za-z0-9_]+)/);
  const defConst = code.match(/export\s+default\s+([A-Za-z0-9_]+)\s*;?/);
  if (defFn) renderName = defFn[1];
  else if (defConst) renderName = defConst[1];

  // strip export keywords (keep the declarations)
  code = code.replace(/export\s+default\s+function/g, "function");
  code = code.replace(/export\s+default\s+/g, "");
  code = code.replace(/export\s+(const|function|let|var|class)/g, "$1");

  // fallback: first declared function/const component (Capitalized)
  if (!renderName) {
    const m = code.match(/(?:function|const)\s+([A-Z][A-Za-z0-9_]*)/);
    if (m) renderName = m[1];
  }

  return { code, render: renderName };
}
