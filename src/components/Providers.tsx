'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/contexts/AuthContext';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  const pathname = usePathname();

  // Safety net: Radix UI sets document.body.style.pointerEvents = 'none' when
  // a modal/sheet is open. If the component unmounts during Next.js navigation
  // before Radix can clean up (e.g. AdminLayout unmounting mid-navigation with
  // its Sheet still open), the body stays unclickable permanently.
  // This effect resets the style on every route change, guaranteeing recovery.
  useEffect(() => {
    document.body.style.pointerEvents = '';
  }, [pathname]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            style: {
              fontFamily: 'var(--font-body)',
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}