import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-charcoal border-t border-white/10">
      <div className="container mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Logo + Tagline */}
          <div className="md:col-span-1">
            <Image src="/logo-nav.png" alt="704 Collective" width={50} height={50} />
            <p className="text-white/60 text-sm mt-4 leading-relaxed">
              Your city. Your people.<br />
              Charlotte&apos;s premier community for young professionals.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white font-bold text-sm mb-4 uppercase tracking-wider">Community</h4>
            <div className="flex flex-col gap-2">
              <Link href="/#how-it-works" className="text-white/60 text-sm hover:text-white transition">How It Works</Link>
              <Link href="/#events" className="text-white/60 text-sm hover:text-white transition">Events</Link>
              <Link href="/faq" className="text-white/60 text-sm hover:text-white transition">FAQ</Link>
              <Link href="/blog" className="text-white/60 text-sm hover:text-white transition">Blog</Link>
            </div>
          </div>

          {/* Membership */}
          <div>
            <h4 className="text-white font-bold text-sm mb-4 uppercase tracking-wider">Membership</h4>
            <div className="flex flex-col gap-2">
              <Link href="https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04" className="text-white/60 text-sm hover:text-white transition">Join 704 Social</Link>
              <Link href="/business" className="text-white/60 text-sm hover:text-white transition">704 Business</Link>
              <Link href="/vendor" className="text-white/60 text-sm hover:text-white transition">Partner With Us</Link>
            </div>
          </div>

          {/* Contact + Social */}
          <div>
            <h4 className="text-white font-bold text-sm mb-4 uppercase tracking-wider">Connect</h4>
            <div className="flex flex-col gap-2">
              <a href="mailto:hello@704collective.com" className="text-white/60 text-sm hover:text-white transition">hello@704collective.com</a>
              <a href="https://instagram.com/704collective" target="_blank" rel="noopener noreferrer" className="text-white/60 text-sm hover:text-white transition">Instagram</a>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-white/40 text-xs">&copy; {new Date().getFullYear()} 704 Collective. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="text-white/40 text-xs hover:text-white/60 transition">Privacy Policy</Link>
            <Link href="/terms" className="text-white/40 text-xs hover:text-white/60 transition">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}