'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/contexts/AuthContext';

export function SignOutButton() {
  const { signOut } = useAuthContext();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      onClick={async () => { await signOut(); router.push('/'); }}
      style={{ width: '100%', color: 'rgba(255,255,255,0.35)', fontSize: '0.875rem' }}
    >
      Sign out
    </Button>
  );
}
