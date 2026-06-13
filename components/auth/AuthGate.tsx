"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/store/authStore";
import Welcome from "./Welcome";
import SyncManager from "@/components/sync/SyncManager";

// Routes that stay public even when auth is enabled.
const PUBLIC = new Set(["/", "/docs"]);

function Loader() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-bg">
      <Loader2 size={22} className="animate-spin text-accent" />
    </div>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const init = useAuth((s) => s.init);
  const ready = useAuth((s) => s.ready);
  const signedIn = useAuth((s) => s.signedIn);
  const profile = useAuth((s) => s.profile);

  useEffect(() => {
    init();
  }, [init]);

  // Auth disabled (no env vars) or a public route → render the app unchanged.
  if (!isSupabaseConfigured() || PUBLIC.has(pathname)) return <>{children}</>;

  if (!ready) return <Loader />;
  if (!signedIn) return <Welcome mode="signin" />;
  if (!profile) return <Loader />; // session present, profile still loading
  if (!profile.activated && !profile.is_admin) return <Welcome mode="redeem" />;
  return (
    <>
      <SyncManager />
      {children}
    </>
  );
}
