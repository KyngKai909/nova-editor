"use client";

import { useEffect, useState } from "react";
import { KeyRound, Mail, Loader2, ArrowRight, CheckCircle2, LogOut } from "lucide-react";
import { useAuth } from "@/store/authStore";
import AlphaPill from "@/components/AlphaPill";
import { useRouteTransition } from "@/components/transition/RouteTransition";

export default function Welcome({ mode }: { mode: "signin" | "redeem" | "login" }) {
  const checkInvite = useAuth((s) => s.checkInvite);
  const sendMagicLink = useAuth((s) => s.sendMagicLink);
  const redeemInvite = useAuth((s) => s.redeemInvite);
  const signOut = useAuth((s) => s.signOut);
  const { navigate } = useRouteTransition();

  const [step, setStep] = useState<"code" | "email" | "sent">(mode === "login" ? "email" : "code");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill the code from an invite link (?invite=CODE).
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("invite");
    if (c) setCode(c);
  }, []);

  const verifyCode = async () => {
    setError(null);
    setBusy(true);
    try {
      const ok = await checkInvite(code);
      if (!ok) return setError("That invite code isn't valid or has already been used.");
      setStep("email");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      // On the dedicated login page, don't create an account for an unknown email.
      const { error } = await sendMagicLink(email, code, mode !== "login");
      if (error) return setError(error);
      setStep("sent");
    } finally {
      setBusy(false);
    }
  };

  const redeem = async () => {
    setError(null);
    setBusy(true);
    try {
      const ok = await redeemInvite(code);
      if (!ok) setError("That invite code isn't valid or has already been used.");
      // success flips profile.activated → AuthGate renders the app
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-bg px-5">
      <div className="grain" />
      <div className="relative w-full max-w-sm">
        <button
          onClick={() => navigate("/")}
          title="Back to home"
          className="mb-7 flex w-full items-center justify-center gap-2 font-display text-[18px] font-semibold tracking-tight transition-opacity hover:opacity-80"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink">✦</span>
          Nova <AlphaPill />
        </button>

        <div className="rounded-2xl border border-line bg-surface/60 p-6 shadow-2xl backdrop-blur">
          {mode === "redeem" ? (
            <>
              <h1 className="font-display text-[20px] font-semibold tracking-tight">Enter your invite code</h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">You're signed in, but Nova is invite-only during the alpha. Enter a valid code to continue.</p>
              <Field icon={<KeyRound size={15} />} value={code} onChange={setCode} placeholder="INVITE-CODE" onEnter={redeem} mono />
              <Primary onClick={redeem} busy={busy} disabled={!code.trim()}>Redeem code</Primary>
              <button onClick={signOut} className="mt-3 flex w-full items-center justify-center gap-1.5 text-[12.5px] text-ink-3 transition-colors hover:text-ink">
                <LogOut size={13} /> Sign out
              </button>
            </>
          ) : step === "sent" ? (
            <div className="py-4 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/15 text-accent"><CheckCircle2 size={24} /></span>
              <h1 className="mt-4 font-display text-[19px] font-semibold tracking-tight">Check your email</h1>
              <p className="mx-auto mt-1.5 max-w-[260px] text-[13px] leading-relaxed text-ink-3">
                We sent a sign-in link to <span className="text-ink-2">{email}</span>. Click it to {mode === "login" ? "sign in" : "finish creating your account"}.
              </p>
            </div>
          ) : mode === "login" ? (
            <>
              <h1 className="font-display text-[20px] font-semibold tracking-tight">Welcome back</h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">Enter your email and we'll send a one-click sign-in link — no invite code needed.</p>
              <Field icon={<Mail size={15} />} value={email} onChange={setEmail} placeholder="you@example.com" onEnter={send} type="email" />
              <Primary onClick={send} busy={busy} disabled={!email.trim()}>Send sign-in link</Primary>
              <p className="mt-4 text-center text-[12.5px] text-ink-3">
                Need an invite? <button onClick={() => navigate("/dashboard")} className="font-medium text-ink transition-colors hover:text-accent">Get started</button>
              </p>
            </>
          ) : step === "email" ? (
            <>
              <h1 className="font-display text-[20px] font-semibold tracking-tight">Almost there</h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">Your code is valid. Enter your email and we'll send a one-click sign-in link.</p>
              <Field icon={<Mail size={15} />} value={email} onChange={setEmail} placeholder="you@example.com" onEnter={send} type="email" />
              <Primary onClick={send} busy={busy} disabled={!email.trim()}>Send sign-in link</Primary>
              <button onClick={() => { setStep("code"); setError(null); }} className="mt-3 w-full text-center text-[12.5px] text-ink-3 transition-colors hover:text-ink">Use a different code</button>
            </>
          ) : (
            <>
              <h1 className="font-display text-[20px] font-semibold tracking-tight">You need an invite</h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">Nova is invite-only during the alpha. Enter the code a friend shared with you.</p>
              <Field icon={<KeyRound size={15} />} value={code} onChange={setCode} placeholder="INVITE-CODE" onEnter={verifyCode} mono />
              <Primary onClick={verifyCode} busy={busy} disabled={!code.trim()}>Continue</Primary>
              <p className="mt-4 text-center text-[12.5px] text-ink-3">
                Already have an account? <button onClick={() => navigate("/login")} className="font-medium text-ink transition-colors hover:text-accent">Log in</button>
              </p>
            </>
          )}

          {error && <p className="mt-3 text-center text-[12px] text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function Field({ icon, value, onChange, placeholder, onEnter, type = "text", mono }: { icon: React.ReactNode; value: string; onChange: (v: string) => void; placeholder: string; onEnter: () => void; type?: string; mono?: boolean }) {
  return (
    <div className="mt-5 flex items-center gap-2 rounded-lg border border-line bg-bg px-3 focus-within:border-accent/60">
      <span className="text-ink-3">{icon}</span>
      <input
        autoFocus
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter()}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete={type === "email" ? "email" : "off"}
        className={`h-11 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3 ${mono ? "font-mono tracking-wide" : ""}`}
      />
    </div>
  );
}

function Primary({ onClick, busy, disabled, children }: { onClick: () => void; busy: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[14px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : null}
      {children} {!busy && <ArrowRight size={15} />}
    </button>
  );
}
