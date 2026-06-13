/** @type {import('next').NextConfig} */

// Content-Security-Policy. Note: Nova's in-browser toolchain (Babel-standalone,
// esbuild-wasm, Monaco workers, the live canvas) genuinely requires
// 'unsafe-eval'/'wasm-unsafe-eval'/blob:, so script-src can't be locked down
// without breaking the product. The value here is in the OTHER directives —
// object-src 'none', base-uri 'self', frame-ancestors 'self', form-action
// 'self' — plus documenting intent. It is a baseline, not a guarantee.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
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
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
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
