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
  // Extract primitives so the effect's dependency array is value-based,
  // not reference-based. This stops the effect from re-firing on every
  // parent render (which previously caused excess script tag churn and
  // races with route teardown during back-navigation).
  const type = props.type;
  const name = props.type === 'event' ? props.name : '';
  const description = props.type === 'event' ? props.description : undefined;
  const startDate = props.type === 'event' ? props.startDate : '';
  const endDate = props.type === 'event' ? props.endDate : '';
  const locationName = props.type === 'event' ? props.locationName : undefined;
  const locationAddress = props.type === 'event' ? props.locationAddress : undefined;
  const ticketPrice = props.type === 'event' ? props.ticketPrice : undefined;
  const imageUrl = props.type === 'event' ? props.imageUrl : undefined;
  const eventUrl = props.type === 'event' ? props.eventUrl : undefined;

  useEffect(() => {
    let jsonLdData: object[];

    if (type === 'organization') {
      jsonLdData = [
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: '704 Collective',
          url: CANONICAL_BASE,
          description:
            "Charlotte's community for young professionals. Events, networking, and real friendships.",
          logo: {
            '@type': 'ImageObject',
            url: `${CANONICAL_BASE}/logo.png`,
            width: 600,
            height: 600,
          },
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
        name,
        startDate,
        endDate,
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        organizer: {
          '@type': 'Organization',
          name: '704 Collective',
          url: CANONICAL_BASE,
        },
      };

      if (description) {
        eventSchema.description = description;
      }

      if (imageUrl) {
        eventSchema.image = imageUrl;
      }

      if (eventUrl) {
        eventSchema.url = eventUrl;
      }

      if (locationName) {
        eventSchema.location = {
          '@type': 'Place',
          name: locationName,
          ...(locationAddress && {
            address: {
              '@type': 'PostalAddress',
              streetAddress: locationAddress,
            },
          }),
        };
      }

      if (ticketPrice !== undefined) {
        eventSchema.offers = {
          '@type': 'Offer',
          price: (ticketPrice / 100).toFixed(2),
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          url: eventUrl || CANONICAL_BASE,
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
      // Defensive cleanup: route navigation can race with this teardown.
      // Only remove if the script is still a direct child of document.head,
      // and swallow any DOMException from a remove-after-already-removed.
      scripts.forEach((script) => {
        try {
          if (script.parentNode === document.head) {
            document.head.removeChild(script);
          }
        } catch {
          // Already removed by something else (route teardown, etc.) — safe to ignore.
        }
      });
    };
  }, [type, name, description, startDate, endDate, locationName, locationAddress, ticketPrice, imageUrl, eventUrl]);

  return null;
}
