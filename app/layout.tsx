import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, Instrument_Serif } from "next/font/google";
import "./globals.css";
import AuthGate from "@/components/auth/AuthGate";
import { RouteTransition } from "@/components/transition/RouteTransition";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const SITE_URL = "https://nova-editor-six.vercel.app";
const TITLE = "Nova — The visual editor for real code";
const DESCRIPTION =
  "Nova is a browser-based, Git-native visual editor for real codebases. Import any site or GitHub repo, edit it on a live canvas with Webflow-grade controls, ask AI on your own key, and ship the code. Open source, local-first, no lock-in.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · Nova",
  },
  description: DESCRIPTION,
  applicationName: "Nova",
  keywords: [
    "visual code editor",
    "visual editor for code",
    "Webflow for developers",
    "edit AI-generated code",
    "last-mile editor",
    "browser IDE",
    "in-browser code editor",
    "visual editor for React",
    "Tailwind visual editor",
    "design in the browser",
    "Git-native editor",
    "bring your own AI key",
    "open source web editor",
    "edit any website code",
    "no lock-in code editor",
  ],
  authors: [{ name: "Nova" }],
  creator: "Nova",
  category: "technology",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Nova",
    title: TITLE,
    description:
      "Import any site or repo, edit it visually on a live canvas, ask AI on your own key, and ship the code. Open source, local-first, no lock-in.",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "A visual, Git-native editor for real codebases. Edit any site or repo on a live canvas. Bring your own AI key. Open source.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export const viewport: Viewport = {
  themeColor: "#08080a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable} ${serif.variable}`}>
      <body>
        <RouteTransition>
          <AuthGate>{children}</AuthGate>
        </RouteTransition>
      <script src="/nova-bridge.js"></script></body>
    </html>
  );
}
