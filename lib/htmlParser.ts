import type { EditorNode } from "./types";
import type { AssetMap } from "./assets";
import { rewriteAssetUrls } from "./assets";
import { STORAGE_SHIM } from "./canvasBridge";
import {
  RAW_TEXT_ELEMENTS,
  escapeText,
  serializeAttr,
  isSelfClosing,
} from "./htmlSerialize.mjs";

const SKIP_TAGS = new Set(["script", "style", "meta", "link", "base", "br", "hr"]);
const SVG_NS = "http://www.w3.org/2000/svg";
const MATHML_NS = "http://www.w3.org/1998/Math/MathML";

// Parse an HTML string into a Document and stamp every element with a stable
// data-wfc-id (document order). This Document is the clean source of truth:
// edits mutate it, and serializeClean() turns it back into HTML with the ids
// (and any injected instrumentation) stripped.
export function parseDocument(html: string): Document {
  const isFragment = !/<html[\s>]/i.test(html);
  const doc = new DOMParser().parseFromString(html, "text/html");
  // remember whether the source was a bare fragment (so the canvas knows to
  // supply a Tailwind runtime instead of assuming the page styles itself).
  doc.documentElement.setAttribute("data-wfc-fragment", isFragment ? "1" : "0");
  // Preserve the author's exact doctype line. The parsed DOM keeps only the
  // doctype *name* ("html") and re-serializes it upper-cased ("<!DOCTYPE html>"),
  // so stash the original substring and re-emit it verbatim on serialize.
  const dt = html.match(/<!doctype[^>]*>/i);
  if (dt) doc.documentElement.setAttribute("data-wfc-doctype", dt[0]);

  let i = 0;
  doc.querySelectorAll("*").forEach((el) => {
    el.setAttribute("data-wfc-id", `h${i++}`);
  });
  return doc;
}

export function isFragmentDoc(doc: Document): boolean {
  return doc.documentElement.getAttribute("data-wfc-fragment") === "1";
}

// Build the editable layer tree from the document body.
export function buildTree(doc: Document): EditorNode[] {
  const out: EditorNode[] = [];
  for (const child of Array.from(doc.body.children)) {
    const n = nodeOf(child);
    if (n) out.push(n);
  }
  return out;
}

function nodeOf(el: Element): EditorNode | null {
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return null;

  const attributes: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === "class" || attr.name.startsWith("data-wfc")) continue;
    attributes[attr.name] = attr.value;
  }
  const classList = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean);

  const children: EditorNode[] = [];
  let textContent = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || "").trim();
      if (t) textContent += (textContent ? " " : "") + t;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const c = nodeOf(node as Element);
      if (c) children.push(c);
    }
  }

  return {
    id: el.getAttribute("data-wfc-id")!,
    tag,
    attributes,
    classList,
    textContent,
    children,
    sourceLocation: null,
  };
}

// Serialize the clean Document back to an HTML string with all instrumentation
// removed — what the user would commit / what the diff shows.
//
// This walks the DOM and emits HTML by hand (see serializeElement) rather than
// using the browser's `outerHTML`, which is a lossy re-serialization: it
// upper-cases the doctype, drops void-element `/`, expands bare boolean attrs,
// and over-escapes `&` in URLs. The hand serializer preserves the author's
// conventions so a no-op edit round-trips to (near) byte-identical source — only
// the single whitespace the HTML parser always discards (between <html> and
// <head>) is re-synthesised.
export function serializeClean(doc: Document): string {
  const clone = doc.cloneNode(true) as Document;
  clone.querySelectorAll("[data-wfc-id]").forEach((el) =>
    el.removeAttribute("data-wfc-id")
  );
  clone.querySelectorAll("[data-wfc-injected]").forEach((el) => el.remove());
  const doctype = clone.documentElement.getAttribute("data-wfc-doctype");
  clone.documentElement.removeAttribute("data-wfc-fragment");
  clone.documentElement.removeAttribute("data-wfc-doctype");

  if (isFragmentDoc(doc)) {
    return serializeChildren(clone.body).trim();
  }
  return (doctype || "<!DOCTYPE html>") + "\n" + serializeElement(clone.documentElement) + "\n";
}

// Serialize one element and its subtree.
function serializeElement(el: Element): string {
  // localName preserves SVG/MathML case (e.g. linearGradient, feTurbulence)
  // while staying lowercase for HTML.
  const tag = el.localName;
  let attrs = "";
  for (const a of Array.from(el.attributes)) attrs += serializeAttr(a.name, a.value);

  const isForeign = el.namespaceURI === SVG_NS || el.namespaceURI === MATHML_NS;
  if (isSelfClosing(tag, isForeign, el.childNodes.length > 0)) {
    return `<${tag}${attrs} />`;
  }

  // script/style hold raw (CDATA-like) text that must not be escaped.
  const inner = RAW_TEXT_ELEMENTS.has(tag)
    ? el.textContent || ""
    : serializeChildren(el);

  // The HTML parser drops whitespace between <html> and its first child, so a
  // round-trip would collapse `<html>\n<head>` to `<html><head>`. Re-synthesise
  // that one newline when <html> opens straight onto an element.
  const lead =
    tag === "html" && el.firstChild?.nodeType !== Node.TEXT_NODE ? "\n" : "";

  return `<${tag}${attrs}>` + lead + inner + `</${tag}>`;
}

function serializeChildren(el: Element): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) out += serializeNode(node);
  return out;
}

function serializeNode(node: ChildNode): string {
  switch (node.nodeType) {
    case Node.ELEMENT_NODE:
      return serializeElement(node as Element);
    case Node.TEXT_NODE:
      return escapeText(node.nodeValue || "");
    case Node.COMMENT_NODE:
      return `<!--${node.nodeValue || ""}-->`;
    case Node.CDATA_SECTION_NODE:
      return `<![CDATA[${node.nodeValue || ""}]]>`;
    default:
      return "";
  }
}

// Build the instrumented srcDoc string for the canvas iframe: keeps every
// element's data-wfc-id, injects the selection bridge, rewrites local asset
// URLs to blob URLs, and (for bare fragments) supplies a Tailwind runtime.
export function instrument(
  doc: Document,
  assets: AssetMap,
  bridge: string,
  baseHref?: string,
  tailwind?: boolean
): string {
  const clone = doc.cloneNode(true) as Document;
  const head = clone.head;
  const fragment = isFragmentDoc(doc);

  // First script in the document: shim storage so opaque-origin sandbox doesn't
  // crash the imported site's scripts (see STORAGE_SHIM).
  const shim = clone.createElement("script");
  shim.setAttribute("data-wfc-injected", "1");
  shim.textContent = STORAGE_SHIM;
  head.insertBefore(shim, head.firstChild);

  if (baseHref) {
    const base = clone.createElement("base");
    base.setAttribute("href", baseHref);
    base.setAttribute("data-wfc-injected", "1");
    head.insertBefore(base, head.firstChild);
  }

  // Tailwind JIT so visually-added utility classes (incl. arbitrary values like
  // p-[18px]) render live. But if the page already ships its OWN Tailwind CDN +
  // config (e.g. a custom fontFamily theme), DON'T re-inject — our config assigns
  // tailwind.config wholesale and would clobber theirs (breaking fonts/theme), and
  // a second CDN is redundant since their runtime already JITs new classes. Only
  // inject for pages that use TW utility classes without shipping a runtime.
  const ownsTailwind = !!clone.querySelector('script[src*="tailwindcss.com"]');
  if (!ownsTailwind && (fragment || tailwind)) {
    const tw = clone.createElement("script");
    tw.src = "https://cdn.tailwindcss.com";
    tw.setAttribute("data-wfc-injected", "1");
    head.appendChild(tw);
    if (!fragment && tailwind) {
      const cfg = clone.createElement("script");
      cfg.setAttribute("data-wfc-injected", "1");
      cfg.textContent = "window.tailwind=window.tailwind||{};tailwind.config={corePlugins:{preflight:false}};";
      head.appendChild(cfg);
    }
  }

  const reset = clone.createElement("style");
  reset.setAttribute("data-wfc-injected", "1");
  reset.textContent = `
    [data-wfc-preview="1"] [data-wfc-id]{cursor:auto!important}
    [data-wfc-hover]{outline:1.5px solid rgba(204,255,2,.55)!important;outline-offset:-1px}
    [data-wfc-peek]{outline:1.5px dashed rgba(204,255,2,.7)!important;outline-offset:-1px}
    [data-wfc-sel]{outline:2px solid #ccff02!important;outline-offset:-1px}
    [data-wfc-editing]{outline:2px solid #ccff02!important;outline-offset:-1px;cursor:text!important}
  `;
  head.appendChild(reset);

  const script = clone.createElement("script");
  script.setAttribute("data-wfc-injected", "1");
  script.textContent = bridge;
  clone.body.appendChild(script);

  const serialized = "<!DOCTYPE html>\n" + clone.documentElement.outerHTML;
  return rewriteAssetUrls(serialized, assets);
}
