import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_URL } from "@/lib/siteMetadata";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with 704 Collective - email, social channels, and Charlotte community updates.",
  openGraph: {
    title: "Contact | 704 Collective",
    description:
      "Get in touch with 704 Collective in Charlotte.",
    url: `${SITE_URL}/contact`,
    siteName: "704 Collective",
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: "704 Collective" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact | 704 Collective",
    description: "Get in touch with 704 Collective in Charlotte.",
    images: [DEFAULT_OG_IMAGE],
  },
  alternates: { canonical: `${SITE_URL}/contact` },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
