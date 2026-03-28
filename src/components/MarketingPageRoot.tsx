import type { ReactNode } from 'react';

/**
 * Marks public marketing content so globals.css mobile rules
 * ([data-page="marketing"]) apply without affecting dashboard/admin.
 */
export function MarketingPageRoot({ children }: { children: ReactNode }) {
  return (
    <div data-page="marketing" className="min-w-0">
      {children}
    </div>
  );
}
