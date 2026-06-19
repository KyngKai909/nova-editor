"use client";

import { create } from "zustand";

// A single, reusable popup-dialog system to replace the browser's alert()/
// confirm(). Promise-based so call sites read naturally:
//   if (await confirmDialog({ message: "Delete?", tone: "danger" })) …
//   await alertDialog({ title: "Sync failed", message: err, tone: "danger" });
export type DialogTone = "default" | "danger" | "success" | "info";

interface DialogState {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string; // undefined ⇒ alert (single button)
  tone: DialogTone;
  _resolve?: (ok: boolean) => void;
  close: (ok: boolean) => void;
}

export const useDialog = create<DialogState>((set, get) => ({
  open: false,
  message: "",
  confirmLabel: "OK",
  tone: "default",
  close: (ok) => { const r = get()._resolve; set({ open: false, _resolve: undefined }); r?.(ok); },
}));

interface DialogOpts {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
}

// Confirm: two buttons → resolves true (confirm) / false (cancel / dismiss).
export function confirmDialog(o: DialogOpts): Promise<boolean> {
  return new Promise((resolve) => {
    useDialog.setState({
      open: true,
      title: o.title,
      message: o.message,
      confirmLabel: o.confirmLabel ?? "Confirm",
      cancelLabel: o.cancelLabel ?? "Cancel",
      tone: o.tone ?? "default",
      _resolve: resolve,
    });
  });
}

// Alert: one button → resolves when dismissed.
export function alertDialog(o: DialogOpts): Promise<void> {
  return new Promise((resolve) => {
    useDialog.setState({
      open: true,
      title: o.title,
      message: o.message,
      confirmLabel: o.confirmLabel ?? "OK",
      cancelLabel: undefined,
      tone: o.tone ?? "default",
      _resolve: () => resolve(),
    });
  });
}
