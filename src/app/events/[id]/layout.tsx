import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: event } = await supabase
      .from('events')
      .select('title, description, image_url, start_time, location_name')
      .eq('id', id)
      .maybeSingle();

    if (!event) {
      return {
        title: 'Event Not Found | 704 Collective',
        description: 'This event could not be found.',
      };
    }

    const title = `${event.title} | 704 Collective`;
    const description =
      event.description?.slice(0, 155) ||
      `Join us for ${event.title} in Charlotte. RSVP now on 704 Collective.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `https://704collective.com/events/${id}`,
        siteName: '704 Collective',
        type: 'website',
        ...(event.image_url && {
          images: [{ url: event.image_url, width: 1200, height: 630, alt: event.title }],
        }),
      },
      alternates: { canonical: `https://704collective.com/events/${id}` },
    };
  } catch {
    return {
      title: 'Event | 704 Collective',
      description: 'View event details on 704 Collective.',
    };
  }
}

export default function EventDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}