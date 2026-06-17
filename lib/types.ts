// A single imported source file.
export interface SourceFile {
  path: string;          // e.g. "src/components/Hero.tsx"
  name: string;          // e.g. "Hero.tsx"
  kind: "html" | "jsx" | "code";  // html/jsx render on the canvas; code = text-only (Code view)
  category: "page" | "component" | "code"; // full screen vs reusable vs non-visual file
  content: string;       // current (possibly edited) source
  original: string;      // pristine source as imported (for diffing)
}

// A node in the editable tree. sourceLocation maps it back to the exact
// byte range in `content` so edits round-trip precisely.
export interface EditorNode {
  id: string;
  tag: string;
  attributes: Record<string, string>;
  classList: string[];
  textContent: string;      // only meaningful for leaf/text-bearing nodes
  children: EditorNode[];
  sourceLocation: { start: number; end: number } | null;
  // For className editing we need the exact span of the class string value.
  classLocation?: { start: number; end: number } | null;
  // For text editing, the exact span of the editable text.
  textLocation?: { start: number; end: number } | null;
  // For JSX inline-style editing: spans of the style object + its properties.
  jsxStyle?: {
    objExists: boolean;
    objStart?: number; // just inside `{{`
    props: Record<string, { valStart: number; valEnd: number }>; // camelKey -> value span
    tagInsertAt: number; // end of the opening tag name (to add a new style attr)
  };
  // For JSX component-instance prop editing: each attribute on the element.
  jsxAttrs?: {
    name: string;
    value: string; // display value ("{…}" for expressions)
    valueLoc: { start: number; end: number } | null; // string content span (editable)
    attrLoc: { start: number; end: number }; // whole attribute span (for removal)
    isExpr: boolean;
  }[];
}

export type EditKind = "class" | "text";

export interface PendingEdit {
  nodeId: string;
  kind: EditKind;
  value: string;
}
