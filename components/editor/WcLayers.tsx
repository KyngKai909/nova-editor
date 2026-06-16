"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { WcLayerNode } from "@/lib/useWebContainer";

// The running app's live DOM tree (from the bridge) for the Layers tab in webapp
// mode. Clicking selects the element in the running app; hovering highlights it.
function Row({
  node, depth, selectedId, onPick, onHover,
}: {
  node: WcLayerNode;
  depth: number;
  selectedId: string | null;
  onPick: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasKids = node.children.length > 0;
  const sel = node.id === selectedId;
  return (
    <div>
      <div
        onClick={() => onPick(node.id)}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={() => onHover(null)}
        className={`flex h-7 cursor-pointer items-center gap-1 pr-2 text-[12px] transition-colors ${sel ? "bg-accent/15 text-accent" : "text-ink-2 hover:bg-raise hover:text-ink"}`}
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        {hasKids ? (
          <button onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} className="grid h-4 w-4 shrink-0 place-items-center text-ink-3 hover:text-ink">
            <ChevronRight size={11} className={`transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className="shrink-0 font-mono text-[10.5px] text-ink-3">{node.tag}</span>
        <span className="truncate">{node.text ? node.text : node.cls ? `.${node.cls}` : ""}</span>
      </div>
      {hasKids && open && node.children.map((c) => (
        <Row key={c.id} node={c} depth={depth + 1} selectedId={selectedId} onPick={onPick} onHover={onHover} />
      ))}
    </div>
  );
}

export default function WcLayers({
  tree, selectedId, hasUrl, onPick, onHover,
}: {
  tree: WcLayerNode[];
  selectedId: string | null;
  hasUrl: boolean;
  onPick: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  if (!hasUrl) return <p className="px-3 py-2 text-[11px] leading-relaxed text-ink-3">Run the live app (▶) to see its layers.</p>;
  if (tree.length === 0) return <p className="px-3 py-2 text-[11px] leading-relaxed text-ink-3">No layers yet — once the app renders, its structure shows here. Hit Refresh if it stays empty.</p>;
  return <>{tree.map((n) => <Row key={n.id} node={n} depth={0} selectedId={selectedId} onPick={onPick} onHover={onHover} />)}</>;
}
