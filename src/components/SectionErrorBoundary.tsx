'use client';

import * as Sentry from '@sentry/react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

function SectionFallback({ resetError }: { resetError: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-white/[0.08] bg-[#1E1E1E] p-8 text-center shadow-sm space-y-4"
    >
      <div className="flex justify-center">
        <div className="rounded-full bg-white/[0.06] p-3">
          <AlertTriangle className="w-6 h-6 text-[#C6A664]/80" aria-hidden />
        </div>
      </div>
      <p className="text-sm text-[#FAF6F0]/85 leading-relaxed">
        Something went wrong loading this section
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-white/15 text-[#FAF6F0] hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[#C6A664]"
        onClick={resetError}
      >
        Retry
      </Button>
    </div>
  );
}

export function SectionErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => <SectionFallback resetError={resetError} />}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
