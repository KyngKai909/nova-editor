"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { gsap } from "gsap";

const Ctx = createContext<{ navigate: (href: string) => void }>({ navigate: () => {} });
export const useRouteTransition = () => useContext(Ctx);

// Drop-in replacement for <Link> that plays the transition on internal nav.
export function TransitionLink({ href, children, onClick, ...rest }: { href: string; children: React.ReactNode; onClick?: (e: React.MouseEvent) => void; [k: string]: any }) {
  const { navigate } = useRouteTransition();
  return (
    <Link
      href={href}
      {...rest}
      onClick={(e: React.MouseEvent) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </Link>
  );
}

export function RouteTransition({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);

  const navigate = useCallback((href: string) => {
    setTarget((cur) => cur || href); // ignore if a transition is already running
  }, []);

  return (
    <Ctx.Provider value={{ navigate }}>
      {children}
      {target && (
        <RouteLoader
          onPush={() => router.push(target)}
          onDone={() => setTarget(null)}
        />
      )}
    </Ctx.Provider>
  );
}

function RouteLoader({ onPush, onDone }: { onPush: () => void; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: "power4.inOut" } })
        .set(".rt-overlay", { yPercent: 100 })
        .set(".rt-mark", { scale: 0.6, opacity: 0, rotate: -45 })
        .set(".rt-word", { yPercent: 120 })
        .set(".rt-bar", { scaleX: 0 })
        // curtain up to cover the screen
        .to(".rt-overlay", { yPercent: 0, duration: 0.5 })
        // brand mark + wordmark reveal
        .to(".rt-mark", { scale: 1, opacity: 1, rotate: 0, duration: 0.5, ease: "back.out(1.8)" }, "-=0.18")
        .to(".rt-word", { yPercent: 0, duration: 0.45, ease: "power3.out" }, "<0.04")
        // progress sweep, then swap the route under the cover
        .to(".rt-bar", { scaleX: 1, duration: 0.6, ease: "power2.inOut" }, "<")
        .add(() => {
          if (!pushed.current) {
            pushed.current = true;
            onPush();
          }
        })
        // reveal the new page
        .to(".rt-fade", { opacity: 0, y: -14, duration: 0.28, ease: "power2.in" }, "+=0.1")
        .to(".rt-overlay", { yPercent: -100, duration: 0.55 }, "-=0.04")
        .add(() => onDone());
    }, root);
    return () => ctx.revert();
  }, [onPush, onDone]);

  return (
    <div ref={root} className="fixed inset-0 z-[200]">
      <div className="rt-overlay absolute inset-0 flex items-center justify-center overflow-hidden bg-bg">
        <div className="grain" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(204,255,2,0.08),transparent_62%)]" />
        <div className="relative flex flex-col items-center gap-5">
          <div className="rt-fade flex items-center gap-3">
            <span className="rt-mark grid h-11 w-11 place-items-center rounded-xl bg-accent text-[20px] text-accent-ink">✦</span>
            <span className="overflow-hidden pb-1">
              <span className="rt-word block font-display text-[clamp(1.8rem,6vw,2.6rem)] font-semibold tracking-tight">Nova</span>
            </span>
          </div>
          <div className="rt-fade h-[3px] w-40 overflow-hidden rounded-full bg-line">
            <div className="rt-bar h-full w-full origin-left rounded-full bg-accent" />
          </div>
        </div>
      </div>
    </div>
  );
}
