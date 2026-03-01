'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AddSponsorDialog } from '@/components/admin/AddSponsorDialog';
import { EditSponsorDialog } from '@/components/admin/EditSponsorDialog';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, ArrowLeft } from 'lucide-react';

interface Sponsor {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string;
  partnership_type: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
  created_by: string | null;
  hubspot_deal_id: string | null;
}

const STALE_TIME = 5 * 60 * 1000;

async function fetchSponsorsData() {
  const { data, error } = await supabase.from('sponsors_vendors').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Sponsor[];
}

interface AdminSponsorsTabProps {
  onNavigateToDashboard: () => void;
}

export function AdminSponsorsTab({ onNavigateToDashboard }: AdminSponsorsTabProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Sponsor | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const invalidateSponsors = () => queryClient.invalidateQueries({ queryKey: ['admin-sponsors'] });

  const { data: sponsors = [], isLoading, isError } = useQuery({
    queryKey: ['admin-sponsors'],
    queryFn: fetchSponsorsData,
    staleTime: STALE_TIME,
  });

  const filtered = sponsors.filter(s =>
    s.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-in fade-in-0 duration-200">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onNavigateToDashboard}><ArrowLeft className="w-4 h-4" /></Button>
          <h2 className="text-xl font-semibold">Sponsor/Vendor Management</h2>
        </div>
        <Button onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-2" />Add Sponsor/Vendor</Button>
      </div>

      {isError ? (
        <div className="text-center py-12">
          <p className="text-sm text-destructive mb-2">Failed to load sponsors.</p>
          <Button variant="outline" size="sm" onClick={() => invalidateSponsors()}>Retry</Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
      ) : (
        <>
          <div className="mb-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search sponsors..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead><TableHead>Contact</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No sponsors found</TableCell></TableRow>
                ) : filtered.map(sponsor => (
                  <TableRow key={sponsor.id} className="cursor-pointer hover:bg-accent/50" onClick={() => { setEditing(sponsor); setEditOpen(true); }}>
                    <TableCell className="font-medium">{sponsor.company_name}</TableCell>
                    <TableCell>{sponsor.contact_name || sponsor.email}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{sponsor.partnership_type || 'sponsor'}</Badge></TableCell>
                    <TableCell><Badge variant={sponsor.status === 'active' ? 'default' : 'secondary'} className="capitalize">{sponsor.status || 'active'}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <AddSponsorDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditSponsorDialog open={editOpen} onOpenChange={setEditOpen} sponsor={editing} onSuccess={invalidateSponsors} />
    </div>
  );
}
