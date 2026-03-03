'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AddProspectDialog } from '@/components/admin/AddProspectDialog';
import { EditProspectDialog } from '@/components/admin/EditProspectDialog';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Plus, Search, ArrowLeft } from 'lucide-react';

interface Prospect {
  id: string;
  full_name: string;
  email: string;
  status: string | null;
  notes: string | null;
  created_at: string | null;
  created_by: string | null;
  hubspot_contact_id: string | null;
}

const STALE_TIME = 5 * 60 * 1000;

async function fetchProspectsData() {
  const { data, error } = await supabase.from('prospects').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Prospect[];
}

interface AdminProspectsTabProps {
  onNavigateToDashboard: () => void;
}

export function AdminProspectsTab({ onNavigateToDashboard }: AdminProspectsTabProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const invalidateProspects = () => queryClient.invalidateQueries({ queryKey: ['admin-prospects'] });

  const { data: prospects = [], isLoading, isError } = useQuery({
    queryKey: ['admin-prospects'],
    queryFn: fetchProspectsData,
    staleTime: STALE_TIME,
  });

  const filtered = prospects.filter(p =>
    p.full_name?.toLowerCase().includes(search.toLowerCase()) || p.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-in fade-in-0 duration-200">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onNavigateToDashboard}><ArrowLeft className="w-4 h-4" /></Button>
          <h2 className="text-xl font-semibold">Prospect Management</h2>
        </div>
        <Button onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-2" />Add Prospect</Button>
      </div>

      {isError ? (
        <div className="text-center py-12">
          <p className="text-sm text-destructive mb-2">Failed to load prospects.</p>
          <Button variant="outline" size="sm" onClick={() => invalidateProspects()}>Retry</Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
      ) : (
        <>
          <div className="mb-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search prospects..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Status</TableHead><TableHead>Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No prospects found</TableCell></TableRow>
                ) : filtered.map(prospect => (
                  <TableRow key={prospect.id} className="cursor-pointer hover:bg-accent/50" onClick={() => { setEditing(prospect); setEditOpen(true); }}>
                    <TableCell className="font-medium">{prospect.full_name}</TableCell>
                    <TableCell>{prospect.email}</TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{prospect.status || 'new'}</Badge></TableCell>
                    <TableCell>{prospect.created_at ? format(new Date(prospect.created_at), 'MMM d, yyyy') : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <AddProspectDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditProspectDialog open={editOpen} onOpenChange={setEditOpen} prospect={editing} onSuccess={invalidateProspects} />
    </div>
  );
}