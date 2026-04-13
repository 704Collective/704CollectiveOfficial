import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_URL } from "@/lib/siteMetadata";

export const metadata: Metadata = {
  title: "704 Social | 704 Collective",
  description:
    "704 Social membership: curated events, wellness, and community in Charlotte. Join Charlotte's premier social club.",
  openGraph: {
    title: "704 Social | 704 Collective",
    description:
      "Curated events, wellness, and community - Charlotte's social membership track.",
    url: `${SITE_URL}/social`,
    siteName: "704 Collective",
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: "704 Collective" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "704 Social | 704 Collective",
    description:
      "Curated events, wellness, and community - Charlotte's social membership track.",
    images: [DEFAULT_OG_IMAGE],
  },
  alternates: { canonical: `${SITE_URL}/social` },
};

export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return children;
}
