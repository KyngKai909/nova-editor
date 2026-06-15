/** @type {import('next').NextConfig} */

// Only harden the anti-framing headers in production. In development (`next dev`)
// we drop them so the app can be embedded in an iframe — which is exactly what
// happens when someone runs THIS project (or any app) inside Nova's Run tab via
// WebContainers: a dev server whose X-Frame-Options / frame-ancestors would
// otherwise make the preview "refuse to connect". Production stays locked down.
const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy. Note: Nova's in-browser toolchain (Babel-standalone,
// esbuild-wasm, Monaco workers, the live canvas) genuinely requires
// 'unsafe-eval'/'wasm-unsafe-eval'/blob:, so script-src can't be locked down
// without breaking the product. The value here is in the OTHER directives —
// object-src 'none', base-uri 'self', frame-ancestors (prod), form-action
// 'self' — plus documenting intent. It is a baseline, not a guarantee.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // lock framing in prod; allow it in dev so a dev server is previewable in Run
  isProd ? "frame-ancestors 'self'" : "frame-ancestors *",
  "form-action 'self'",
  // toolchain needs eval/wasm-eval + blob workers; allow the CDNs the app and canvas load from
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://unpkg.com https://esm.sh",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-src 'self' blob: data: https:",
  // BYO-key calls go direct to the user's chosen provider, and custom endpoints
  // are allowed, so connect-src stays broad (this is the trade-off of "any model").
  "connect-src 'self' blob: data: https: wss: ws:",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // X-Frame-Options only in prod (see note above) — omitting it in dev lets the
  // Run tab embed a dev server of this app.
  ...(isProd ? [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] : []),
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    // WebContainers need cross-origin isolation (SharedArrayBuffer). Scope the
    // isolation headers to the /run surface ONLY, so the editor's in-browser
    // bundler + external CDNs (esm.sh, Tailwind, jsDelivr, avatars) keep working.
    const isolation = [
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
    ];
    return [
      { source: "/run", headers: isolation },
      { source: "/run/:path*", headers: isolation },
      // baseline security headers on every route
      { source: "/:path*", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
