import type { ProviderDef } from "@/lib/aiProviders";
import { BRAND_LOGOS } from "@/lib/brandLogos";

// A provider's brand logo in its accent-tinted chip — falls back to a lettered
// monogram for providers without an inlined logo (e.g. Groq).
export default function BrandMark({ provider, size = 22 }: { provider: ProviderDef; size?: number }) {
  const path = BRAND_LOGOS[provider.id];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-md text-[11px] font-bold"
      style={{ width: size, height: size, color: provider.accent, backgroundColor: provider.accent + "1f", border: `1px solid ${provider.accent}44` }}
      aria-label={provider.brand}
    >
      {path ? (
        <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} fill="currentColor" aria-hidden>
          <path d={path} />
        </svg>
      ) : (
        provider.brand[0]
      )}
    </span>
  );
}
