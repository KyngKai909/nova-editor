import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nova — Visual editor for real code",
    short_name: "Nova",
    description:
      "A browser-based, Git-native visual editor for real codebases. Edit any site or repo on a live canvas, bring your own AI, and ship the code.",
    start_url: "/",
    display: "standalone",
    background_color: "#08080a",
    theme_color: "#08080a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
