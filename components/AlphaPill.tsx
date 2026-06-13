// Small "ALPHA" badge shown next to the Nova wordmark to signal the product's
// stage. Sized to sit inline with the logo in the nav, footer, and dashboard.
export default function AlphaPill({ className = "" }: { className?: string }) {
  return (
    <span
      // pl > pr nudges the glyphs right to offset the trailing letter-spacing,
      // so "ALPHA" reads as optically centered in the pill.
      className={`inline-flex items-center rounded-full border border-accent/40 bg-accent/10 pl-[7px] pr-[5px] py-[1px] text-[9px] font-semibold uppercase leading-none tracking-[0.15em] text-accent ${className}`}
    >
      Alpha
    </span>
  );
}
