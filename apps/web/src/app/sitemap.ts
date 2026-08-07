import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: appUrl,
      lastModified,
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: new URL("/privacy", appUrl).toString(),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4
    },
    {
      url: new URL("/terms", appUrl).toString(),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4
    }
  ];
}
