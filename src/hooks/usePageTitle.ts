'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const SITE_NAME = '704 Collective';
const CANONICAL_BASE = 'https://704collective.com';

/**
 * Sets the document title and canonical URL for the current page.
 * @param title - The page-specific title (will be appended with site name if not already included)
 */
export function usePageTitle(title: string) {
  const pathname = usePathname();

  useEffect(() => {
    // Set document title
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} - ${SITE_NAME}`;
    document.title = fullTitle;

    // Set canonical URL
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', `${CANONICAL_BASE}${pathname}`);

    return () => {
      // Cleanup canonical on unmount
      if (link && link.parentNode) {
        link.parentNode.removeChild(link);
      }
    };
  }, [title, pathname]);
}
