// @ts-check
// Char-level HTML serialization rules, shared by the browser-DOM serializer
// (lib/htmlParser.ts → serializeClean, the canvas publish path) and the Node
// round-trip guard (scripts/roundtrip-check.mjs). Keeping the escaping/quoting
// rules here means both paths stay byte-for-byte identical, so the guard tests
// the same logic the editor actually publishes.
//
// Why this exists: the old serializer used the browser's `outerHTML`, which is
// a *lossy* re-serialization of a parsed DOM — it upper-cases the doctype,
// drops the `/` on void elements (`<meta ... />` → `<meta ...>`), expands bare
// boolean attributes (`disabled` → `disabled=""`), and blanket-escapes every
// `&` in attribute values (`...&family=` → `...&amp;family=`). None of that is
// wrong HTML, but it churns the source on every publish. These helpers emit the
// author's conventions instead.

// HTML void elements: serialized self-closed (`<meta ... />`), no end tag.
export const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img",
  "input", "link", "meta", "param", "source", "track", "wbr",
]);

// Elements whose text content is raw (CDATA-like) and must NOT be escaped —
// their inner text is emitted verbatim (script bodies, CSS, JSON-LD, importmaps).
export const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);

// Escape a *text node* value. Text always escapes `&`, `<`, `>` (the HTML5
// text-serialization rule). This round-trips the common authoring convention of
// writing `&amp;` in copy: the parser decodes it to `&`, and we re-encode it.
/** @param {string} value */
export function escapeText(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Escape an *attribute* value. Per HTML5 (§13.3 "ambiguous ampersand") the only
// `&` that MUST be escaped inside an attribute is one that begins a character
// reference (`&amp;`, `&#160;`, `&copy;` …). A lone `&` in a query string like
// `...&family=Inter` is unambiguous and is left raw — matching how URLs are
// actually written, instead of the browser's blanket `&` → `&amp;`.
/** @param {string} value */
export function escapeAttrAmp(value) {
  return value.replace(
    /&(#[0-9]+;|#[xX][0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]*;)/g,
    "&amp;$1"
  );
}

// Serialize a single attribute (with a leading space). Three source-faithful
// touches vs. the browser default:
//  - empty value → bare attribute (`aria-hidden`, `disabled`, `crossorigin`),
//  - minimal `&` escaping (see escapeAttrAmp),
//  - smart quoting: prefer `"`, but fall back to `'` when the value contains a
//    `"` and no `'`, so an injected `style="… url("x") …"` stays readable
//    instead of turning into `&quot;` soup.
// data-wfc-* instrumentation attributes are never emitted (defence in depth —
// serializeClean strips them from the tree first).
/**
 * @param {string} name
 * @param {string} value
 */
export function serializeAttr(name, value) {
  if (name.startsWith("data-wfc")) return "";
  if (value === "") return " " + name;
  const escaped = escapeAttrAmp(value);
  if (escaped.includes('"') && !escaped.includes("'")) {
    return ` ${name}='${escaped}'`;
  }
  return ` ${name}="${escaped.replace(/"/g, "&quot;")}"`;
}

// Decide how an element with no children closes. HTML void elements and empty
// foreign (SVG/MathML) elements self-close as ` />`; everything else uses a
// real end tag (`<div></div>` — `<div />` is invalid in HTML and reparses).
/**
 * @param {string} localName lower/adjusted-case tag name
 * @param {boolean} isForeign element is in the SVG or MathML namespace
 * @param {boolean} hasChildren element has child nodes
 */
export function isSelfClosing(localName, isForeign, hasChildren) {
  if (VOID_ELEMENTS.has(localName)) return true;
  return isForeign && !hasChildren;
}
