import { ImageResponse } from "next/og";

export const alt = "Nova — the visual editor for real code";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Branded social-share card shown when the homepage is linked anywhere.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          backgroundColor: "#08080a",
          backgroundImage:
            "radial-gradient(circle at 85% 0%, rgba(204,255,2,0.16), transparent 55%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#ccff02",
            }}
          >
            <svg width="42" height="42" viewBox="0 0 32 32">
              <path d="M16 3 18.9 13.1 29 16 18.9 18.9 16 29 13.1 18.9 3 16 13.1 13.1Z" fill="#0a0a0a" />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 38, fontWeight: 700, color: "#f2f2f4" }}>Nova</div>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              fontSize: 78,
              fontWeight: 800,
              color: "#f2f2f4",
              lineHeight: 1.04,
              letterSpacing: -2,
              maxWidth: 1000,
            }}
          >
            Design in the browser, ship the code.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "rgba(242,242,244,0.62)",
              lineHeight: 1.3,
              maxWidth: 920,
            }}
          >
            The visual editor for real codebases. Edit any site or repo on a live canvas — your code, your Git, your AI keys.
          </div>
        </div>

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              background: "#ccff02",
              color: "#0a0a0a",
              fontSize: 22,
              fontWeight: 700,
              padding: "9px 20px",
              borderRadius: 999,
            }}
          >
            Open source
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "rgba(242,242,244,0.4)" }}>
            Bring your own AI · Local-first · No lock-in
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
