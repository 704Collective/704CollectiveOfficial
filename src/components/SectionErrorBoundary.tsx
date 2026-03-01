'use client';

import * as Sentry from '@sentry/react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

function SectionFallback({ resetError }: { resetError: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center space-y-3">
      <AlertTriangle className="w-6 h-6 text-muted-foreground mx-auto" />
      <p className="text-sm text-muted-foreground">
        Couldn't load this section. Try refreshing.
      </p>
      <Button variant="outline" size="sm" onClick={resetError}>
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
