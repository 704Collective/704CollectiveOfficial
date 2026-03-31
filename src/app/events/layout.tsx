import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_URL } from "@/lib/siteMetadata";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Upcoming Events | 704 Collective",
  description:
    "Discover and RSVP to upcoming 704 Collective events in Charlotte. Members attend free; guests can purchase tickets.",
  openGraph: {
    title: "Upcoming Events | 704 Collective",
    description:
      "Discover and RSVP to upcoming 704 Collective events in Charlotte.",
    url: `${SITE_URL}/events`,
    siteName: "704 Collective",
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: "704 Collective" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Upcoming Events | 704 Collective",
    description:
      "Discover and RSVP to upcoming 704 Collective events in Charlotte.",
    images: [DEFAULT_OG_IMAGE],
  },
  alternates: { canonical: `${SITE_URL}/events` },
};

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
