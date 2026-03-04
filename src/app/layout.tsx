import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import SmoothScroll from "@/components/SmoothScroll";
import ScrollProgress from "@/components/ScrollProgress";
import ScrollToTop from "@/components/ScrollToTop";
import ErrorBoundary from "@/components/ErrorBoundary";
import JsonLd from "@/components/JsonLd";
import { Providers } from "@/components/Providers";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const headingFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "704 Collective | Charlotte's Premier Community",
  description:
    "Charlotte's two-tier social club and business membership association. Curated events, real connections, and a community built for people who are building something.",
  metadataBase: new URL("https://704collective.com"),
  openGraph: {
    title: "704 Collective | Charlotte's Premier Community",
    description:
      "Charlotte's two-tier social club and business membership association. Curated events, real connections, and a community built for people who are building something.",
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
      "Charlotte's two-tier social club and business membership association.",
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
  manifest: "/manifest.json",
  other: {
    "msapplication-TileColor": "#1A1A1A",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${headingFont.variable}`}>
      <head>
        <meta name="theme-color" content="#1A1A1A" />
        <link rel="dns-prefetch" href="https://bnmtynevbuplqpuqvmna.supabase.co" />
        <link rel="preconnect" href="https://bnmtynevbuplqpuqvmna.supabase.co" crossOrigin="anonymous" />
        <JsonLd />
      </head>
      <body>
        <ErrorBoundary>
          <Providers>
            <SmoothScroll />
            <ScrollProgress />
            {children}
            <ScrollToTop />
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}