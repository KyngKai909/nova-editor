import { parse } from "@babel/parser";

// Best-effort: extract the prop names a component declares by reading its
// default export's destructured props param — e.g. `function Card({ title, n })`.
// Returns [] when props can't be determined (e.g. `function Card(props)`).
export function extractComponentProps(content: string): string[] {
  try {
    const ast = parse(content, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      errorRecovery: true,
    });

    let fn: any = null;
    const byName: Record<string, any> = {};

    for (const node of ast.program.body as any[]) {
      if (node.type === "FunctionDeclaration" && node.id) byName[node.id.name] = node;
      if (node.type === "VariableDeclaration") {
        for (const d of node.declarations) {
          if (d.id?.type === "Identifier" && d.init &&
              (d.init.type === "ArrowFunctionExpression" || d.init.type === "FunctionExpression")) {
            byName[d.id.name] = d.init;
          }
        }
      }
      if (node.type === "ExportNamedDeclaration" && node.declaration?.type === "FunctionDeclaration" && node.declaration.id) {
        byName[node.declaration.id.name] = node.declaration;
      }
      if (node.type === "ExportDefaultDeclaration") {
        const d = node.declaration;
        if (d.type === "FunctionDeclaration") fn = d;
        else if (d.type === "ArrowFunctionExpression" || d.type === "FunctionExpression") fn = d;
        else if (d.type === "Identifier") fn = byName[d.name] || null;
      }
    }
    if (!fn) {
      const names = Object.keys(byName);
      if (names.length === 1) fn = byName[names[0]];
    }

    const param = fn?.params?.[0];
    if (param?.type === "ObjectPattern") {
      return param.properties
        .filter((p: any) => p.type === "ObjectProperty" && p.key?.type === "Identifier")
        .map((p: any) => p.key.name);
    }
    return [];
  } catch {
    return [];
  }
}
