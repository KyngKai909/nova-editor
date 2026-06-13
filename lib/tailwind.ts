import type { SourceFile } from "./types";
import type { Device } from "@/store/editorStore";

// ── detection ────────────────────────────────────────────────────────────────
export function detectTailwind(files: SourceFile[], content: string): boolean {
  if (files.some((f) => /(^|\/)tailwind\.config\.(js|ts|cjs|mjs)$/.test(f.path))) return true;
  const re =
    /\b(flex|grid|hidden|p-\d|px-\d|py-\d|pt-\d|m-\d|mx-\d|gap-\d|text-(xs|sm|base|lg|xl|\dxl)|font-(bold|semibold|medium|light)|bg-\w+-\d|rounded(-\w+)?|items-center|justify-(center|between|around)|w-\d|h-\d)\b/g;
  return (content.match(re) || []).length >= 5;
}

// Desktop is the base design; smaller breakpoints override down (Webflow-style),
// using Tailwind's max-* variants.
export function variantFor(device: Device): string {
  if (device === "tablet") return "max-lg:";
  if (device === "mobile") return "max-md:";
  return "";
}

// ── value → token helpers ────────────────────────────────────────────────────
const SPACE: [number, string][] = [
  [0, "0"], [2, "0.5"], [4, "1"], [6, "1.5"], [8, "2"], [10, "2.5"], [12, "3"], [14, "3.5"],
  [16, "4"], [20, "5"], [24, "6"], [28, "7"], [32, "8"], [36, "9"], [40, "10"], [44, "11"],
  [48, "12"], [56, "14"], [64, "16"], [80, "20"], [96, "24"],
];
function px(value: string): number | null {
  const m = value.trim().match(/^(-?[\d.]+)px$/);
  return m ? parseFloat(m[1]) : null;
}
function spaceTok(value: string): string {
  const n = px(value);
  if (n === null) return `[${value}]`;
  const hit = SPACE.find(([p]) => p === Math.abs(n));
  return hit ? hit[1] : `[${Math.abs(n)}px]`;
}
function sizeTok(value: string): string {
  if (value === "100%") return "full";
  if (value === "auto") return "auto";
  const n = px(value);
  if (n !== null) {
    const hit = SPACE.find(([p]) => p === n);
    if (hit) return hit[1];
  }
  return `[${value}]`;
}
function hex(value: string): string {
  const v = value.trim();
  if (v.startsWith("#")) return v;
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(",").map((x) => parseInt(x.trim(), 10));
    return "#" + [r, g, b].map((n) => (n || 0).toString(16).padStart(2, "0")).join("");
  }
  return v;
}

const FONT_SIZE: [number, string][] = [
  [12, "xs"], [14, "sm"], [16, "base"], [18, "lg"], [20, "xl"], [24, "2xl"], [30, "3xl"],
  [36, "4xl"], [48, "5xl"], [60, "6xl"], [72, "7xl"],
];
const RADIUS: [number, string][] = [
  [0, "-none"], [2, "-sm"], [4, ""], [6, "-md"], [8, "-lg"], [12, "-xl"], [16, "-2xl"], [24, "-3xl"],
];

// ── prop → class generator + conflict group ──────────────────────────────────
// Each entry: cls(value) -> utility (no variant); group -> regex matching the
// utilities this prop controls (so we can replace, not accumulate).
type Entry = { cls: (v: string) => string | null; group: RegExp };

const side = (p: string): Entry => ({
  cls: (v) => (v === "" ? null : `${px(v)! < 0 ? "-" : ""}${p}-${spaceTok(v)}`),
  group: new RegExp(`^-?${p}-`),
});

const MAP: Record<string, Entry> = {
  paddingTop: side("pt"), paddingRight: side("pr"), paddingBottom: side("pb"), paddingLeft: side("pl"),
  marginTop: side("mt"), marginRight: side("mr"), marginBottom: side("mb"), marginLeft: side("ml"),
  gap: { cls: (v) => `gap-${spaceTok(v)}`, group: /^gap-/ },
  width: { cls: (v) => (v === "auto" ? null : `w-${sizeTok(v)}`), group: /^w-/ },
  height: { cls: (v) => (v === "auto" ? null : `h-${sizeTok(v)}`), group: /^h-/ },
  maxWidth: { cls: (v) => (v === "none" ? null : `max-w-${sizeTok(v)}`), group: /^max-w-/ },
  display: {
    cls: (v) => ({ block: "block", flex: "flex", grid: "grid", "inline-block": "inline-block", inline: "inline", none: "hidden" }[v] ?? null),
    group: /^(block|flex|grid|hidden|inline-block|inline|inline-flex|table|contents)$/,
  },
  flexDirection: {
    cls: (v) => ({ row: "flex-row", column: "flex-col", "row-reverse": "flex-row-reverse", "column-reverse": "flex-col-reverse" }[v] ?? null),
    group: /^flex-(row|col)/,
  },
  justifyContent: {
    cls: (v) => ({ "flex-start": "justify-start", center: "justify-center", "flex-end": "justify-end", "space-between": "justify-between", "space-around": "justify-around", "space-evenly": "justify-evenly" }[v] ?? null),
    group: /^justify-/,
  },
  alignItems: {
    cls: (v) => ({ stretch: "items-stretch", "flex-start": "items-start", center: "items-center", "flex-end": "items-end", baseline: "items-baseline" }[v] ?? null),
    group: /^items-/,
  },
  fontSize: {
    cls: (v) => { const n = px(v); const hit = n !== null && FONT_SIZE.find(([p]) => p === n); return hit ? `text-${hit[1]}` : `text-[${v}]`; },
    group: /^text-(xs|sm|base|lg|xl|\dxl|\[\d)/,
  },
  fontWeight: {
    cls: (v) => ({ "100": "font-thin", "200": "font-extralight", "300": "font-light", "400": "font-normal", "500": "font-medium", "600": "font-semibold", "700": "font-bold", "800": "font-extrabold", "900": "font-black" }[v] ?? null),
    group: /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)/,
  },
  textAlign: {
    cls: (v) => ({ left: "text-left", center: "text-center", right: "text-right", justify: "text-justify" }[v] ?? null),
    group: /^text-(left|center|right|justify)/,
  },
  color: { cls: (v) => `text-[${hex(v)}]`, group: /^text-\[#/ },
  backgroundColor: { cls: (v) => `bg-[${hex(v)}]`, group: /^bg-\[#/ },
  borderRadius: {
    cls: (v) => { const n = px(v); if (n !== null && n >= 9999) return "rounded-full"; const hit = n !== null && RADIUS.find(([p]) => p === n); return hit ? `rounded${hit[1]}` : `rounded-[${v}]`; },
    group: /^rounded(-|\[|$)/,
  },
  opacity: { cls: (v) => `opacity-${Math.round((parseFloat(v) || 0) * 100)}`, group: /^opacity-/ },
};

export function tailwindSupports(prop: string): boolean {
  return prop in MAP;
}

// Apply a visual style change as a Tailwind class edit: drop the classes this
// prop controls (at this breakpoint variant) and add the new one. Returns the
// new class list, or null if the prop isn't Tailwind-mappable (fall back inline).
export function applyTailwind(classList: string[], prop: string, value: string, device: Device): string[] | null {
  const entry = MAP[prop];
  if (!entry) return null;
  const variant = variantFor(device);

  // strip existing classes for this prop at this variant
  const kept = classList.filter((c) => {
    const v = c.match(/^(.*?:)?(.*)$/);
    const cVariant = v?.[1] || "";
    const cBase = v?.[2] || c;
    if (cVariant !== variant) return true; // different breakpoint — keep
    return !entry.group.test(cBase);
  });

  const base = value === "" ? null : entry.cls(value);
  if (base) kept.push(variant + base);
  return kept;
}
