import type { MetadataRoute } from "next";

const SITE = "https://novaeditor.org";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The gated app surfaces have nothing useful for crawlers.
      disallow: ["/editor", "/dashboard", "/settings", "/run", "/api/"],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
