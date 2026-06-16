"use client";

import { FileText } from "lucide-react";
import type { WcPageRoute } from "@/lib/useWebContainer";

// The running app's routes (App Router pages + static *.html), for the Pages tab
// in webapp/run mode. Clicking navigates the live app's iframe to that route.
export default function WcPages({
  pages, route, hasUrl, onGo,
}: {
  pages: WcPageRoute[];
  route: string;
  hasUrl: boolean;
  onGo: (route: string) => void;
}) {
  if (!hasUrl) return <p className="px-3 py-2 text-[11px] leading-relaxed text-ink-3">Run the live app (▶) to list its pages.</p>;
  if (pages.length === 0) return <p className="px-3 py-2 text-[11px] leading-relaxed text-ink-3">No pages detected. App Router routes (app/**/page) and *.html files show here.</p>;
  return (
    <>
      {pages.map((p) => (
        <button
          key={p.route}
          onClick={() => onGo(p.route)}
          title={p.path}
          className={`flex h-7 w-full items-center gap-2 px-3 text-left text-[12px] transition-colors ${route === p.route ? "bg-accent/15 text-accent" : "text-ink-2 hover:bg-raise hover:text-ink"}`}
        >
          <FileText size={12} className="shrink-0 opacity-70" />
          <span className="truncate">{p.label}</span>
        </button>
      ))}
    </>
  );
}
