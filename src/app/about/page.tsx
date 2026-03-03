'use client';

import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { ArrowRight, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { usePageTitle } from '@/hooks/usePageTitle';

const team = [
  { name: 'Josh Ahart', title: 'Founder' },
  { name: 'Adam', title: 'Co-Founder' },
  { name: 'Gabbi', title: 'Co-Founder' },
  { name: 'Timi', title: 'Co-Founder' },
];

export default function About() {
  const { user, profile, isAdmin } = useAuth();
  usePageTitle('About | 704 Collective');

  return (
    <div className="min-h-screen bg-background">
     <Header />
      <main>
        {/* Hero */}
        <section className="py-24">
          <div className="container max-w-3xl text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">About 704 Collective</h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              704 Collective is Charlotte&apos;s community for young professionals. We create spaces for people in their 20s and 30s to build real friendships, grow their networks, and get more out of life in the Queen City. Through curated events, shared experiences, and a tight-knit membership community, we help you find your people in Charlotte. Whether you just moved here or you&apos;ve been here for years, 704 Collective is where you&apos;ll make the connections that matter.
            </p>
          </div>
        </section>

        {/* Team */}
        <section className="py-16 border-t border-border">
          <div className="container">
            <h2 className="text-3xl font-bold text-foreground text-center mb-12">Our Team</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
              {team.map((member) => (
                <Card key={member.name} className="text-center">
                  <CardContent className="pt-8 pb-6 flex flex-col items-center">
                    <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
                      <User className="w-10 h-10 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">{member.name}</h3>
                    <p className="text-sm text-muted-foreground">{member.title}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        {!user && (
          <section className="py-24 border-t border-border">
            <div className="container">
              <div className="card-elevated p-12 text-center max-w-3xl mx-auto">
                <h2 className="text-3xl font-bold mb-4">Ready to Join?</h2>
                <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                  Get unlimited access to all events, exclusive networking opportunities, and become part of Charlotte&apos;s most active professional community.
                </p>
                <Button size="lg" variant="hero" asChild>
                  <Link href="/join">
                    Join 704 Collective
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
