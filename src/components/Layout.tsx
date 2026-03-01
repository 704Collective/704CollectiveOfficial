'use client';

import { ReactNode } from 'react';
import { Footer } from '@/components/Footer';
import { CookieConsent } from '@/components/CookieConsent';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Footer />
      <CookieConsent />
    </>
  );
}
