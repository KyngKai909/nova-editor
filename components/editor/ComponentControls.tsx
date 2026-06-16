"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { PropControl } from "@/lib/componentProps";

// Storybook-style Controls: editable inputs for a previewed component's props.
// Each change rewrites the preview route and the live app HMR-renders it.
export default function ComponentControls({
  name, controls, props, onChange,
}: {
  name: string;
  controls: PropControl[];
  props: Record<string, any>;
  onChange: (name: string, value: any) => void;
}) {
  return (
    <div className="border-b border-line bg-bg-2/40 px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        <SlidersHorizontal size={11} className="text-accent" /> Props
        <span className="font-mono text-[10.5px] normal-case tracking-normal text-ink-2">· {name}</span>
      </div>
      {controls.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-ink-3">No editable props detected — this component takes none, or they couldn&rsquo;t be read.</p>
      ) : (
        <div className="space-y-1.5">
          {controls.map((c) => (
            <ControlRow key={c.name} c={c} value={props[c.name]} onChange={(v) => onChange(c.name, v)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ControlRow({ c, value, onChange }: { c: PropControl; value: any; onChange: (v: any) => void }) {
  const label = <span className="w-[36%] shrink-0 truncate font-mono text-[10.5px] text-ink-3" title={c.name}>{c.name}</span>;
  const inputCls = "min-w-0 flex-1 rounded border border-line bg-bg px-1.5 py-1 text-[11px] text-ink outline-none focus:border-accent/60";

  if (c.type === "boolean") {
    return (
      <div className="flex items-center gap-2">
        {label}
        <button
          onClick={() => onChange(!value)}
          title={String(!!value)}
          className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${value ? "bg-accent" : "bg-line-2"}`}
        >
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${value ? "left-3.5" : "left-0.5"}`} />
        </button>
      </div>
    );
  }
  if (c.type === "select") {
    return (
      <div className="flex items-center gap-2">
        {label}
        <select value={String(value)} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          {c.options!.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  if (c.type === "number") {
    return (
      <div className="flex items-center gap-2">
        {label}
        <input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} className={inputCls} />
      </div>
    );
  }
  if (c.type === "json") return <JsonRow label={label} value={value} onChange={onChange} inputCls={inputCls} />;
  return (
    <div className="flex items-center gap-2">
      {label}
      <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </div>
  );
}

// JSON / object / array prop — a textarea that commits on valid JSON.
function JsonRow({ label, value, onChange, inputCls }: { label: React.ReactNode; value: any; onChange: (v: any) => void; inputCls: string }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null));
  const [bad, setBad] = useState(false);
  return (
    <div className="flex items-start gap-2">
      {label}
      <textarea
        value={text}
        rows={2}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          try { onChange(JSON.parse(e.target.value)); setBad(false); } catch { setBad(true); }
        }}
        className={`${inputCls} resize-none font-mono leading-snug ${bad ? "border-red-500/60" : ""}`}
      />
    </div>
  );
}
