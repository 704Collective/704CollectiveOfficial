import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://704collective.com";
  const lastModified = new Date();

  const monthly: Pick<
    MetadataRoute.Sitemap[number],
    "lastModified" | "changeFrequency" | "priority"
  > = {
    lastModified,
    changeFrequency: "monthly",
    priority: 0.8,
  };

  return [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/business`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/about`,
      ...monthly,
    },
    {
      url: `${baseUrl}/social`,
      ...monthly,
    },
    {
      url: `${baseUrl}/contact`,
      ...monthly,
    },
    {
      url: `${baseUrl}/events`,
      ...monthly,
    },
    {
      url: `${baseUrl}/join`,
      ...monthly,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/partners`,
      ...monthly,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
