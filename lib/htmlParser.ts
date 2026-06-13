import type { EditorNode } from "./types";
import type { AssetMap } from "./assets";
import { rewriteAssetUrls } from "./assets";
import { STORAGE_SHIM } from "./canvasBridge";

const SKIP_TAGS = new Set(["script", "style", "meta", "link", "base", "br", "hr"]);

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
export function serializeClean(doc: Document): string {
  const clone = doc.cloneNode(true) as Document;
  clone.querySelectorAll("[data-wfc-id]").forEach((el) =>
    el.removeAttribute("data-wfc-id")
  );
  clone.querySelectorAll("[data-wfc-injected]").forEach((el) => el.remove());
  clone.documentElement.removeAttribute("data-wfc-fragment");

  const isFragment = isFragmentDoc(doc);
  if (isFragment) {
    return formatFragment(clone.body.innerHTML);
  }
  return "<!DOCTYPE html>\n" + clone.documentElement.outerHTML + "\n";
}

// Light re-indent for fragment bodies so the diff stays readable.
function formatFragment(inner: string): string {
  return inner.trim();
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
  // p-[18px]) render live. For full docs that already have their own Tailwind
  // build, disable preflight so we don't reset the page's base styles.
  if (fragment || tailwind) {
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
