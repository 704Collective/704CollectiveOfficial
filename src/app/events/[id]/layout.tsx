import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_OG_IMAGE, SITE_URL } from '@/lib/siteMetadata';

function absoluteImage(url: string | null | undefined): string {
  if (!url) return DEFAULT_OG_IMAGE;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${SITE_URL}${url}`;
  return url;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      title: 'Event | 704 Collective',
      description: 'View event details on 704 Collective.',
      openGraph: { images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }] },
      twitter: {
        card: 'summary_large_image',
        title: 'Event | 704 Collective',
        description: 'View event details on 704 Collective.',
        images: [DEFAULT_OG_IMAGE],
      },
    };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: event } = await supabase
      .from('events')
      .select('title, description, image_url, start_time, location_name, is_published')
      .eq('id', id)
      .maybeSingle();

    if (!event) {
      return {
        title: 'Event Not Found | 704 Collective',
        description: 'This event could not be found.',
        robots: { index: false, follow: true },
      };
    }

    const title = `${event.title} | 704 Collective`;
    const description =
      (event.description && event.description.slice(0, 155).trim()) ||
      `Join us for ${event.title} in Charlotte. RSVP on 704 Collective.`;
    const ogImage = absoluteImage(event.image_url);
    const url = `${SITE_URL}/events/${id}`;

    return {
      title,
      description,
      robots: event.is_published ? { index: true, follow: true } : { index: false, follow: true },
      openGraph: {
        title,
        description,
        url,
        siteName: '704 Collective',
        type: 'website',
        images: [{ url: ogImage, width: 1200, height: 630, alt: event.title }],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [ogImage],
      },
      alternates: { canonical: url },
    };
  } catch {
    return {
      title: 'Event | 704 Collective',
      description: 'View event details on 704 Collective.',
      openGraph: { images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }] },
      twitter: {
        card: 'summary_large_image',
        title: 'Event | 704 Collective',
        description: 'View event details on 704 Collective.',
        images: [DEFAULT_OG_IMAGE],
      },
    };
  }
}

export default function EventDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
