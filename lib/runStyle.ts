// Tailwind class-group helpers for the Run inspector's visual style controls.
// They read/edit the selected element's className string — which the Run tab
// already round-trips back to source — so visual edits map to real class
// changes, mirroring the canvas's class-based Tailwind editing.

export function toTokens(className: string): string[] {
  return className.split(/\s+/).filter(Boolean);
}

export function toClassName(tokens: string[]): string {
  return tokens.join(" ");
}

// Which option of a mutually-exclusive group is currently applied (or null).
export function groupValue(tokens: string[], options: readonly string[]): string | null {
  return options.find((o) => tokens.includes(o)) ?? null;
}

// Replace the group's active option (or clear it when value is null).
export function setGroup(tokens: string[], options: readonly string[], value: string | null): string[] {
  const next = tokens.filter((t) => !options.includes(t));
  if (value) next.push(value);
  return next;
}

// Add/remove a single utility token.
export function toggleToken(tokens: string[], token: string): string[] {
  return tokens.includes(token) ? tokens.filter((t) => t !== token) : [...tokens, token];
}

// Set an arbitrary color class (text-[#hex] / bg-[#hex]), replacing any existing
// arbitrary color of that kind. Pair with an inline-style preview since a new
// arbitrary class has no CSS until the app's Tailwind recompiles via HMR.
export function setArbitraryColor(tokens: string[], kind: "text" | "bg", hex: string): string[] {
  const re = kind === "text" ? /^text-\[#/i : /^bg-\[#/i;
  const next = tokens.filter((t) => !re.test(t));
  if (hex) next.push(`${kind}-[${hex}]`);
  return next;
}

// Control groups surfaced in the Run inspector's Style tab.
export const DISPLAY = ["block", "flex", "grid", "hidden"] as const;
export const FLEX_DIR = ["flex-row", "flex-col"] as const;
export const JUSTIFY = ["justify-start", "justify-center", "justify-end", "justify-between"] as const;
export const ALIGN = ["items-start", "items-center", "items-end", "items-stretch"] as const;
export const TEXT_ALIGN = ["text-left", "text-center", "text-right"] as const;
export const FONT_SIZE = ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "text-3xl"] as const;
export const FONT_WEIGHT = ["font-normal", "font-medium", "font-semibold", "font-bold"] as const;
export const PADDING = ["p-0", "p-1", "p-2", "p-3", "p-4", "p-6", "p-8", "p-10", "p-12"] as const;
export const MARGIN = ["m-0", "m-1", "m-2", "m-3", "m-4", "m-6", "m-8", "m-10", "m-12"] as const;
export const ROUNDED = ["rounded-none", "rounded", "rounded-md", "rounded-lg", "rounded-xl", "rounded-full"] as const;
