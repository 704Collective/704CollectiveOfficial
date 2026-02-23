import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />

      <main className="pt-16">
        {/* HERO */}
        <section id="hero" className="min-h-[90vh] flex items-center justify-center bg-black">
          <div className="container mx-auto max-w-5xl px-6 text-center">
            <p className="text-white/60 text-sm uppercase tracking-widest mb-4">Charlotte&apos;s Premier Community</p>
            <h1 className="text-5xl md:text-7xl font-extrabold leading-tight mb-6">
              Your City.<br />Your People.
            </h1>
            <p className="text-white/70 text-lg md:text-xl max-w-2xl mx-auto mb-10">
              [Hero subheadline — we&apos;ll refine this later]
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04" className="bg-white text-black font-bold px-8 py-4 rounded-lg text-lg hover:bg-white/90 transition">
                Become a Member
              </a>
              <a href="#events" className="border border-white/30 text-white font-bold px-8 py-4 rounded-lg text-lg hover:border-white/60 transition">
                Upcoming Events
              </a>
            </div>
          </div>
        </section>

        {/* SOCIAL PROOF / PHOTO GALLERY */}
        <section id="social-proof" className="py-20 bg-charcoal">
          <div className="container mx-auto max-w-7xl px-6 text-center">
            <p className="text-white/40 uppercase tracking-widest text-sm">[Photo gallery / social proof section]</p>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="py-20 bg-black">
          <div className="container mx-auto max-w-5xl px-6 text-center">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-16">How It Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              <div>
                <div className="text-4xl font-extrabold text-white/20 mb-4">1</div>
                <h3 className="text-xl font-bold mb-2">Join</h3>
                <p className="text-white/60">[Step 1 description]</p>
              </div>
              <div>
                <div className="text-4xl font-extrabold text-white/20 mb-4">2</div>
                <h3 className="text-xl font-bold mb-2">Show Up</h3>
                <p className="text-white/60">[Step 2 description]</p>
              </div>
              <div>
                <div className="text-4xl font-extrabold text-white/20 mb-4">3</div>
                <h3 className="text-xl font-bold mb-2">Build Your Circle</h3>
                <p className="text-white/60">[Step 3 description]</p>
              </div>
            </div>
          </div>
        </section>

        {/* UPCOMING EVENTS */}
        <section id="events" className="py-20 bg-charcoal">
          <div className="container mx-auto max-w-5xl px-6">
            <h2 className="text-3xl md:text-4xl font-extrabold text-center mb-16">Upcoming Events</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-black border border-white/10 rounded-xl p-6">
                  <p className="text-white/40 text-sm">[Event {i} placeholder]</p>
                </div>
              ))}
            </div>
            <p className="text-white/40 text-sm text-center mt-8">*Dates and times subject to change</p>
          </div>
        </section>

        {/* IS 704 SOCIAL RIGHT FOR YOU */}
        <section id="right-for-you" className="py-20 bg-black">
          <div className="container mx-auto max-w-4xl px-6">
            <h2 className="text-3xl md:text-4xl font-extrabold text-center mb-12">Is 704 Social Right for You?</h2>
            <p className="text-white/40 text-center">[Right for you content — we&apos;ll build this out later]</p>
          </div>
        </section>

        {/* VALUE BREAKDOWN - IS IT WORTH IT */}
        <section id="value" className="py-20 bg-charcoal">
          <div className="container mx-auto max-w-5xl px-6">
            <h2 className="text-3xl md:text-4xl font-extrabold text-center mb-4">Is it worth it?</h2>
            <p className="text-white/40 text-center">[Value breakdown cards — we&apos;ll port the existing code block here]</p>
          </div>
        </section>

        {/* MEMBERSHIP / PRICING */}
        <section id="pricing" className="py-20 bg-black">
          <div className="container mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-12">Membership</h2>
            <p className="text-white/40">[Pricing card — 704 Social $30/mo]</p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-20 bg-charcoal">
          <div className="container mx-auto max-w-3xl px-6">
            <h2 className="text-3xl md:text-4xl font-extrabold text-center mb-12">Common Questions</h2>
            <p className="text-white/40 text-center">[FAQ accordion — we&apos;ll build this out later]</p>
          </div>
        </section>

        {/* CONTACT */}
        <section id="contact" className="py-20 bg-black">
          <div className="container mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-6">Get in Touch</h2>
            <a href="mailto:hello@704collective.com" className="text-white/60 text-lg hover:text-white transition">
              hello@704collective.com
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}