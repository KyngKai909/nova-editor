import { Suspense } from "react";
import RunView from "@/components/run/RunView";

export default function RunPage() {
  return (
    <Suspense fallback={<div className="grid h-[100dvh] place-items-center bg-bg text-sm text-ink-3">Loading…</div>}>
      <RunView />
    </Suspense>
  );
}
