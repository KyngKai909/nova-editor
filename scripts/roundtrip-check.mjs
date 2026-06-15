// Round-trip guard for the static-page publish path.
//
// Parses public/landing.html, serializes it back with the SAME char-level rules
// the editor's canvas publish path uses (lib/htmlSerialize.mjs), and asserts the
// serialization is non-lossy: the full <head> (every meta/link/title) survives,
// the doctype keeps its casing, attributes aren't over-escaped, and void
// elements stay self-closed. Tree-walking here uses parse5 (a dep already), but
// the escaping/quoting/self-closing rules are imported, so this protects the
// exact logic that ships. The authoritative end-to-end check is the in-browser
// import (DOMParser → serializeClean); this is the fast, dependency-free guard.
//
// Run: node scripts/roundtrip-check.mjs   (or: npm run test:roundtrip)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "parse5";
import {
  RAW_TEXT_ELEMENTS,
  escapeText,
  serializeAttr,
  isSelfClosing,
} from "../lib/htmlSerialize.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";
const MATHML_NS = "http://www.w3.org/1998/Math/MathML";
const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, "..", "public", "landing.html");

// --- parse5 mirror of lib/htmlParser.ts → serializeElement ------------------
function serializeEl(node) {
  const tag = node.tagName;
  let attrs = "";
  for (const a of node.attrs) attrs += serializeAttr(a.name, a.value);

  const isForeign = node.namespaceURI === SVG_NS || node.namespaceURI === MATHML_NS;
  const children = node.childNodes || [];
  if (isSelfClosing(tag, isForeign, children.length > 0)) return `<${tag}${attrs} />`;

  const inner = RAW_TEXT_ELEMENTS.has(tag)
    ? children.map((c) => c.value || "").join("")
    : children.map(serializeChild).join("");

  const first = children[0];
  const lead = tag === "html" && !(first && first.nodeName === "#text") ? "\n" : "";
  return `<${tag}${attrs}>` + lead + inner + `</${tag}>`;
}

function serializeChild(node) {
  if (node.nodeName === "#text") return escapeText(node.value || "");
  if (node.nodeName === "#comment") return `<!--${node.data || ""}-->`;
  if (node.tagName) return serializeEl(node);
  return "";
}

function serialize(html) {
  const doc = parse(html);
  const htmlEl = doc.childNodes.find((c) => c.tagName === "html");
  const dt = html.match(/<!doctype[^>]*>/i);
  return (dt ? dt[0] : "<!DOCTYPE html>") + "\n" + serializeEl(htmlEl) + "\n";
}

// --- assertions -------------------------------------------------------------
const src = readFileSync(FILE, "utf8");
const out = serialize(src);

const failures = [];
const ok = (cond, msg) => cond || failures.push(msg);
const has = (needle, msg) => ok(out.includes(needle), msg || `missing: ${needle}`);

// 1. The full <head> survives — every SEO/social tag, in its source form.
has('<meta name="description"', "dropped <meta name=description>");
has('<meta name="theme-color" content="#08080a" />', "dropped/altered theme-color");
has('<link rel="canonical" href="https://nova-editor-six.vercel.app/" />', "dropped canonical");
for (const p of ["og:type", "og:url", "og:title", "og:description", "og:image"]) {
  has(`property="${p}"`, `dropped og tag: ${p}`);
}
for (const n of ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
  has(`name="${n}"`, `dropped twitter tag: ${n}`);
}
has("<title>Nova — The visual editor for real code</title>", "dropped/altered <title>");

// 2. Doctype keeps its lowercase casing.
ok(out.startsWith("<!doctype html>\n"), "doctype casing/leading not preserved");
ok(!out.includes("<!DOCTYPE html>"), "doctype was upper-cased");

// 3. Attributes are not over-escaped: the font URL keeps raw `&`.
has(
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk",
  "ampersand in font URL was over-escaped to &amp;"
);
ok(!out.includes("&amp;family="), "ampersand in font URL was over-escaped to &amp;");

// 4. Void elements stay self-closed; bare boolean attrs stay bare.
has("<br />", "void <br> lost its self-close");
has('<meta charset="utf-8" />', "void <meta> lost its self-close");
has('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />', "crossorigin not bare");
has("<button disabled ", "disabled not bare");
ok(!out.includes('disabled=""'), 'disabled expanded to disabled=""');
ok(!out.includes('crossorigin=""'), 'crossorigin expanded to crossorigin=""');
ok(!out.includes('aria-hidden=""'), 'aria-hidden expanded to aria-hidden=""');

// 5. `&amp;` in body copy round-trips (not under-escaped to a raw `&`).
has("Claude, GPT &amp; more", "&amp; in body copy was under-escaped");

// 6. Re-parse the output and confirm the head element count is preserved.
const headBefore = parse(src).childNodes.find((c) => c.tagName === "html")
  .childNodes.find((c) => c.tagName === "head").childNodes.filter((c) => c.tagName).length;
const headAfter = parse(out).childNodes.find((c) => c.tagName === "html")
  .childNodes.find((c) => c.tagName === "head").childNodes.filter((c) => c.tagName).length;
ok(headBefore === headAfter, `head element count changed: ${headBefore} → ${headAfter}`);

// --- report -----------------------------------------------------------------
if (failures.length) {
  console.error(`✗ round-trip guard FAILED (${failures.length}):`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`✓ round-trip guard passed — <head> (${headAfter} tags), doctype, escaping, and void elements all preserved.`);
