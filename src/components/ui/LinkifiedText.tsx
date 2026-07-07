import React from 'react';

const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+)/g;

const INTERNAL_HOSTS = ['704collective.com', 'www.704collective.com'];

function isInternal(url: string): boolean {
  try {
    return INTERNAL_HOSTS.includes(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

interface LinkifiedTextProps {
  text: string;
  className?: string;
}

/**
 * Renders text with http(s) URLs converted to anchors. Internal links
 * (704collective.com) open in the same tab; external links open in a new tab.
 * Plain text segments stay plain — no HTML injection of any kind.
 */
export function LinkifiedText({ text, className }: LinkifiedTextProps) {
  // Splitting on a regex with one capture group interleaves plain text (even
  // indices) with the captured URLs (odd indices).
  const parts = text.split(URL_REGEX);
  return (
    <p className={className}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const internal = isInternal(part);
        return (
          <a
            key={i}
            href={internal ? new URL(part).pathname + new URL(part).search : part}
            className="underline text-primary break-all"
            {...(internal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          >
            {part}
          </a>
        );
      })}
    </p>
  );
}
