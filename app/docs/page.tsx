import type { Metadata } from "next";
import Docs from "@/components/docs/Docs";

export const metadata: Metadata = {
  title: "Nova Docs — the last-mile visual editor",
  description: "How to import, visually edit, run, and ship your project with Nova.",
};

export default function DocsPage() {
  return <Docs />;
}
