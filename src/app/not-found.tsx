'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import Nav from '@/components/Nav';
import Link from 'next/link';

const NotFound = () => {
  const pathname = usePathname();
  usePageTitle('Page Not Found');

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", pathname);
  }, [pathname]);

  return (
    <>
      <Nav />
      <div className="flex min-h-screen items-center justify-center bg-muted" style={{ paddingTop: '64px' }}>
        <div className="text-center">
          <h1 className="mb-4 text-4xl font-bold">404</h1>
          <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
          <Link href="/" className="text-primary underline hover:text-primary/90">
            Return to Home
          </Link>
        </div>
      </div>
    </>
  );
};

export default NotFound;
