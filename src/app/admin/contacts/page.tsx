'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users, UserPlus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  loadUnifiedContacts,
  contactRouteId,
  type UnifiedContact,
} from '@/lib/admin/unified-contacts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const PAGE_SIZE = 25;

const TYPE_TABS = [
  { key: 'all', label: 'All' },
  { key: 'member', label: 'Members' },
  { key: 'prospect', label: 'Prospects' },
  { key: 'guest', label: 'Guests' },
  { key: 'applicant', label: 'Applicants' },
  { key: 'sponsor', label: 'Sponsors' },
  { key: 'vendor', label: 'Vendors' },
  { key: 'partner', label: 'Partners' },
] as const;

type TypeTab = (typeof TYPE_TABS)[number]['key'];

const BADGE: Record<string, string> = {
  member: 'bg-green-500/15 text-green-400',
  prospect: 'bg-blue-500/15 text-blue-400',
  guest: 'bg-purple-500/15 text-purple-400',
  applicant: 'bg-amber-500/15 text-amber-400',
  sponsor: 'bg-pink-500/15 text-pink-400',
  vendor: 'bg-orange-500/15 text-orange-400',
  partner: 'bg-teal-500/15 text-teal-400',
};

function initials(name: string | null, email: string) {
  const s = (name || email).trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

function avatarColor(email: string) {
  const palette = ['bg-rose-600','bg-amber-600','bg-emerald-600','bg-cyan-600','bg-blue-600','bg-violet-600','bg-pink-600','bg-teal-600','bg-indigo-600','bg-orange-600'];
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h + email.charCodeAt(i) * 13) % 997;
  return palette[h % palette.length];
}

function isActiveStatus(s: string | null) {
  return s === 'active' || s === 'trialing';
}

function AddContactDialog({
  open, onClose, onSaved,
}: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    contact_type: 'prospect',
    company: '',
    notes: '',
    tags: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm({ full_name: '', email: '', phone: '', contact_type: 'prospect', company: '', notes: '', tags: '' });
    }
  }, [open]);

  const showCompany = ['vendor', 'sponsor', 'partner'].includes(form.contact_type);

  const save = async () => {
    if (!form.full_name.trim() || form.full_name.length > 100) {
      toast.error('Full name is required (max 100 characters)');
      return;
    }
    if (!form.email.trim() || form.email.length > 255) {
      toast.error('Valid email is required (max 255 characters)');
      return;
    }
    if (form.phone.length > 30) {
      toast.error('Phone max 30 characters');
      return;
    }
    if (showCompany && form.company.length > 200) {
      toast.error('Company max 200 characters');
      return;
    }
    if (form.notes.length > 2000) {
      toast.error('Notes max 2000 characters');
      return;
    }
    if (form.tags.length > 500) {
      toast.error('Tags max 500 characters');
      return;
    }
    setSaving(true);
    try {
      const dbType = form.contact_type === 'other' ? 'prospect' : form.contact_type;
      const { data: row, error } = await supabase.from('contacts').insert({
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        company: showCompany ? (form.company.trim() || null) : null,
        contact_type: dbType,
        status: 'active',
        source: 'manual',
      }).select('id').single();
      if (error) throw error;
      const tagSet = new Set<string>();
      tagSet.add(dbType);
      form.tags.split(',').map(t => t.trim()).filter(Boolean).forEach(t => tagSet.add(t));
      if (row?.id) {
        for (const tag of tagSet) {
          const { error: tagErr } = await supabase.from('contact_tags').insert({ contact_id: row.id, tag });
          if (tagErr) {
            /* duplicate or RLS — ignore */
          }
        }
      }
      toast.success('Contact added');
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to add contact');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
          <DialogDescription>Add a new non-member contact to the directory.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Full Name *</Label>
            <Input maxLength={100} value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
          </div>
          <div>
            <Label>Email *</Label>
            <Input type="email" maxLength={255} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input maxLength={30} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <Label>Contact Type *</Label>
            <Select value={form.contact_type} onValueChange={v => setForm(f => ({ ...f, contact_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="prospect">Prospect</SelectItem>
                <SelectItem value="vendor">Vendor</SelectItem>
                <SelectItem value="sponsor">Sponsor</SelectItem>
                <SelectItem value="partner">Partner</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1.5">
              Guests, Members, and Applicants are created through their own flows.
            </p>
          </div>
          {showCompany && (
            <div>
              <Label>Company</Label>
              <Input maxLength={200} value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
            </div>
          )}
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} maxLength={2000} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div>
            <Label>Tags</Label>
            <Input maxLength={500} value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="tag-one, tag-two" />
            <p className="text-xs text-muted-foreground mt-1">The contact type is automatically added as a tag.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [all, setAll] = useState<UnifiedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TypeTab>('all');
  const [page, setPage] = useState(0);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await loadUnifiedContacts();
      setAll(rows);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setAddOpen(true);
      router.replace('/admin/contacts', { scroll: false });
    }
  }, [searchParams, router]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const row of all) {
      const t = row.contact_type ?? 'prospect';
      c[t] = (c[t] ?? 0) + 1;
    }
    return c;
  }, [all]);

  const filtered = useMemo(() => {
    let rows = all;
    if (tab !== 'all') rows = rows.filter(r => r.contact_type === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.email.toLowerCase().includes(q) ||
        (r.full_name?.toLowerCase().includes(q) ?? false),
      );
    }
    return rows;
  }, [all, tab, search]);

  const total = filtered.length;
  const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const start = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const end = Math.min((page + 1) * PAGE_SIZE, total);

  const allCount = all.length;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Users className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Contacts <span className="text-muted-foreground font-semibold">({allCount})</span>
            </h1>
          </div>
        </div>
        <Button variant="outline" className="gap-2 shrink-0" onClick={() => setAddOpen(true)}>
          <UserPlus className="w-4 h-4" /> Add Contact
        </Button>
      </div>

      <div className="w-full max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name or email..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {TYPE_TABS.map(({ key, label }) => {
          const count = key === 'all' ? allCount : (typeCounts[key] ?? 0);
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { setTab(key); setPage(0); }}
              className={active
                ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary text-primary-foreground transition-colors whitespace-nowrap'
                : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap'}
            >
              {label}
              <span className={active
                ? 'bg-primary-foreground/20 text-primary-foreground ml-0.5 px-1.5 py-0 text-[11px] leading-5 font-normal rounded-full'
                : 'bg-muted text-muted-foreground ml-0.5 px-1.5 py-0 text-[11px] leading-5 font-normal rounded-full'}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-12 px-4 py-3" />
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground/70 px-4 py-3 font-normal">Name</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground/70 px-4 py-3 font-normal">Email</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground/70 px-4 py-3 font-normal">Type</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground/70 px-4 py-3 font-normal">Status</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground/70 px-4 py-3 font-normal">Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : slice.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No contacts</TableCell></TableRow>
            ) : (
              slice.map(row => {
                const active = isActiveStatus(row.status);
                const extra = (row.all_types ?? []).filter((t) => t !== row.contact_type).length;
                return (
                  <TableRow
                    key={`${row.source_table}:${row.id}`}
                    className="cursor-pointer border-b border-border hover:bg-muted/50"
                    onClick={() => router.push(`/admin/contacts/${contactRouteId(row)}`)}
                  >
                    <TableCell className="px-4 py-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor(row.email)}`}>
                        {initials(row.full_name, row.email)}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 font-medium text-foreground">{row.full_name || '—'}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">{row.email}</TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={`text-[11px] capitalize font-normal rounded-md px-1.5 py-0.5 ${BADGE[row.contact_type] ?? 'bg-muted text-muted-foreground'}`}>
                          {row.contact_type}
                        </span>
                        {extra > 0 && (
                          <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">+{extra}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm capitalize">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${active ? 'bg-green-500' : 'bg-muted-foreground/50'}`} />
                        {active ? 'Active' : 'Inactive'}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {row.created_at ? format(new Date(row.created_at), 'MMM d, yyyy') : '—'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {start}-{end} of {total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <AddContactDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={load} />
    </div>
  );
}

export default function ContactsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ContactsPageInner />
    </Suspense>
  );
}