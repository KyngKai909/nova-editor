import { parse } from "@babel/parser";

// Locate the component's default-export function and the program's type
// declarations (so a referenced Props interface/alias can be resolved).
function parseComponent(content: string): { fn: any; typesByName: Record<string, any> } | null {
  const ast = parse(content, { sourceType: "module", plugins: ["jsx", "typescript"], errorRecovery: true });
  let fn: any = null;
  const byName: Record<string, any> = {};
  const typesByName: Record<string, any> = {};

  const noteType = (d: any) => {
    if (d?.type === "TSInterfaceDeclaration" && d.id) typesByName[d.id.name] = d.body;       // TSInterfaceBody
    if (d?.type === "TSTypeAliasDeclaration" && d.id) typesByName[d.id.name] = d.typeAnnotation; // TSType
  };

  for (const node of ast.program.body as any[]) {
    noteType(node);
    if (node.type === "FunctionDeclaration" && node.id) byName[node.id.name] = node;
    if (node.type === "VariableDeclaration") {
      for (const d of node.declarations) {
        if (d.id?.type === "Identifier" && d.init && (d.init.type === "ArrowFunctionExpression" || d.init.type === "FunctionExpression")) byName[d.id.name] = d.init;
      }
    }
    if (node.type === "ExportNamedDeclaration") {
      noteType(node.declaration);
      if (node.declaration?.type === "FunctionDeclaration" && node.declaration.id) byName[node.declaration.id.name] = node.declaration;
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
  return fn ? { fn, typesByName } : null;
}

// Best-effort: extract the prop names a component declares from its default
// export's destructured props param — e.g. `function Card({ title, n })`.
export function extractComponentProps(content: string): string[] {
  try {
    const parsed = parseComponent(content);
    const param = parsed?.fn?.params?.[0];
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

export interface PropControl {
  name: string;
  type: "text" | "number" | "boolean" | "select" | "json";
  options?: string[];
  default: any;
}

// Map a prop's TS type (+ any literal default) to an editable control.
function controlFromType(name: string, tsType: any, literalDefault: any): PropControl | null {
  const t = tsType?.type;
  if (t === "TSFunctionType") return null; // callbacks aren't user-editable
  if (t === "TSStringKeyword") return { name, type: "text", default: literalDefault ?? "" };
  if (t === "TSNumberKeyword") return { name, type: "number", default: literalDefault ?? 0 };
  if (t === "TSBooleanKeyword") return { name, type: "boolean", default: literalDefault ?? false };
  if (t === "TSUnionType") {
    const opts = tsType.types
      .filter((m: any) => m.type === "TSLiteralType" && m.literal?.type === "StringLiteral")
      .map((m: any) => m.literal.value);
    if (opts.length) return { name, type: "select", options: opts, default: literalDefault ?? opts[0] };
  }
  if (t === "TSArrayType" || t === "TSTupleType") return { name, type: "json", default: literalDefault ?? [] };
  if (t === "TSTypeLiteral" || t === "TSTypeReference") return { name, type: "json", default: literalDefault ?? {} };
  // no usable type — infer from a literal default if present, else a text field
  if (typeof literalDefault === "number") return { name, type: "number", default: literalDefault };
  if (typeof literalDefault === "boolean") return { name, type: "boolean", default: literalDefault };
  return { name, type: "text", default: literalDefault ?? "" };
}

// Derive editable controls (Storybook-style) for a component's props, from its
// destructured props param + the prop types (inline literal or a referenced
// interface/alias). Returns [] when nothing can be determined.
export function extractComponentControls(content: string): PropControl[] {
  try {
    const parsed = parseComponent(content);
    const param = parsed?.fn?.params?.[0];
    if (param?.type !== "ObjectPattern") return [];

    // name -> TS type, from the param's type annotation (inline or referenced)
    const typeMembers: Record<string, any> = {};
    const collect = (members: any[]) => {
      for (const m of members || []) {
        if (m.type === "TSPropertySignature" && m.key?.type === "Identifier") typeMembers[m.key.name] = m.typeAnnotation?.typeAnnotation;
      }
    };
    const ta = param.typeAnnotation?.typeAnnotation;
    if (ta?.type === "TSTypeLiteral") collect(ta.members);
    else if (ta?.type === "TSTypeReference" && ta.typeName?.type === "Identifier") {
      const resolved = parsed!.typesByName[ta.typeName.name];
      if (resolved?.type === "TSInterfaceBody") collect(resolved.body);
      else if (resolved?.type === "TSTypeLiteral") collect(resolved.members);
    }

    const out: PropControl[] = [];
    for (const p of param.properties as any[]) {
      if (p.type !== "ObjectProperty" || p.key?.type !== "Identifier") continue;
      let literalDefault: any;
      if (p.value?.type === "AssignmentPattern") {
        const r = p.value.right;
        if (r.type === "StringLiteral" || r.type === "NumericLiteral" || r.type === "BooleanLiteral") literalDefault = r.value;
      }
      const ctrl = controlFromType(p.key.name, typeMembers[p.key.name], literalDefault);
      if (ctrl) out.push(ctrl);
    }
    return out;
  } catch {
    return [];
  }
}
