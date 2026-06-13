import { parse } from "@babel/parser";
import type { EditorNode } from "./types";

let counter = 0;
const nextId = () => `n${counter++}`;

// Parse JSX/TSX source into an editable node tree. Each node carries the
// exact source span of its className value and its text children so that
// edits can be spliced back into the original string with no reformatting.
export function parseJsx(code: string): EditorNode[] {
  counter = 0;
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
    errorRecovery: true,
  });

  const roots: EditorNode[] = [];

  const walk = (node: any): EditorNode | null => {
    if (!node) return null;
    if (node.type === "JSXElement") {
      const opening = node.openingElement;
      const tag = nameOf(opening.name);
      const attributes: Record<string, string> = {};
      let classList: string[] = [];
      let classLocation: EditorNode["classLocation"] = null;
      const jsxStyle: NonNullable<EditorNode["jsxStyle"]> = {
        objExists: false,
        props: {},
        tagInsertAt: opening.name.end!,
      };
      const jsxAttrs: NonNullable<EditorNode["jsxAttrs"]> = [];

      for (const attr of opening.attributes) {
        if (attr.type !== "JSXAttribute" || !attr.name) continue;
        const aName = attr.name.name as string;

        // record every attribute (for the component props editor)
        const attrLoc = { start: attr.start!, end: attr.end! };
        if (!attr.value) {
          jsxAttrs.push({ name: aName, value: "true", valueLoc: null, attrLoc, isExpr: false });
        } else if (attr.value.type === "StringLiteral") {
          jsxAttrs.push({
            name: aName,
            value: attr.value.value,
            valueLoc: { start: attr.value.start! + 1, end: attr.value.end! - 1 },
            attrLoc,
            isExpr: false,
          });
        } else {
          jsxAttrs.push({ name: aName, value: "{…}", valueLoc: null, attrLoc, isExpr: true });
        }
        if (
          (aName === "className" || aName === "class") &&
          attr.value &&
          attr.value.type === "StringLiteral"
        ) {
          classList = attr.value.value.split(/\s+/).filter(Boolean);
          // span of the string contents, inside the quotes
          classLocation = { start: attr.value.start! + 1, end: attr.value.end! - 1 };
        } else if (
          aName === "style" &&
          attr.value &&
          attr.value.type === "JSXExpressionContainer" &&
          attr.value.expression.type === "ObjectExpression"
        ) {
          const obj = attr.value.expression;
          jsxStyle.objExists = true;
          jsxStyle.objStart = obj.start! + 1;
          for (const prop of obj.properties) {
            if (prop.type !== "ObjectProperty") continue;
            const key =
              prop.key.type === "Identifier"
                ? prop.key.name
                : prop.key.type === "StringLiteral"
                ? prop.key.value
                : null;
            if (key && prop.value.start != null) {
              jsxStyle.props[key] = { valStart: prop.value.start!, valEnd: prop.value.end! };
            }
          }
        } else if (attr.value && attr.value.type === "StringLiteral") {
          attributes[aName] = attr.value.value;
        } else {
          attributes[aName] = "{…}";
        }
      }

      const children: EditorNode[] = [];
      let textContent = "";
      let textLocation: EditorNode["textLocation"] = null;

      for (const child of node.children) {
        if (child.type === "JSXText") {
          const t = child.value.trim();
          if (t) {
            textContent += (textContent ? " " : "") + t;
            if (!textLocation) {
              textLocation = { start: child.start!, end: child.end! };
            } else {
              textLocation.end = child.end!;
            }
          }
        } else if (child.type === "JSXElement") {
          const c = walk(child);
          if (c) children.push(c);
        } else if (child.type === "JSXExpressionContainer") {
          // dynamic content — show a placeholder, not editable
          children.push({
            id: nextId(),
            tag: "{expr}",
            attributes: {},
            classList: [],
            textContent: "{ dynamic }",
            children: [],
            sourceLocation: { start: child.start!, end: child.end! },
          });
        }
      }

      return {
        id: nextId(),
        tag,
        attributes,
        classList,
        textContent,
        children,
        sourceLocation: { start: node.start!, end: node.end! },
        classLocation,
        textLocation,
        jsxStyle,
        jsxAttrs,
      };
    }
    return null;
  };

  // Find every top-level JSXElement returned/used in the file.
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "JSXElement") {
      const tree = walk(node);
      if (tree) roots.push(tree);
      return; // don't descend; walk already handled children
    }
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "start" || key === "end") continue;
      const val = (node as any)[key];
      if (Array.isArray(val)) val.forEach(visit);
      else if (val && typeof val === "object" && val.type) visit(val);
    }
  };

  visit(ast.program);
  return roots;
}

function nameOf(name: any): string {
  if (!name) return "?";
  if (name.type === "JSXIdentifier") return name.name;
  if (name.type === "JSXMemberExpression")
    return `${nameOf(name.object)}.${nameOf(name.property)}`;
  return "?";
}
