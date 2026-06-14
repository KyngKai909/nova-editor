"use client";

import { useCallback } from "react";
import { usePanels, PANEL_DEFAULTS, PANEL_LIMITS } from "@/store/panelStore";

// Drag-to-resize handle that sits on a panel's inner edge (the one facing the
// canvas). A subtle bar appears on hover; dragging changes the panel width and
// snaps to the default near it; double-click resets. Hidden on mobile, where
// panels are drawers.
export default function ResizeHandle({
  panel,
  edge,
  onActiveChange,
}: {
  panel: "left" | "ai" | "right";
  edge: "left" | "right"; // which edge of the panel this handle lives on
  onActiveChange?: (active: boolean) => void;
}) {
  const setWidth = usePanels((s) => s.setWidth);
  const reset = usePanels((s) => s.reset);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startW = usePanels.getState()[panel];
      onActiveChange?.(true);
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        // right-edge handle grows with rightward drag; left-edge handle shrinks
        setWidth(panel, edge === "right" ? startW + dx : startW - dx);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        onActiveChange?.(false);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [panel, edge, setWidth, onActiveChange]
  );

  return (
    <div
      onPointerDown={onPointerDown}
      onDoubleClick={() => reset(panel)}
      title="Drag to resize · double-click to reset"
      className={`group/resize absolute top-0 z-40 hidden h-full w-2.5 cursor-col-resize md:block ${
        edge === "right" ? "right-0" : "left-0"
      }`}
    >
      {/* hairline that lights up on hover/drag */}
      <div
        className={`absolute top-0 h-full w-px bg-transparent transition-colors group-hover/resize:bg-accent/50 ${
          edge === "right" ? "right-0" : "left-0"
        }`}
      />
      {/* the little grip pill, centered on the edge */}
      <div
        className={`absolute top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-full bg-line-2 opacity-0 shadow-sm transition-all group-hover/resize:bg-accent group-hover/resize:opacity-100 ${
          edge === "right" ? "right-[2px]" : "left-[2px]"
        }`}
      />
    </div>
  );
}
