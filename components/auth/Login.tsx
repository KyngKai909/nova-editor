"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/store/authStore";
import Welcome from "./Welcome";

export default function Login() {
  const router = useRouter();
  const ready = useAuth((s) => s.ready);
  const signedIn = useAuth((s) => s.signedIn);
  const profile = useAuth((s) => s.profile);

  const activated = !!(profile?.activated || profile?.is_admin);

  // Already signed in and activated → no reason to show login; drop into the app.
  useEffect(() => {
    if (ready && signedIn && activated) router.replace("/dashboard");
  }, [ready, signedIn, activated, router]);

  if (signedIn && activated) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-bg">
        <Loader2 size={22} className="animate-spin text-accent" />
      </div>
    );
  }

  return <Welcome mode="login" />;
}
