import { create } from "zustand";
import { persist } from "zustand/middleware";

// Resizable editor panel widths (px). Persisted so a user's layout sticks
// across reloads. Drag the inner edge of a panel to resize; it snaps back to
// the default when you get close, and a double-click resets it.
export const PANEL_DEFAULTS = { left: 264, ai: 380, right: 288 } as const;
export const PANEL_LIMITS = {
  left: { min: 208, max: 460 },
  ai: { min: 320, max: 560 },
  right: { min: 232, max: 520 },
} as const;
export const PANEL_SNAP = 12; // px window around the default that snaps

type Panel = "left" | "ai" | "right";

interface PanelState {
  left: number;
  ai: number;
  right: number;
  setWidth: (p: Panel, n: number) => void;
  reset: (p: Panel) => void;
}

export const usePanels = create<PanelState>()(
  persist(
    (set) => ({
      left: PANEL_DEFAULTS.left,
      ai: PANEL_DEFAULTS.ai,
      right: PANEL_DEFAULTS.right,
      setWidth: (p, n) => {
        const { min, max } = PANEL_LIMITS[p];
        let w = Math.max(min, Math.min(max, Math.round(n)));
        if (Math.abs(w - PANEL_DEFAULTS[p]) < PANEL_SNAP) w = PANEL_DEFAULTS[p]; // snap to default
        set({ [p]: w } as Pick<PanelState, Panel>);
      },
      reset: (p) => set({ [p]: PANEL_DEFAULTS[p] } as Pick<PanelState, Panel>),
    }),
    { name: "nova-panels" }
  )
);
