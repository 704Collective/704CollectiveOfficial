'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';

export type FeaturedLogo = { id: string; company_name: string; logo_url: string | null };

const ROTATE_MS = 4000;

export function FeaturedPartnersCarousel({ partners }: { partners: FeaturedLogo[] }) {
  const [offset, setOffset] = useState(0);
  const [visible, setVisible] = useState(4);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const apply = () => setVisible(mq.matches ? 2 : 4);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const display = useMemo(() => {
    if (partners.length === 0) return [];
    if (partners.length <= visible) return partners;
    const out: FeaturedLogo[] = [];
    for (let i = 0; i < visible; i++) {
      out.push(partners[(offset + i) % partners.length]);
    }
    return out;
  }, [partners, offset, visible]);

  useEffect(() => {
    if (partners.length <= visible) return;
    const t = setInterval(() => {
      setOffset((o) => (o + 1) % partners.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [partners.length, visible]);

  if (partners.length === 0) {
    return (
      <div className="flex gap-6 justify-center flex-wrap items-center py-4">
        {Array.from({ length: visible }).map((_, i) => (
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
    <div className="relative overflow-hidden py-2 min-h-[88px] sm:min-h-[96px]">
      <AnimatePresence mode="wait">
        <motion.div
          key={offset}
          className="flex gap-6 sm:gap-10 justify-center items-center flex-wrap"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
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
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
