'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ArrowLeft, Search, Mail, ChevronLeft, ChevronRight, UserX,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface NonMember {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  title: string | null;
  phone: string | null;
  created_at: string;
  member_type: string | null;
  subscription_status: string | null;
}

const PAGE_SIZE = 20;

async function fetchNonMembers(page: number, search: string) {
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE - 1;

  const query = supabase
    .from('profiles')
    .select('id, email, full_name, company, title, phone, created_at, member_type, subscription_status', { count: 'exact' })
    .in('member_type', ['non_member', 'lead'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const { data, error, count } = await query.range(start, end);
  if (error) throw error;
  return { nonMembers: (data ?? []) as NonMember[], totalCount: count ?? 0 };
}

interface AdminNonMembersTabProps {
  onNavigateToDashboard: () => void;
}

export function AdminNonMembersTab({ onNavigateToDashboard }: AdminNonMembersTabProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-non-members'] });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-non-members', page],
    queryFn: () => fetchNonMembers(page, search),
    staleTime: 60 * 1000,
  });

  const nonMembers = data?.nonMembers ?? [];
  const totalCount = data?.totalCount ?? 0;

  const filtered = nonMembers.filter(m =>
    `${m.full_name ?? ''} ${m.email} ${m.company ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleSendNudge = async (member: NonMember) => {
    setSendingEmail(member.id);
    try {
      const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://704collective.com';
      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          to: member.email,
          template: 'membership-nudge',
          data: {
            name: member.full_name?.split(' ')[0] ?? 'there',
            join_url: `${SITE_URL}/join/checkout`,
          },
        },
      });
      if (error) throw error;
      toast.success(`Nudge sent to ${member.email}`);
    } catch (err) {
      toast.error('Failed to send email');
    } finally {
      setSendingEmail(null);
    }
  };

  return (
    <div className="animate-in fade-in-0 duration-200">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" aria-label="Back to admin overview" onClick={onNavigateToDashboard}><ArrowLeft className="w-4 h-4" /></Button>
        <h2 className="text-xl font-semibold">Non-Members</h2>
        <Badge variant="outline" className="text-xs">{totalCount} leads</Badge>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        People who expressed interest or started a business application but haven't become paying members yet.
      </p>

      <div className="relative max-w-xs mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search non-members..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
      </div>

      {isError ? (
        <div className="text-center py-12">
          <p className="text-sm text-destructive mb-2">Failed to load non-members.</p>
          <Button variant="outline" size="sm" onClick={invalidate}>Retry</Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <UserX className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-1">No non-members found</h3>
          <p className="text-sm text-muted-foreground">
            {search ? 'Try a different search term.' : 'Everyone here is already a member.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider">Name</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Email</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Company</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Type</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Added</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(member => (
                  <TableRow key={member.id}>
                    <TableCell className="py-3 font-medium">
                      {member.full_name ?? <span className="text-muted-foreground italic">No name</span>}
                      {member.title && <span className="block text-xs text-muted-foreground">{member.title}</span>}
                    </TableCell>
                    <TableCell className="py-3 text-muted-foreground">{member.email}</TableCell>
                    <TableCell className="py-3 text-muted-foreground">{member.company ?? '-'}</TableCell>
                    <TableCell className="py-3">
                      <Badge variant="outline" className="text-xs capitalize">{member.member_type ?? 'lead'}</Badge>
                    </TableCell>
                    <TableCell className="py-3 text-muted-foreground text-sm">
                      {format(new Date(member.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={sendingEmail === member.id}
                        onClick={() => handleSendNudge(member)}
                      >
                        <Mail className="w-3.5 h-3.5 mr-1" />
                        {sendingEmail === member.id ? 'Sending...' : 'Nudge'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, totalCount)} of {totalCount}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p-1)}><ChevronLeft className="w-4 h-4 mr-1" />Previous</Button>
                <Button variant="outline" size="sm" disabled={page*PAGE_SIZE >= totalCount} onClick={() => setPage(p => p+1)}>Next<ChevronRight className="w-4 h-4 ml-1" /></Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}