"use client";

import { ELEMENTS } from "@/lib/elements";
import { setDragElement } from "@/lib/dnd";

// Shared drag/click-to-insert elements palette — the editor's Components tab and
// the Run page's Components tab both render this. The caller supplies `onInsert`
// (canvas inserts into the parsed tree; Run splices the running source); the
// canvas additionally enables drag-onto-canvas.
export default function ElementsPalette({
  onInsert,
  isHtml = false,
  draggable = false,
  hasSelection = true,
}: {
  onInsert: (html: string) => void;
  isHtml?: boolean;
  draggable?: boolean;     // canvas supports dragging onto the canvas/layers
  hasSelection?: boolean;  // click-insert mode needs a selection to insert after
}) {
  return (
    <div className="p-2">
      {!draggable && !hasSelection && (
        <p className="mb-2 rounded-md border border-line bg-bg px-2 py-1.5 text-[10.5px] leading-relaxed text-ink-3">
          Click an element in the app first — new blocks insert right after it.
        </p>
      )}
      {ELEMENTS.map((g) => (
        <div key={g.group} className="mb-2">
          <div className="px-1 pb-1 text-[9px] font-semibold uppercase tracking-wide text-ink-3">{g.group}</div>
          <div className="grid grid-cols-2 gap-1">
            {g.items.map((it) => (
              <button
                key={it.label}
                draggable={draggable}
                onDragStart={draggable ? () => setDragElement(it.html) : undefined}
                onDragEnd={draggable ? () => setDragElement(null) : undefined}
                onClick={() => onInsert(it.html)}
                title={`${it.label} — ${draggable ? "drag onto the canvas or a layer, or " : ""}click to insert`}
                className="flex items-center gap-1.5 rounded-md border border-line bg-bg px-2 py-1.5 text-left text-[11.5px] text-ink-2 transition-colors hover:border-accent/50 hover:text-ink"
              >
                <span className="shrink-0 text-ink-3">{it.icon}</span>
                <span className="truncate">{it.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="px-1 pt-0.5 text-[10px] leading-relaxed text-ink-3">
        {draggable
          ? isHtml
            ? "Drag onto the canvas or a layer, or click to insert."
            : "Inserts as JSX into the current page."
          : "Inserts into the page source and hot-reloads."}
      </p>
    </div>
  );
}
