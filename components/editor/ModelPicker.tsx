"use client";

import { useMemo, useState } from "react";
import { Search, Check, KeyRound, Sparkles, CornerDownLeft } from "lucide-react";
import { PROVIDERS, type ProviderDef } from "@/lib/aiProviders";
import { useAi } from "@/store/aiStore";
import BrandMark from "@/components/ai/BrandMark";

const Monogram = BrandMark;

export default function ModelPicker({ onClose }: { onClose: () => void }) {
  const selected = useAi((s) => s.selected);
  const select = useAi((s) => s.select);
  const keys = useAi((s) => s.keys);
  const customModels = useAi((s) => s.customModels);
  const setCustomModel = useAi((s) => s.setCustomModel);

  const [q, setQ] = useState("");
  const [brand, setBrand] = useState<string | null>(null); // provider id or null = all

  const rows = useMemo(() => {
    const out: { provider: ProviderDef; model: { id: string; label: string; note?: string } }[] = [];
    for (const p of PROVIDERS) {
      if (brand && p.id !== brand) continue;
      for (const m of p.models) {
        const hay = `${p.brand} ${m.label} ${m.id} ${m.note || ""}`.toLowerCase();
        if (!q || hay.includes(q.toLowerCase())) out.push({ provider: p, model: m });
      }
    }
    return out;
  }, [q, brand]);

  const choose = (providerId: string, model: string) => {
    select({ provider: providerId, model });
    onClose();
  };

  const activeBrand = brand ? PROVIDERS.find((p) => p.id === brand) : null;
  const customVal = brand ? customModels[brand] || "" : "";

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-surface">
      {/* search */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-line bg-bg px-2.5">
          <Search size={14} className="shrink-0 text-ink-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search models…"
            className="h-8 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <button onClick={onClose} className="shrink-0 rounded-md px-2 py-1.5 text-[12px] text-ink-3 transition-colors hover:bg-raise hover:text-ink">
          Done
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* brand rail */}
        <div className="scroll-thin flex w-[52px] shrink-0 flex-col items-center gap-1 overflow-auto border-r border-line py-2">
          <button
            onClick={() => setBrand(null)}
            title="All providers"
            className={`grid h-9 w-9 place-items-center rounded-lg transition-colors ${!brand ? "bg-accent/15 text-accent" : "text-ink-3 hover:bg-raise hover:text-ink"}`}
          >
            <Sparkles size={16} />
          </button>
          {PROVIDERS.map((p) => {
            const hasKey = !!keys[p.id];
            return (
              <button
                key={p.id}
                onClick={() => setBrand(p.id)}
                title={p.brand + (hasKey ? "" : " · no key")}
                className={`relative grid h-9 w-9 place-items-center rounded-lg transition-colors ${brand === p.id ? "bg-raise" : "hover:bg-raise"}`}
              >
                <Monogram provider={p} size={22} />
                {hasKey && <span className="absolute -right-0 -top-0 h-2 w-2 rounded-full border border-surface bg-accent" />}
              </button>
            );
          })}
        </div>

        {/* model list */}
        <div className="scroll-thin min-w-0 flex-1 overflow-auto p-2">
          {activeBrand && (
            <div className="mb-1 flex items-center justify-between px-1.5 pb-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{activeBrand.brand}</span>
              {!keys[activeBrand.id] && <span className="flex items-center gap-1 text-[10.5px] text-amber-300/80"><KeyRound size={10} /> no key</span>}
            </div>
          )}
          {rows.length === 0 && <p className="px-2 py-6 text-center text-[12px] text-ink-3">No models match “{q}”.</p>}
          <div className="flex flex-col gap-0.5">
            {rows.map(({ provider, model }) => {
              const isSel = selected.provider === provider.id && selected.model === model.id;
              const hasKey = !!keys[provider.id];
              return (
                <button
                  key={provider.id + model.id}
                  onClick={() => choose(provider.id, model.id)}
                  className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${isSel ? "bg-accent/12" : "hover:bg-raise"}`}
                >
                  <Monogram provider={provider} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-[13px] font-medium text-ink">
                      {model.label}
                      {!brand && <span className="text-[10.5px] font-normal text-ink-3">{provider.brand}</span>}
                    </span>
                    {model.note && <span className="block truncate text-[11px] text-ink-3">{model.note}</span>}
                  </span>
                  {!hasKey && <KeyRound size={12} className="shrink-0 text-ink-3" />}
                  {isSel && <Check size={14} className="shrink-0 text-accent" />}
                </button>
              );
            })}
          </div>

          {/* custom model id for the active brand */}
          {activeBrand?.allowCustom && (
            <div className="mt-2 rounded-lg border border-dashed border-line p-2">
              <label className="mb-1 block px-0.5 text-[10.5px] uppercase tracking-wide text-ink-3">Custom model ID</label>
              <div className="flex items-center gap-1.5">
                <input
                  value={customVal}
                  onChange={(e) => setCustomModel(activeBrand.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customVal.trim()) choose(activeBrand.id, customVal.trim());
                  }}
                  placeholder={activeBrand.models[0]?.id || "model-id"}
                  className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 font-mono text-[11.5px] text-ink outline-none focus:border-accent/60"
                />
                <button
                  onClick={() => customVal.trim() && choose(activeBrand.id, customVal.trim())}
                  disabled={!customVal.trim()}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent text-accent-ink disabled:opacity-30"
                  title="Use this model"
                >
                  <CornerDownLeft size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
