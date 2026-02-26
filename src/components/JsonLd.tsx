export default function JsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "704 Collective",
    url: "https://704collective.com",
    logo: "https://704collective.com/logo-white.png",
    description:
      "Charlotte's premier social club and business membership association. Curated events, real connections, and a community built for people who are building something.",
    foundingDate: "2025",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Charlotte",
      addressRegion: "NC",
      addressCountry: "US",
    },
    sameAs: [
      "https://www.instagram.com/704_collective",
      "https://www.facebook.com/704collectiveclt/",
      "https://www.tiktok.com/@704_collective",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      email: "hello@704collective.com",
      contactType: "customer service",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}