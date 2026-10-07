// Network (public hub pages) type: Fraunces serif display + Archivo sans.
// Scoped via CSS variables on the NetworkShell wrapper; the rest of the site
// keeps Inter from the root layout.
import { Fraunces, Archivo } from 'next/font/google';

export const nwSerif = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--nw-serif',
  display: 'swap',
});

export const nwSans = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--nw-sans',
  display: 'swap',
});
