'use client';

import { useAuth } from '@/hooks/useAuth';
import { Mail, Instagram } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Header } from '@/components/Header';

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  );
}
import { usePageTitle } from '@/hooks/usePageTitle';

export default function Contact() {
  const { user, profile, isAdmin } = useAuth();
  usePageTitle('Contact | 704 Collective');

  return (
    <div className="min-h-screen bg-background">
<Header />
      <main className="container max-w-lg py-24 px-4">
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <h1 className="text-3xl font-bold text-foreground mb-2">Get in Touch</h1>
            <p className="text-muted-foreground mb-8">Have questions about 704 Collective? We&apos;d love to hear from you.</p>

            <div className="space-y-4 mb-8">
              <a
                href="mailto:hello@704collective.com"
                className="flex items-center justify-center gap-2 text-foreground hover:text-primary transition-colors"
              >
                <Mail className="w-5 h-5" />
                hello@704collective.com
              </a>
              <a
                href="https://www.instagram.com/704_collective/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-foreground hover:text-primary transition-colors"
              >
                <Instagram className="w-5 h-5" />
                @704_collective
              </a>
              <a
                href="https://www.tiktok.com/@704_collective"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-foreground hover:text-primary transition-colors"
              >
                <TikTokIcon className="w-5 h-5" />
                @704_collective
              </a>
            </div>

            <p className="text-sm text-muted-foreground">
              For membership or billing questions, email us and we&apos;ll get back to you within 24 hours.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
