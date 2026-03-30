/** Shared Schema.org fragments for 704 Collective public pages */

export const SITE_URL = 'https://704collective.com';

export const organizationSchema704 = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: '704 Collective',
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  description:
    "Charlotte's two-track social club and business membership community",
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Charlotte',
    addressLocality: 'Charlotte',
    addressRegion: 'NC',
    addressCountry: 'US',
  },
  sameAs: [
    'https://www.instagram.com/704_collective',
    'https://www.facebook.com/704collectiveclt/',
    'https://www.tiktok.com/@704_collective',
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    email: 'hello@704collective.com',
  },
} as const;

const providerOrg = {
  '@type': 'Organization',
  name: organizationSchema704.name,
  url: organizationSchema704.url,
  logo: organizationSchema704.logo,
} as const;

export const socialServiceSchema704 = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: '704 Social',
  serviceType: 'Social Club Membership',
  provider: providerOrg,
  areaServed: {
    '@type': 'AdministrativeArea',
    name: 'Charlotte, NC',
  },
  description:
    "Charlotte's activity club and social community — curated events, real friendships, and a calendar built for people who show up.",
} as const;

export const businessServiceSchema704 = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: '704 Business',
  serviceType: 'Business Membership Community',
  provider: providerOrg,
  areaServed: {
    '@type': 'AdministrativeArea',
    name: 'Charlotte, NC',
  },
  description:
    "Strategic networking for Charlotte's ambitious professionals — business meetings, workshops, and introductions that drive growth.",
} as const;

export const partnerProgramServiceSchema704 = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: '704 Collective Partner Program',
  serviceType: 'Event and Brand Partnership',
  provider: providerOrg,
  areaServed: {
    '@type': 'AdministrativeArea',
    name: 'Charlotte, NC',
  },
  description:
    'Partner with 704 Collective for Charlotte events, engaged audiences, and meaningful local brand visibility.',
} as const;
