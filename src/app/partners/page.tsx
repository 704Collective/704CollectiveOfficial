import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { createClient } from '@/lib/supabase/server';
import { FeaturedPartnersCarousel, type FeaturedLogo } from '@/components/partners/FeaturedPartnersCarousel';
import { Store, Building2, Sparkles, Handshake } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Partners | 704 Collective',
  description:
    'Partner with 704 Collective — Charlotte’s curated social and business events, engaged local audiences, and meaningful brand growth.',
  openGraph: {
    title: 'Partners | 704 Collective',
    url: 'https://704collective.com/partners',
  },
};

async function getFeaturedPartners(): Promise<FeaturedLogo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('partner_listings')
    .select('id, company_name, logo_url')
    .eq('is_featured', true)
    .order('featured_order', { ascending: true, nullsFirst: false });
  return (data as FeaturedLogo[]) ?? [];
}

export default async function PartnersPage() {
  const featured = await getFeaturedPartners();

  return (
    <>
      <Nav />
      <main className="bg-[#0a0a0a] text-white">
        {/* Hero */}
        <section className="relative min-h-[100dvh] flex flex-col justify-end pb-20 pt-28 px-4 sm:px-6">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: "url('/og-image.png')",
            }}
            aria-hidden
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/85 to-black/55" aria-hidden />
          <div className="absolute inset-0 bg-gradient-to-r from-[#D4A853]/10 via-transparent to-transparent pointer-events-none" aria-hidden />

          <div className="relative z-10 max-w-4xl mx-auto text-center">
            <p className="text-[#D4A853] text-xs sm:text-sm tracking-[0.35em] uppercase font-semibold mb-4">
              Partnerships
            </p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white mb-6">
              Become a 704 Collective Partner
            </h1>
            <p className="text-lg sm:text-xl text-white/75 max-w-2xl mx-auto leading-relaxed mb-10">
              Partners get access to Charlotte&apos;s most curated social and business community events, exposure to an
              engaged local audience, and the ability to grow their brand through meaningful event partnerships—not
              generic sponsorship decks, but real presence where the city&apos;s most motivated professionals gather.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                href="/partners/apply"
                className="inline-flex items-center justify-center px-8 py-3.5 rounded-lg bg-[#D4A853] hover:bg-[#C6A664] text-[#1A1A1A] font-semibold text-sm sm:text-base transition-colors shadow-lg shadow-black/40 min-w-[200px]"
              >
                Become a Partner
              </Link>
              <a
                href="#types"
                className="inline-flex items-center justify-center px-8 py-3.5 rounded-lg border border-white/25 text-white/90 hover:bg-white/5 font-medium text-sm sm:text-base transition-colors min-w-[200px]"
              >
                Learn More
              </a>
            </div>
          </div>
        </section>

        {/* Partner types */}
        <section id="types" className="py-20 sm:py-28 px-4 sm:px-6 scroll-mt-24">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">Partner types</h2>
            <p className="text-white/55 text-center max-w-2xl mx-auto mb-14">
              Four ways to plug into the 704 ecosystem—each role is designed for how you show up in Charlotte&apos;s
              event landscape.
            </p>

            <div className="grid md:grid-cols-2 gap-8">
              <article className="rounded-2xl border border-white/10 bg-[#141414] p-8 hover:border-[#D4A853]/35 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-[#D4A853]/15 flex items-center justify-center mb-6">
                  <Store className="w-6 h-6 text-[#D4A853]" aria-hidden />
                </div>
                <h3 className="text-xl font-semibold text-[#D4A853] mb-4">Vendor</h3>
                <div className="space-y-4 text-white/70 text-sm sm:text-base leading-relaxed">
                  <p>
                    Vendors are the heartbeat of our floor experience—pop-up makers, mobile service providers, artisan
                    producers, food and beverage artisans, and teams who turn a corner of the room into a moment people
                    remember. At 704 Collective events, we curate density so every vendor gets real foot traffic and
                    conversation, not a lonely table at the back of a ballroom.
                  </p>
                  <p>
                    You might pour specialty coffee for a sunrise social, plate small bites beside a DJ set, offer
                    flash wellness services between panels, or run experiential demos that let guests touch, taste, and
                    try what you build. Charlotte&apos;s scene rewards operators who show up with craft and story—and we
                    design layouts so your brand isn&apos;t competing with chaos.
                  </p>
                  <p>
                    In return, you gain access to repeat touchpoints with our social and business members, organic
                    content moments captured for recap reels, and introductions to venues and sponsors who need reliable
                    partners for future activations across the city.
                  </p>
                </div>
              </article>

              <article className="rounded-2xl border border-white/10 bg-[#141414] p-8 hover:border-[#D4A853]/35 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-[#D4A853]/15 flex items-center justify-center mb-6">
                  <Building2 className="w-6 h-6 text-[#D4A853]" aria-hidden />
                </div>
                <h3 className="text-xl font-semibold text-[#D4A853] mb-4">Venue</h3>
                <div className="space-y-4 text-white/70 text-sm sm:text-base leading-relaxed">
                  <p>
                    Venues are where the story of the night is written—coffee shops that flip into intimate mixers,
                    breweries with room for both dance floors and breakout conversations, gyms and studios that host
                    wellness-forward gatherings, rooftops with skyline drama, and private rooms built for curated groups
                    of fifty to two hundred.
                  </p>
                  <p>
                    We partner with spaces that want more than a rental invoice: you&apos;re looking for community
                    exposure, polished media coverage, and repeat bookings with audiences who actually show up and post
                    about the experience. 704 Collective brings production discipline, respectful load-in, and guests who
                    align with Charlotte&apos;s creative and professional energy.
                  </p>
                  <p>
                    Expect co-marketing on event pages, highlight features when the room shines, and long-term
                    introductions to sponsors and vendors who need a home for their next activation—so one great night
                    turns into a pipeline of aligned bookings.
                  </p>
                </div>
              </article>

              <article className="rounded-2xl border border-white/10 bg-[#141414] p-8 hover:border-[#D4A853]/35 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-[#D4A853]/15 flex items-center justify-center mb-6">
                  <Sparkles className="w-6 h-6 text-[#D4A853]" aria-hidden />
                </div>
                <h3 className="text-xl font-semibold text-[#D4A853] mb-4">Sponsor</h3>
                <div className="space-y-4 text-white/70 text-sm sm:text-base leading-relaxed">
                  <p>
                    Sponsorship with 704 Collective is built for mid-market and enterprise teams that want brand
                    visibility where it matters—on-site at events sized roughly fifty to three hundred attendees, where
                    logos aren&apos;t wallpaper but part of a narrative guests actually engage with.
                  </p>
                  <p>
                    Packages can include social coverage across 704 Collective and CLTBucketlist channels, booth or
                    lounge presence, banner placements in high-traffic moments, speaking or hosting credits, and
                    storytelling that connects your brand to Charlotte&apos;s most active social and business circles—not
                    a spray-and-pray impressions chart.
                  </p>
                  <p>
                    We work with marketing leads who care about creative alignment, measurable reach, and relationships
                    with organizers who will pick up the phone for the next campaign. If you want to own a vertical
                    night, launch a product with a built-in crowd, or anchor a season of programming, we&apos;ll shape a
                    package that fits how Charlotte shows up.
                  </p>
                </div>
              </article>

              <article className="rounded-2xl border border-white/10 bg-[#141414] p-8 hover:border-[#D4A853]/35 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-[#D4A853]/15 flex items-center justify-center mb-6">
                  <Handshake className="w-6 h-6 text-[#D4A853]" aria-hidden />
                </div>
                <h3 className="text-xl font-semibold text-[#D4A853] mb-4">Partner</h3>
                <div className="space-y-4 text-white/70 text-sm sm:text-base leading-relaxed">
                  <p>
                    The Partner track is for organizations that don&apos;t fit a single box—other social clubs, business
                    networks, lifestyle labels, and mission-driven community groups that want to co-create experiences
                    rather than buy a logo slot. You bring an audience, a point of view, or a format we can braid into
                    704&apos;s calendar.
                  </p>
                  <p>
                    Think cross-promoted guest lists, shared content series, joint off-sites, and collaborative events
                    that feel bigger than any one brand could pull alone. We&apos;re interested in partners who want
                    synergy in the Charlotte market: introductions that compound, audiences that overlap in productive
                    ways, and programming that raises the bar for what a &quot;local event&quot; can mean.
                  </p>
                  <p>
                    This path is the most bespoke—we&apos;ll workshop concepts, align on values, and build a roadmap
                    that respects both communities. If you&apos;re here to experiment, elevate, and grow together, the
                    Partner relationship is where we go deepest.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Featured partners */}
        <section className="py-16 sm:py-24 px-4 sm:px-6" style={{ backgroundColor: '#F5F0E8' }}>
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-center text-[#1A1A1A] mb-10">Proud Partners</h2>
            <FeaturedPartnersCarousel partners={featured} />
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 sm:py-28 px-4 sm:px-6 border-t border-white/10">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-center mb-14">How it works</h2>
            <ol className="grid md:grid-cols-3 gap-10 md:gap-8">
              {[
                {
                  n: '01',
                  title: 'Apply',
                  body: 'Tell us who you are, what you offer, and how you want to show up in the 704 ecosystem. Upload your visuals so we can see your brand the way guests will.',
                },
                {
                  n: '02',
                  title: 'Get approved',
                  body: 'Our team reviews fit, capacity, and alignment with upcoming programming. We may follow up with a quick call to design the right partnership lane for you.',
                },
                {
                  n: '03',
                  title: 'Start partnering',
                  body: 'Once approved, you&apos;ll plug into events, co-marketing, and introductions across Charlotte. We operate as an extension of your team—not a one-off transaction.',
                },
              ].map((step) => (
                <li key={step.n} className="text-center md:text-left">
                  <span className="inline-flex items-center justify-center w-11 h-11 rounded-full border border-[#D4A853]/50 text-[#D4A853] font-bold text-sm mb-4">
                    {step.n}
                  </span>
                  <h3 className="text-lg font-semibold text-white mb-3">{step.title}</h3>
                  <p className="text-white/65 text-sm leading-relaxed">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20 px-4 sm:px-6 bg-gradient-to-br from-[#2a2419] via-[#1a1510] to-[#0a0a0a] border-t border-[#D4A853]/20">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl sm:text-4xl font-bold text-white mb-8 leading-tight">
              Ready to Partner with Charlotte&apos;s Premier Community?
            </h2>
            <Link
              href="/partners/apply"
              className="inline-flex items-center justify-center px-10 py-4 rounded-lg bg-[#D4A853] hover:bg-[#E4C878] text-[#1A1A1A] font-semibold transition-colors"
            >
              Become a Partner
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
