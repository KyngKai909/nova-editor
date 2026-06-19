"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Info, CheckCircle2, HelpCircle } from "lucide-react";
import { useDialog, type DialogTone } from "@/store/dialogStore";

const TONE: Record<DialogTone, { Icon: typeof Info; color: string }> = {
  default: { Icon: HelpCircle, color: "text-accent" },
  danger: { Icon: AlertTriangle, color: "text-red-400" },
  success: { Icon: CheckCircle2, color: "text-emerald-400" },
  info: { Icon: Info, color: "text-accent" },
};

// Mounted once at the app root. Renders the current alert/confirm dialog from the
// dialog store — Nova-styled, keyboard-accessible (Enter = confirm, Esc = cancel),
// dismiss on backdrop click. Drive it with confirmDialog()/alertDialog().
export default function DialogHost() {
  const { open, title, message, confirmLabel, cancelLabel, tone, close } = useDialog();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(false); }
      else if (e.key === "Enter") { e.preventDefault(); close(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;
  const { Icon, color } = TONE[tone];
  const danger = tone === "danger";

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => close(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-line-2 bg-surface p-5 shadow-2xl"
      >
        <div className="flex gap-3">
          <span className={`mt-0.5 shrink-0 ${color}`}><Icon size={20} /></span>
          <div className="min-w-0">
            {title && <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">{title}</h2>}
            <p className={`${title ? "mt-1" : ""} whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2`}>{message}</p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          {cancelLabel && (
            <button
              onClick={() => close(false)}
              className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-raise hover:text-ink"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            onClick={() => close(true)}
            className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${danger ? "bg-red-500 text-white hover:bg-red-600" : "bg-accent text-accent-ink hover:brightness-110"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
