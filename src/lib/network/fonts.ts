// Network (public hub pages) type: Fraunces serif display + Archivo sans.
// Scoped via CSS variables on the NetworkShell wrapper; the rest of the site
// keeps Inter from the root layout. Self-hosted latin woff2 (OFL).
import localFont from 'next/font/local';

export const nwSerif = localFont({
  src: '../../fonts/fraunces-latin-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--nw-serif',
  display: 'swap',
});

export const nwSans = localFont({
  src: '../../fonts/archivo-latin-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--nw-sans',
  display: 'swap',
});
