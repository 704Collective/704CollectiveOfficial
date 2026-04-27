import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { getFeaturedPartnerLogos, type FeaturedPartnerLogo } from '@/lib/partnerFeatured';
import { FeaturedPartnersCarousel } from '@/components/partners/FeaturedPartnersCarousel';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';
import JsonLd from '@/components/JsonLd';
import { partnerProgramServiceSchema704 } from '@/lib/jsonLdSchemas';
import { Store, Building2, Sparkles, Handshake } from 'lucide-react';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Partners | 704 Collective',
  description:
    "Partner with 704 Collective - Charlotte's curated social and business events, engaged local audiences, and meaningful brand growth.",
  openGraph: {
    title: 'Partners | 704 Collective',
    description:
      'Vendor, venue, and sponsor opportunities with Charlotte’s premier collective.',
    url: 'https://704collective.com/partners',
    siteName: '704 Collective',
    images: [
      { url: 'https://704collective.com/og-image.png', width: 1200, height: 630, alt: '704 Collective' },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Partners | 704 Collective',
    description:
      'Vendor, venue, and sponsor opportunities with Charlotte’s premier collective.',
    images: ['https://704collective.com/og-image.png'],
  },
  alternates: { canonical: 'https://704collective.com/partners' },
};

export default async function PartnersPage() {
  const featured: FeaturedPartnerLogo[] = await getFeaturedPartnerLogos();

  return (
    <>
      <JsonLd schema={partnerProgramServiceSchema704} />
      <Nav />
      <main id="main-content" className="bg-[#0a0a0a] text-white">
        <MarketingPageRoot>
        {/* Hero */}
        <section className="relative min-h-[100dvh] flex flex-col justify-end pb-20 pt-28 px-4 sm:px-6">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: "url('/hero-partners.png')",
            }}
            aria-hidden
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/85 to-black/55" aria-hidden />
          <div className="absolute inset-0 bg-gradient-to-r from-[#C6A664]/10 via-transparent to-transparent pointer-events-none" aria-hidden />

          <div className="relative z-10 max-w-4xl mx-auto text-center">
            <p className="text-[#C6A664] text-xs sm:text-sm tracking-[0.35em] uppercase font-semibold mb-4">
              Partnerships
            </p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white mb-6">
              Become a 704 Collective Partner
            </h1>
            <p className="text-lg sm:text-xl text-white/75 max-w-3xl mx-auto leading-relaxed mb-10">
              Our community is one of the most active and engaged in Charlotte, and the businesses that show up here
              don&apos;t just get exposure, they get results. 704 Collective works with vendors who bring products and
              services directly to our events, venues who host our social and business experiences across Charlotte,
              sponsors who invest in long-term brand presence across our community and platforms, and partners who
              collaborate with us to grow alongside one of the city&apos;s most engaged networks. However you fit in,
              you&apos;re putting your brand in front of the exact people you want to reach, at scale.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                href="/partners/apply"
                className="inline-flex items-center justify-center px-8 py-3.5 rounded-lg bg-[#C6A664] hover:bg-[#C6A664] text-[#1A1A1A] font-semibold text-sm sm:text-base transition-colors shadow-lg shadow-black/40 min-w-[200px]"
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
              Four ways to plug into the 704 ecosystem - each role is designed for how you show up in Charlotte&apos;s
              event landscape.
            </p>

            <div className="grid md:grid-cols-2 gap-8">
              <article className="rounded-2xl border border-white/10 bg-[#2E2E2E] p-8 hover:border-[#C6A664]/35 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-[#C6A664]/15 flex items-center justify-center mb-6">
                  <Store className="w-6 h-6 text-[#C6A664]" aria-hidden />
                </div>
                <h3 className="text-xl font-semibold text-[#C6A664] mb-4">Vendor</h3>
                <div className="space-y-4 text-white/70 text-sm sm:text-base leading-relaxed">
                  <p>
                    Vendors are the heartbeat of our floor experience - pop-up makers, mobile service providers, artisan
                    producers, food and beverage artisans, and teams who turn a corner of the room into a moment people
                    remember. At 704 Collective events, we curate density so every vendor gets real foot traffic and
                    conversation, not a lonely table at the back of a ballroom.
                  </p>
                  <p>
                    You might pour specialty coffee for a sunrise social, plate small bites beside a DJ set, offer
                    flash wellness services between panels, or run experiential demos that let guests touch, taste, and
                    try what you build. Charlotte&apos;s scene rewards operators who show up with craft and story - and we
                    design layouts so your brand isn&apos;t competing with chaos.
                  </p>
                  <p>
                    In return, you gain access to repeat touchpoints with our social and business members, organic
                    content moments captured for recap reels, and introductions to venues and sponsors who need reliable
                    partners for future activations across the city.
                  </p>
                </div>
              </article>

              <article className="rounded-2xl border border-white/10 bg-[#2E2E2E] p-8 hover:border-[#C6A664]/35 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-[#C6A664]/15 flex items-center justify-center mb-6">
                  <Building2 className="w-6 h-6 text-[#C6A664]" aria-hidden />
                </div>
                <h3 className="text-xl font-semibold text-[#C6A664] mb-4">Venue</h3>
                <div className="space-y-4 text-white/70 text-sm sm:text-base leading-relaxed">
                  <p>
                    Venues are where the story of the night is written - coffee shops that flip into intimate mixers,
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
                    introductions to sponsors and vendors who need a home for their next activation - so one great night
                    turns into a pipeline of aligned bookings.
                  </p>
                </div>
              </article>

              <article className="rounded-2xl border border-white/10 bg-[#2E2E2E] p-8 hover:border-[#C6A664]/35 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-[#C6A664]/15 flex items-center justify-center mb-6">
                  <Sparkles className="w-6 h-6 text-[#C6A664]" aria-hidden />
                </div>
                <h3 className="text-xl font-semibold text-[#C6A664] mb-4">Sponsor</h3>
                <div className="space-y-4 text-white/70 text-sm sm:text-base leading-relaxed">
                  <p>
                    Sponsorship with 704 Collective is built for mid-market and enterprise teams that want brand
                    visibility where it matters - on-site at events sized roughly fifty to three hundred attendees, where
                    logos aren&apos;t wallpaper but part of a narrative guests actually engage with.
                  </p>
                  <p>
                    Packages can include social coverage across 704 Collective and CLTBucketlist channels, booth or
                    lounge presence, banner placements in high-traffic moments, speaking or hosting credits, and
                    storytelling that connects your brand to Charlotte&apos;s most active social and business circles - not
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

              <article className="rounded-2xl border border-white/10 bg-[#2E2E2E] p-8 hover:border-[#C6A664]/35 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-[#C6A664]/15 flex items-center justify-center mb-6">
                  <Handshake className="w-6 h-6 text-[#C6A664]" aria-hidden />
                </div>
                <h3 className="text-xl font-semibold text-[#C6A664] mb-4">Partner</h3>
                <div className="space-y-4 text-white/70 text-sm sm:text-base leading-relaxed">
                  <p>
                    The Partner track is for organizations that don&apos;t fit a single box - other social clubs, business
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
                    This path is the most bespoke - we&apos;ll workshop concepts, align on values, and build a roadmap
                    that respects both communities. If you&apos;re here to experiment, elevate, and grow together, the
                    Partner relationship is where we go deepest.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Featured partners */}
        {featured.length > 0 && (
          <section className="py-16 sm:py-24 px-4 sm:px-6" style={{ backgroundColor: '#F5F0E8' }}>
            <div className="max-w-5xl mx-auto">
              <h2 className="text-2xl sm:text-3xl font-bold text-center text-[#1A1A1A] mb-10">Proud Partners</h2>
              <FeaturedPartnersCarousel partners={featured} />
            </div>
          </section>
        )}

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
                  body: "Once approved, you'll plug into events, co-marketing, and introductions across Charlotte. We operate as an extension of your team - not a one-off transaction.",
                },
              ].map((step) => (
                <li key={step.n} className="text-center flex flex-col items-center">
                  <span className="inline-flex items-center justify-center w-11 h-11 rounded-full border border-[#C6A664]/50 text-[#C6A664] font-bold text-sm mb-4">
                    {step.n}
                  </span>
                  <h3 className="text-lg font-semibold text-white mb-3">{step.title}</h3>
                  <p className="text-white/65 text-sm leading-relaxed max-w-sm mx-auto">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20 px-4 sm:px-6 bg-gradient-to-br from-[#2a2419] via-[#1a1510] to-[#0a0a0a] border-t border-[#C6A664]/20">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl sm:text-4xl font-bold text-white mb-8 leading-tight">
              Ready to Partner with Charlotte&apos;s Premier Community?
            </h2>
            <Link
              href="/partners/apply"
              className="inline-flex items-center justify-center px-10 py-4 rounded-lg bg-[#C6A664] hover:bg-[#C6A664] text-[#1A1A1A] font-semibold transition-colors"
            >
              Become a Partner
            </Link>
          </div>
        </section>
        </MarketingPageRoot>
      </main>
      <Footer />
    </>
  );
}
