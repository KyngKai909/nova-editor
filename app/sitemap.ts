import type { MetadataRoute } from "next";

const SITE = "https://nova-editor-six.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/docs`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];
}
