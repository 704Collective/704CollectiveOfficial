'use client';

import { useEffect } from 'react';

interface OrganizationJsonLdProps {
  type: 'organization';
}

interface EventJsonLdProps {
  type: 'event';
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  locationName?: string;
  locationAddress?: string;
  ticketPrice?: number;
  imageUrl?: string;
  eventUrl?: string;
}

type SEOJsonLdProps = OrganizationJsonLdProps | EventJsonLdProps;

const CANONICAL_BASE = 'https://704collective.com';

export function SEOJsonLd(props: SEOJsonLdProps) {
  useEffect(() => {
    let jsonLdData: object[];

    if (props.type === 'organization') {
      jsonLdData = [
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: '704 Collective',
          url: CANONICAL_BASE,
          description:
            "Charlotte's community for young professionals. Events, networking, and real friendships.",
          logo: `${CANONICAL_BASE}/assets/704-logo.png`,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: '704 Collective',
          url: CANONICAL_BASE,
          description:
            "Join Charlotte's young professionals community for curated events and real friendships.",
        },
      ];
    } else {
      const eventSchema: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: props.name,
        startDate: props.startDate,
        endDate: props.endDate,
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        organizer: {
          '@type': 'Organization',
          name: '704 Collective',
          url: CANONICAL_BASE,
        },
      };

      if (props.description) {
        eventSchema.description = props.description;
      }

      if (props.imageUrl) {
        eventSchema.image = props.imageUrl;
      }

      if (props.eventUrl) {
        eventSchema.url = props.eventUrl;
      }

      if (props.locationName) {
        eventSchema.location = {
          '@type': 'Place',
          name: props.locationName,
          ...(props.locationAddress && {
            address: {
              '@type': 'PostalAddress',
              streetAddress: props.locationAddress,
            },
          }),
        };
      }

      if (props.ticketPrice !== undefined) {
        eventSchema.offers = {
          '@type': 'Offer',
          price: (props.ticketPrice / 100).toFixed(2),
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          url: props.eventUrl || CANONICAL_BASE,
        };
      }

      jsonLdData = [eventSchema];
    }

    // Inject script tags
    const scripts = jsonLdData.map((data) => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(data);
      document.head.appendChild(script);
      return script;
    });

    return () => {
      scripts.forEach((script) => {
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      });
    };
  }, [props]);

  return null;
}
