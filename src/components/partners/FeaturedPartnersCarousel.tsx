'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';

export type FeaturedLogo = { id: string; company_name: string; logo_url: string | null };

const VISIBLE = 5;
const ROTATE_MS = 4500;

export function FeaturedPartnersCarousel({ partners }: { partners: FeaturedLogo[] }) {
  const [offset, setOffset] = useState(0);

  const display = useMemo(() => {
    if (partners.length === 0) return [];
    if (partners.length <= VISIBLE) return partners;
    const out: FeaturedLogo[] = [];
    for (let i = 0; i < VISIBLE; i++) {
      out.push(partners[(offset + i) % partners.length]);
    }
    return out;
  }, [partners, offset]);

  useEffect(() => {
    if (partners.length <= VISIBLE) return;
    const t = setInterval(() => {
      setOffset((o) => (o + 1) % partners.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [partners.length]);

  if (partners.length === 0) {
    return (
      <div className="flex gap-6 justify-center flex-wrap items-center py-4">
        {Array.from({ length: VISIBLE }).map((_, i) => (
          <div
            key={i}
            className="w-28 h-16 sm:w-32 sm:h-20 rounded-lg bg-neutral-300/80 animate-pulse"
            aria-hidden
          />
        ))}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden py-2">
      <div
        className="flex gap-8 sm:gap-12 justify-center items-center flex-wrap min-h-[88px] transition-opacity duration-500"
        key={offset}
      >
        {display.map((p) => (
          <div
            key={`${p.id}-${offset}`}
            className="relative w-32 h-16 sm:w-40 sm:h-20 flex items-center justify-center grayscale hover:grayscale-0 transition-all duration-300 opacity-90 hover:opacity-100"
          >
            {p.logo_url ? (
              <Image
                src={p.logo_url}
                alt={p.company_name}
                width={160}
                height={80}
                className="object-contain max-h-16 sm:max-h-20 w-auto"
                unoptimized
              />
            ) : (
              <span className="text-sm font-medium text-neutral-600 text-center px-2">{p.company_name}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
