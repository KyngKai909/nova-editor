"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/* ── Collapsible section ─────────────────────────────────────────────────── */
export function Section({
  title,
  children,
  defaultOpen = true,
  right,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  right?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          {title}
        </span>
        <span className="flex items-center gap-2">
          {right}
          <ChevronDown
            size={13}
            className={`text-ink-3 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
          />
        </span>
      </button>
      <div
        className={`grid transition-all duration-200 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 px-3.5 pb-3.5 pt-0.5">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Labelled row ────────────────────────────────────────────────────────── */
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[68px] shrink-0 text-[11px] text-ink-3">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/* ── Text input ──────────────────────────────────────────────────────────── */
export function TextInput({
  value,
  onCommit,
  placeholder,
  mono,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return (
    <input
      value={v}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={`h-7 w-full rounded-md border border-line bg-bg px-2 text-[12px] text-ink outline-none transition-colors placeholder:text-ink-3/60 focus:border-accent/60 ${
        mono ? "font-mono text-[11px]" : ""
      }`}
    />
  );
}

/* ── Number + unit ───────────────────────────────────────────────────────── */
const UNITS = ["px", "%", "rem", "em", "vw", "vh", "auto"];

export function NumberUnit({
  value,
  onCommit,
  placeholder = "auto",
  units = UNITS,
  step = 1,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  units?: string[];
  step?: number;
}) {
  const { num, unit } = splitValue(value);
  const [n, setN] = useState(num);
  useEffect(() => setN(splitValue(value).num), [value]);

  const commit = (nextN: string, nextU: string) => {
    if (nextU === "auto" || nextN === "auto") return onCommit("auto");
    if (nextN === "") return onCommit("");
    onCommit(`${nextN}${nextU || "px"}`);
  };

  return (
    <div className="flex h-7 items-stretch overflow-hidden rounded-md border border-line bg-bg focus-within:border-accent/60">
      <input
        value={n}
        placeholder={placeholder}
        inputMode="decimal"
        onChange={(e) => setN(e.target.value)}
        onBlur={() => n !== num && commit(n, unit)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const cur = parseFloat(n) || 0;
            const d = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : step);
            const nv = String(+(cur + d).toFixed(2));
            setN(nv);
            commit(nv, unit);
          }
        }}
        className="min-w-0 flex-1 bg-transparent px-2 text-[12px] text-ink outline-none placeholder:text-ink-3/60"
      />
      <select
        value={unit}
        onChange={(e) => commit(n || "0", e.target.value)}
        className="shrink-0 cursor-pointer border-l border-line bg-transparent px-1 text-[10px] text-ink-3 outline-none hover:text-ink"
      >
        {units.map((u) => (
          <option key={u} value={u} className="bg-surface">
            {u}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ── Slider with value ───────────────────────────────────────────────────── */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = "",
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <input
        type="range"
        className="ui-range flex-1"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-ink-2">
        {value}
        {suffix}
      </span>
    </div>
  );
}

/* ── Segmented control (icons or text) ───────────────────────────────────── */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label?: string; icon?: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-md border border-line bg-bg p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title || o.value}
          onClick={() => onChange(o.value)}
          className={`flex h-6 flex-1 items-center justify-center rounded text-[11px] transition-colors ${
            value === o.value
              ? "bg-raise text-ink"
              : "text-ink-3 hover:text-ink"
          }`}
        >
          {o.icon || o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Select ──────────────────────────────────────────────────────────────── */
export function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label?: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={options.some((o) => o.value === value) ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-full appearance-none rounded-md border border-line bg-bg px-2 pr-6 text-[12px] text-ink outline-none focus:border-accent/60"
      >
        <option value="" className="bg-surface">
          —
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface">
            {o.label || o.value}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-3"
      />
    </div>
  );
}

/* ── Color field with popover ────────────────────────────────────────────── */
export function ColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const swatchRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPos(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  value = value ?? "";
  const hex = toHex(value);

  const toggle = () => {
    if (pos) return setPos(null);
    const r = swatchRef.current!.getBoundingClientRect();
    // open above if there isn't room below; clamp within the viewport
    const below = window.innerHeight - r.bottom > 150;
    setPos({
      top: below ? r.bottom + 6 : r.top - 130,
      left: Math.min(r.left, window.innerWidth - 196),
    });
  };

  return (
    <div ref={ref}>
      <div className="flex h-7 items-center gap-2 rounded-md border border-line bg-bg px-1.5 focus-within:border-accent/60">
        <button
          ref={swatchRef}
          onClick={toggle}
          className="h-4 w-4 shrink-0 rounded border border-line-2"
          style={{
            background:
              value && value !== "rgba(0, 0, 0, 0)"
                ? value
                : "repeating-conic-gradient(#555 0% 25%, #333 0% 50%) 50% / 8px 8px",
          }}
        />
        <input
          value={value}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[11px] text-ink-2 outline-none"
        />
      </div>
      {pos && (
        <div
          className="fixed z-[70] rounded-lg border border-line-2 bg-surface p-2 shadow-2xl"
          style={{ top: pos.top, left: pos.left }}
        >
          <input
            type="color"
            value={hex}
            onChange={(e) => onChange(e.target.value)}
            className="h-28 w-44 cursor-pointer rounded"
          />
        </div>
      )}
    </div>
  );
}

/* ── Font family picker ──────────────────────────────────────────────────── */
const FONT_STACKS: { label: string; value: string }[] = [
  { label: "Inherit", value: "" },
  { label: "Inter", value: "'Inter', sans-serif" },
  { label: "Space Grotesk", value: "'Space Grotesk', sans-serif" },
  { label: "Instrument Serif", value: "'Instrument Serif', serif" },
  { label: "System UI", value: "system-ui, -apple-system, sans-serif" },
  { label: "Helvetica / Arial", value: "'Helvetica Neue', Arial, sans-serif" },
  { label: "Georgia / Times", value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace", value: "ui-monospace, 'SF Mono', Menlo, monospace" },
  { label: "Roboto", value: "'Roboto', sans-serif" },
  { label: "Poppins", value: "'Poppins', sans-serif" },
  { label: "Montserrat", value: "'Montserrat', sans-serif" },
  { label: "DM Sans", value: "'DM Sans', sans-serif" },
  { label: "Playfair Display", value: "'Playfair Display', serif" },
  { label: "Lora", value: "'Lora', serif" },
];

const CUSTOM = "__custom__";

// A dropdown of common font stacks, with a "Custom…" escape to type any stack.
// Always keeps the element's current font selectable even if it's not curated.
export function FontField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const cur = cleanFamily(value);
  const match = FONT_STACKS.find((f) => f.value && cleanFamily(f.value) === cur);
  const [custom, setCustom] = useState(false);

  if (custom) {
    return (
      <div className="space-y-1">
        <TextInput value={value} onCommit={onChange} placeholder="'Font Name', fallback" />
        <button onClick={() => setCustom(false)} className="text-[10px] text-ink-3 hover:text-accent">
          ← back to font list
        </button>
      </div>
    );
  }

  const opts = [...FONT_STACKS];
  let selectValue = "";
  if (match) selectValue = match.value;
  else if (cur) {
    opts.splice(1, 0, { label: prettyFamily(value), value });
    selectValue = value;
  }

  return (
    <div className="relative">
      <select
        value={selectValue}
        onChange={(e) => (e.target.value === CUSTOM ? setCustom(true) : onChange(e.target.value))}
        className="h-7 w-full appearance-none rounded-md border border-line bg-bg px-2 pr-6 text-[12px] text-ink outline-none focus:border-accent/60"
      >
        {opts.map((o) => (
          <option key={o.label} value={o.value} className="bg-surface">
            {o.label}
          </option>
        ))}
        <option value={CUSTOM} className="bg-surface">Custom…</option>
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-3" />
    </div>
  );
}

function cleanFamily(v?: string): string {
  if (!v) return "";
  return v.split(",")[0].replace(/["']/g, "").trim().toLowerCase();
}
function prettyFamily(v?: string): string {
  if (!v) return "";
  return v.split(",")[0].replace(/["']/g, "").trim();
}

/* ── Visual margin / padding box-model editor ────────────────────────────── */
// Presentational + value-agnostic: the parent supplies a getter (returns the
// numeric string to show for a side) and a commit (raw number string, "" clears)
// so the SAME widget drives inline styles (canvas) and Tailwind classes (Run).
const SPACING_SIDES = [
  ["marginTop", "left-1/2 top-1 -translate-x-1/2"],
  ["marginRight", "right-1 top-1/2 -translate-y-1/2"],
  ["marginBottom", "left-1/2 bottom-1 -translate-x-1/2"],
  ["marginLeft", "left-1 top-1/2 -translate-y-1/2"],
] as const;
const PADDING_SIDES = [
  ["paddingTop", "left-1/2 top-0.5 -translate-x-1/2"],
  ["paddingRight", "right-0.5 top-1/2 -translate-y-1/2"],
  ["paddingBottom", "left-1/2 bottom-0.5 -translate-x-1/2"],
  ["paddingLeft", "left-0.5 top-1/2 -translate-y-1/2"],
] as const;

function SpacingCell({
  value,
  label,
  cls,
  onCommit,
}: {
  value: string;
  label: string;
  cls: string;
  onCommit: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      value={v}
      title={label}
      placeholder="0"
      inputMode="numeric"
      onChange={(e) => setV(e.target.value.replace(/[^\d.-]/g, ""))}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={`absolute h-5 w-9 rounded bg-transparent text-center text-[10px] tabular-nums text-ink-2 outline-none transition-colors hover:bg-raise focus:bg-raise focus:text-ink ${cls}`}
    />
  );
}

export function SpacingBox({
  get,
  commit,
}: {
  get: (prop: string) => string;
  commit: (prop: string, value: string) => void;
}) {
  return (
    <div className="relative mx-auto h-[132px] w-full max-w-[256px] rounded-lg border border-dashed border-line-2 bg-bg/40">
      <span className="pointer-events-none absolute left-2 top-1 text-[9px] uppercase tracking-wide text-ink-3">margin</span>
      {SPACING_SIDES.map(([prop, cls]) => (
        <SpacingCell key={prop} value={get(prop)} label={prop} cls={cls} onCommit={(v) => commit(prop, v)} />
      ))}
      <div className="absolute inset-x-[46px] inset-y-[30px] rounded-md border border-dashed border-accent/30 bg-accent/[0.04]">
        <span className="pointer-events-none absolute left-1.5 top-0.5 text-[9px] uppercase tracking-wide text-ink-3">padding</span>
        {PADDING_SIDES.map(([prop, cls]) => (
          <SpacingCell key={prop} value={get(prop)} label={prop} cls={cls} onCommit={(v) => commit(prop, v)} />
        ))}
        <div className="absolute inset-x-[42px] inset-y-[26px] grid place-items-center rounded bg-raise/60 text-[9px] text-ink-3">
          content
        </div>
      </div>
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
function splitValue(v: string): { num: string; unit: string } {
  if (!v || v === "auto" || v === "none" || v === "normal") return { num: "", unit: "px" };
  const m = v.trim().match(/^(-?[\d.]+)(px|%|rem|em|vw|vh)?$/);
  if (m) return { num: m[1], unit: m[2] || "px" };
  return { num: "", unit: "px" };
}

function toHex(c: string): string {
  if (!c) return "#000000";
  if (c.startsWith("#")) {
    if (c.length === 4) return "#" + c.slice(1).split("").map((x) => x + x).join("");
    return c.slice(0, 7);
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(",").map((x) => parseInt(x.trim(), 10));
    return "#" + [r, g, b].map((n) => (n || 0).toString(16).padStart(2, "0")).join("");
  }
  return "#000000";
}
