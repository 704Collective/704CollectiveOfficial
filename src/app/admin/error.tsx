'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AdminRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 text-center">
      <p className="text-lg font-medium text-foreground mb-1">Admin area error</p>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">{error.message}</p>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => reset()}>
          Try again
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/admin">Back to admin</Link>
        </Button>
      </div>
    </div>
  );
}
