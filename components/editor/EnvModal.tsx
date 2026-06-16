"use client";

import { X } from "lucide-react";
import EnvPanel from "./EnvPanel";

// Modal wrapper around EnvPanel — opened from the error overlay / console buttons.
// The right-panel Env tab uses EnvPanel directly.
export default function EnvModal({
  projectId, onClose, onRestart,
}: {
  projectId: string | null;
  onClose: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-line bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[14px] font-semibold text-ink">Environment variables</h2>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-ink-3 hover:bg-raise hover:text-ink"><X size={15} /></button>
        </div>
        <div className="min-h-[340px] flex-1 overflow-hidden">
          <EnvPanel projectId={projectId} onRestart={onRestart} onDone={onClose} />
        </div>
      </div>
    </div>
  );
}
