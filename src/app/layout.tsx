import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "700", "800"],
});

// Using Nunito ExtraBold for headings until Renogare font file is added
const headingFont = Nunito({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["800"],
});

export const metadata: Metadata = {
  title: "704 Collective | Charlotte's Premier Community",
  description:
    "A membership community for young professionals in Charlotte. Curated social experiences, real business connections, and a community that actually feels like community.",
  openGraph: {
    title: "704 Collective | Charlotte's Premier Community",
    description:
      "A membership community for young professionals in Charlotte. Curated social experiences, real business connections, and a community that actually feels like community.",
    url: "https://704collective.com",
    siteName: "704 Collective",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "704 Collective - Your City. Your People.",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "704 Collective | Charlotte's Premier Community",
    description:
      "A membership community for young professionals in Charlotte.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${nunito.variable} ${headingFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}