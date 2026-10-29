import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MemberSourcesPanel } from '@/components/admin/MemberSourcesPanel';

export default async function MemberSourcesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'super_admin') redirect('/admin');
  return <MemberSourcesPanel />;
}
