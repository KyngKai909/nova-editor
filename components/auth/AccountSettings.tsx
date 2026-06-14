"use client";

import { useEffect, useState } from "react";
import { Sparkles, LogOut, Plus, Copy, Check, Loader2, Ticket, Zap, CreditCard } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { isBillingConfigured, startCheckout, openBillingPortal } from "@/lib/billing";
import { useAuth } from "@/store/authStore";

interface Invite {
  code: string;
  used_by: string | null;
  created_at: string;
}

export default function AccountSettings() {
  const profile = useAuth((s) => s.profile);
  const email = useAuth((s) => s.email);
  const signOut = useAuth((s) => s.signOut);
  const generateInvite = useAuth((s) => s.generateInvite);
  const refreshProfile = useAuth((s) => s.refreshProfile);

  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingErr, setBillingErr] = useState<string | null>(null);
  const [billingNote, setBillingNote] = useState<string | null>(null);

  // Handle the redirect back from Stripe Checkout (?billing=success|cancel).
  // On success the webhook may lag a beat, so poll the profile until it flips.
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("billing");
    if (!result) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (result === "cancel") {
      setBillingNote("Checkout canceled — no charge was made.");
      return;
    }
    if (result === "success") {
      setBillingNote("Payment received — activating Pro…");
      let tries = 0;
      const poll = setInterval(async () => {
        await refreshProfile();
        if (++tries >= 6 || useAuth.getState().profile?.plan === "pro") {
          clearInterval(poll);
          setBillingNote(useAuth.getState().profile?.plan === "pro" ? "You're on Pro 🎉" : null);
        }
      }, 1500);
      return () => clearInterval(poll);
    }
  }, [refreshProfile]);

  useEffect(() => {
    if (!supabase || !profile) return;
    supabase
      .from("invites")
      .select("code, used_by, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => setInvites((data as Invite[]) || []));
  }, [profile]);

  // Render nothing until auth is turned on.
  if (!isSupabaseConfigured() || !profile) return null;

  const create = async () => {
    setErr(null);
    setBusy(true);
    const { code, error } = await generateInvite();
    if (error) setErr(error);
    else if (code) setInvites((prev) => [{ code, used_by: null, created_at: new Date().toISOString() }, ...prev]);
    setBusy(false);
  };

  const copyLink = (code: string) => {
    const link = `${window.location.origin}/dashboard?invite=${code}`;
    navigator.clipboard?.writeText(link);
    setCopied(code);
    setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
  };

  const isPro = profile.plan === "pro" || profile.is_admin;

  const upgrade = async () => {
    setBillingErr(null);
    setBillingBusy(true);
    // On success this redirects to Stripe, so we only clear busy on failure.
    try { await startCheckout(); } catch (e: any) { setBillingErr(e?.message || "Could not start checkout."); setBillingBusy(false); }
  };

  const manage = async () => {
    setBillingErr(null);
    setBillingBusy(true);
    try { await openBillingPortal(); } catch (e: any) { setBillingErr(e?.message || "Could not open billing."); setBillingBusy(false); }
  };

  return (
    <section className="rounded-2xl border border-line bg-surface/40 p-5">
      <h2 className="mb-1 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-2">
        <span className="text-accent"><Sparkles size={14} /></span> Account & invites
      </h2>
      <div className="divide-y divide-line">
        {/* account */}
        <div className="flex items-center justify-between gap-3 py-4">
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-ink">{email || "Signed in"}</div>
            <div className="mt-0.5 text-[12px] text-ink-3">
              Plan: <span className="text-ink-2">{profile.plan === "pro" ? "Pro" : "Free"}</span>
              {profile.is_admin && <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">admin</span>}
            </div>
          </div>
          <button onClick={signOut} className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12px] text-ink-2 transition-colors hover:bg-raise hover:text-ink">
            <LogOut size={13} /> Sign out
          </button>
        </div>

        {/* billing — only when Stripe is configured */}
        {isBillingConfigured() && (
          <div className="py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[14px] font-medium text-ink">
                  <Zap size={14} className="text-accent" /> {isPro ? "Pro plan" : "Upgrade to Pro"}
                </div>
                <div className="mt-0.5 max-w-md text-[12.5px] leading-relaxed text-ink-3">
                  {isPro
                    ? "Cloud backup and real-time sync across your devices are active."
                    : "Back up your projects to the cloud and sync them in real-time across devices — $8/mo."}
                </div>
              </div>
              {profile.is_admin ? (
                <span className="shrink-0 rounded-full border border-line bg-bg px-2.5 py-1 text-[12px] text-accent">Pro · admin</span>
              ) : isPro ? (
                <button
                  onClick={manage}
                  disabled={billingBusy}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-raise disabled:opacity-60"
                >
                  {billingBusy ? <Loader2 size={13} className="animate-spin" /> : <CreditCard size={13} />} Manage
                </button>
              ) : (
                <button
                  onClick={upgrade}
                  disabled={billingBusy}
                  className="flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {billingBusy ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />} Upgrade — $8/mo
                </button>
              )}
            </div>
            {billingNote && <p className="mt-2 text-[12px] text-accent">{billingNote}</p>}
            {billingErr && <p className="mt-2 text-[12px] text-red-400">{billingErr}</p>}
          </div>
        )}

        {/* invites */}
        <div className="py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[14px] font-medium text-ink"><Ticket size={14} className="text-accent" /> Invite friends</div>
              <div className="mt-0.5 text-[12.5px] text-ink-3">
                <span className="text-ink-2">{profile.invites_remaining}</span> invite{profile.invites_remaining === 1 ? "" : "s"} remaining. Each code lets one friend join.
              </div>
            </div>
            <button
              onClick={create}
              disabled={busy || profile.invites_remaining <= 0}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-[12px] font-semibold text-bg transition-colors hover:bg-white disabled:opacity-40"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create invite
            </button>
          </div>

          {err && <p className="mt-2 text-[12px] text-red-400">{err}</p>}

          {invites.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {invites.map((inv) => (
                <div key={inv.code} className="flex items-center justify-between gap-2 rounded-md border border-line bg-bg px-3 py-2">
                  <span className="flex items-center gap-2 font-mono text-[12.5px] tracking-wide text-ink">
                    {inv.code}
                    {inv.used_by ? (
                      <span className="rounded bg-raise px-1.5 py-0.5 text-[10px] font-sans text-ink-3">used</span>
                    ) : (
                      <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-sans text-accent">available</span>
                    )}
                  </span>
                  {!inv.used_by && (
                    <button onClick={() => copyLink(inv.code)} title="Copy invite link" className="flex items-center gap-1 rounded px-2 py-1 text-[11.5px] text-ink-3 transition-colors hover:bg-raise hover:text-ink">
                      {copied === inv.code ? <><Check size={12} className="text-accent" /> Copied</> : <><Copy size={12} /> Copy link</>}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
