import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS home-screen icon: full-bleed accent square with the Nova sparkle.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ccff02",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 32 32">
          <path d="M16 3 18.9 13.1 29 16 18.9 18.9 16 29 13.1 18.9 3 16 13.1 13.1Z" fill="#0a0a0a" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
