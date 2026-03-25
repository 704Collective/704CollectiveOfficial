import { Suspense } from 'react';

export default function AdminInboxLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
