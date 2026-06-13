import { parse } from "parse5";

// Convert a byte offset in a string to a 1-based line number.
export function lineOfOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

// Map an HTML node id ("hN" = Nth element in document order) to its 1-based
// start line in `content`, using parse5's source-location info. This is a
// read-only locator — it never mutates the editing model.
export function htmlNodeLine(_doc: Document, nodeId: string, content: string): number {
  const n = parseInt(nodeId.replace(/^h/, ""), 10);
  if (Number.isNaN(n)) return 1;

  const tree = parse(content, { sourceCodeLocationInfo: true });
  let index = 0;
  let found = 1;

  const walk = (node: any): boolean => {
    const children = node.childNodes || [];
    for (const child of children) {
      // element nodes have a tagName; text/comment nodes don't
      if (child.tagName) {
        if (index === n) {
          found = child.sourceCodeLocation?.startLine ?? 1;
          return true;
        }
        index++;
      }
      if (child.childNodes && walk(child)) return true;
      // template content lives under child.content
      if (child.content && walk(child.content)) return true;
    }
    return false;
  };

  walk(tree);
  return found;
}
