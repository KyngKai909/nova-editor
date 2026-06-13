"use client";

import { useEffect, useRef, useState } from "react";
import { GitBranch, ChevronDown, LogOut } from "lucide-react";
import { useGitHub } from "@/store/githubStore";
import ConnectModal from "./ConnectModal";

export default function AccountChip() {
  const user = useGitHub((s) => s.user);
  const disconnect = useGitHub((s) => s.disconnect);
  const [connectOpen, setConnectOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (!user) {
    return (
      <>
        <button
          onClick={() => setConnectOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:border-line-2 hover:text-ink"
        >
          <GitBranch size={14} /> Connect GitHub
        </button>
        {connectOpen && <ConnectModal onClose={() => setConnectOpen(false)} />}
      </>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setMenu((m) => !m)}
        className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-2.5 transition-colors hover:border-line-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={user.avatarUrl} alt={user.login} className="h-6 w-6 rounded-full" />
        <span className="text-[13px] font-medium text-ink">{user.login}</span>
        <ChevronDown size={13} className="text-ink-3" />
      </button>
      {menu && (
        <div className="absolute right-0 top-10 z-30 w-48 overflow-hidden rounded-lg border border-line-2 bg-surface py-1 shadow-2xl">
          <div className="px-3 py-2 text-[11px] text-ink-3">
            Connected as <span className="text-ink-2">{user.name || user.login}</span>
          </div>
          <div className="h-px bg-line" />
          <button
            onClick={() => { disconnect(); setMenu(false); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-red-400 transition-colors hover:bg-raise"
          >
            <LogOut size={13} /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
