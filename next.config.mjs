/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    // WebContainers need cross-origin isolation (SharedArrayBuffer). Scope the
    // headers to the /run surface ONLY, so the editor's in-browser bundler and
    // external CDNs (esm.sh, Tailwind, jsDelivr, GitHub avatars) keep working.
    const isolation = [
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
    ];
    return [
      { source: "/run", headers: isolation },
      { source: "/run/:path*", headers: isolation },
    ];
  },
};

export default nextConfig;
