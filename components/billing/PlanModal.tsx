"use client";

import { useState } from "react";
import { X, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/store/authStore";
import { startCheckout, changePlan, cancelPlan } from "@/lib/billing";
import { confirmDialog } from "@/store/dialogStore";

type PlanId = "free" | "pro" | "studio";

const PLANS: { id: PlanId; name: string; price: string; per: string; tagline: string; features: string[]; accent?: boolean }[] = [
  { id: "free", name: "Free", price: "$0", per: "forever", tagline: "Edit & ship, on your machine.", features: ["Visual + code editor", "Run apps locally", "On-device AI or your own key", "Commit & push to your GitHub"] },
  { id: "pro", name: "Pro", price: "$8", per: "/mo", tagline: "Backed up & synced everywhere.", features: ["Everything in Free", "Cloud backup of every project", "Real-time sync across devices", "Offline edits sync on reconnect"] },
  { id: "studio", name: "Studio", price: "$40", per: "/mo", tagline: "Build together.", features: ["Everything in Pro", "Unlimited editor collaborators", "Real-time shared projects", "Nova Studio AI (soon)"], accent: true },
];
const RANK: Record<PlanId, number> = { free: 0, pro: 1, studio: 2 };

// Nova-styled plan picker. New subscriptions go through Stripe Checkout (card
// entry); switching between paid plans and downgrading to Free happen in-app via
// the Stripe API (no card re-entry).
export default function PlanModal({ onClose }: { onClose: () => void }) {
  const profile = useAuth((s) => s.profile);
  const refreshProfile = useAuth((s) => s.refreshProfile);
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const current: PlanId = profile?.is_admin ? "studio" : ((profile?.plan as PlanId) || "free");

  const act = async (target: PlanId) => {
    if (target === current || busy) return;
    setErr(null);
    try {
      if (target === "free") {
        const ok = await confirmDialog({ title: "Cancel your plan?", tone: "danger", confirmLabel: "Cancel plan", message: "You'll keep your current plan until the end of the billing period, then drop to Free. Cloud projects stay in your account." });
        if (!ok) return;
        setBusy(target);
        await cancelPlan();
        await refreshProfile();
        onClose();
        return;
      }
      setBusy(target);
      if (current === "free") {
        await startCheckout(target); // redirects to Stripe; page navigates away
        return;
      }
      await changePlan(target);       // Pro ⇄ Studio, prorated
      await refreshProfile();
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Something went wrong.");
      setBusy(null);
    }
  };

  const label = (p: { id: PlanId; name: string }) => {
    if (p.id === current) return "Current plan";
    if (p.id === "free") return "Downgrade to Free";
    if (current === "free") return `Choose ${p.name}`;
    return RANK[p.id] > RANK[current] ? `Upgrade to ${p.name}` : `Switch to ${p.name}`;
  };

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl rounded-2xl border border-line-2 bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-[16px] font-semibold tracking-tight">Choose your plan</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-3">Change anytime — switches are prorated, cancels keep access until period end.</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 hover:bg-raise hover:text-ink"><X size={16} /></button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {PLANS.map((p) => {
            const isCurrent = p.id === current;
            return (
              <div key={p.id} className={`flex flex-col rounded-2xl border p-4 ${p.accent ? "border-accent/50 bg-accent/[0.05]" : "border-line bg-bg"}`}>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-[16px] font-semibold tracking-tight">{p.name}</h3>
                  {isCurrent && <span className="rounded-full border border-line bg-bg px-2 py-0.5 text-[10px] text-ink-3">Current</span>}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-display text-[28px] font-semibold tracking-tightest">{p.price}</span>
                  <span className="text-[12px] text-ink-3">{p.per}</span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{p.tagline}</p>
                <ul className="mt-3 flex-1 space-y-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-2">
                      <Check size={12} className={`mt-0.5 shrink-0 ${p.accent ? "text-accent" : "text-ink-3"}`} /> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => act(p.id)}
                  disabled={isCurrent || !!busy}
                  className={`mt-4 flex h-9 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold transition-colors disabled:cursor-not-allowed ${
                    isCurrent
                      ? "border border-line text-ink-3"
                      : p.accent
                      ? "bg-accent text-accent-ink hover:brightness-110 disabled:opacity-60"
                      : "border border-line-2 text-ink hover:bg-raise disabled:opacity-60"
                  }`}
                >
                  {busy === p.id ? <Loader2 size={14} className="animate-spin" /> : label(p)}
                </button>
              </div>
            );
          })}
        </div>
        {err && <p className="mt-3 text-[12px] text-red-400">{err}</p>}
      </div>
    </div>
  );
}
