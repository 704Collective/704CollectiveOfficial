'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
    tiktokEmbed?: { lib?: { render?: (el: unknown) => void } };
  }
}

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

/**
 * Renders oEmbed HTML from Instagram/TikTok. Third-party scripts process blockquotes after load.
 */
export function BlogSocialEmbeds({
  instagramHtml,
  tiktokHtml,
}: {
  instagramHtml: string | null;
  tiktokHtml: string | null;
}) {
  const igRef = useRef<HTMLDivElement>(null);
  const ttRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!instagramHtml || !igRef.current) return;
    igRef.current.innerHTML = instagramHtml;
    void loadScriptOnce('https://www.instagram.com/embed.js').then(() => {
      window.instgrm?.Embeds?.process();
    });
  }, [instagramHtml]);

  useEffect(() => {
    if (!tiktokHtml || !ttRef.current) return;
    ttRef.current.innerHTML = tiktokHtml;
    void loadScriptOnce('https://www.tiktok.com/embed.js').then(() => {
      try {
        window.tiktokEmbed?.lib?.render?.(ttRef.current);
      } catch {
        /* TikTok API may vary; innerHTML iframe still may work */
      }
    });
  }, [tiktokHtml]);

  if (!instagramHtml && !tiktokHtml) return null;

  return (
    <div className="space-y-10 mt-12">
      {instagramHtml ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#C6A664]/80 mb-3">
            On Instagram
          </p>
          <div ref={igRef} className="min-h-[200px] [&_iframe]:max-w-full" />
        </div>
      ) : null}
      {tiktokHtml ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#C6A664]/80 mb-3">
            On TikTok
          </p>
          <div ref={ttRef} className="min-h-[200px] [&_iframe]:max-w-full" />
        </div>
      ) : null}
    </div>
  );
}
