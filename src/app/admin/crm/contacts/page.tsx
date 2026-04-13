'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Search, Plus, Filter, Download, MoreHorizontal, ChevronLeft, ChevronRight,
  Mail, Workflow, ArrowRightLeft, Trash2, X, SlidersHorizontal,
  UserPlus, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

/* ─── Types ─── */
interface Contact {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  company: string | null;
  contact_type: string | null;
  status: string | null;
  source: string | null;
  lead_score: number | null;
  last_activity_at: string | null;
  created_at: string | null;
  tags?: string[];
  /** which DB table this record originated from */
  source_table?: string;
}

type TypeTab = 'all' | 'member' | 'prospect' | 'guest' | 'applicant' | 'sponsor' | 'vendor' | 'partner';

const TYPE_TABS: { key: TypeTab; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'member',    label: 'Members' },
  { key: 'prospect',  label: 'Prospects' },
  { key: 'guest',     label: 'Guests' },
  { key: 'applicant', label: 'Applicants' },
  { key: 'sponsor',   label: 'Sponsors' },
  { key: 'vendor',    label: 'Vendors' },
  { key: 'partner',   label: 'Partners' },
];

const TYPE_PRIORITY: Record<string, number> = {
  guest: 1, prospect: 2, vendor: 3, partner: 4,
  sponsor: 5, applicant: 6, member: 7,
};

function deriveStatus(row: { subscription_status?: string | null; membership_override?: boolean | null; status?: string | null }): string {
  if (row.membership_override) return 'active';
  if (row.subscription_status === 'active') return 'active';
  if (row.subscription_status === 'canceled') return 'canceled';
  if (row.status) return row.status;
  return 'inactive';
}

interface Drip {
  id: string;
  name: string;
}

interface Sequence {
  id: string;
  name: string;
}

interface Filters {
  contact_type: string;
  status: string;
  source: string;
  tag: string;
  lead_score_min: string;
  lead_score_max: string;
  date_from: string;
  date_to: string;
}

const EMPTY_FILTERS: Filters = {
  contact_type: '', status: '', source: '', tag: '',
  lead_score_min: '', lead_score_max: '', date_from: '', date_to: '',
};

const CONTACT_TYPES = ['prospect', 'event_guest', 'guest_pass', 'vendor', 'venue', 'sponsor', 'partner', 'imported'];
const STATUSES = ['active', 'unsubscribed', 'bounced'];
const SOURCES = ['manual', 'event_guest', 'guest_pass', 'website', 'import', 'form'];

const TYPE_COLORS: Record<string, string> = {
  member:      'bg-green-500/15 text-green-400',
  prospect:    'bg-blue-500/15 text-blue-400',
  event_guest: 'bg-purple-500/15 text-purple-400',
  guest:       'bg-purple-500/15 text-purple-400',
  guest_pass:  'bg-purple-500/15 text-purple-400',
  applicant:   'bg-amber-500/15 text-amber-400',
  sponsor:     'bg-pink-500/15 text-pink-400',
  vendor:      'bg-orange-500/15 text-orange-400',
  venue:       'bg-orange-500/15 text-orange-400',
  partner:     'bg-teal-500/15 text-teal-400',
  imported:    'bg-muted text-muted-foreground',
};

const STATUS_COLORS: Record<string, string> = {
  active:       'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  unsubscribed: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  bounced:      'bg-red-500/15 text-red-400 border-red-500/20',
};

function capitalize(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function LeadScoreDot({ score }: { score: number }) {
  const color = score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-yellow-400' : 'text-red-400';
  return <span className={`font-semibold text-sm ${color}`}>{score}</span>;
}

const PAGE_SIZE = 50;

/* ─── Add/Edit Dialog ─── */
function ContactDialog({
  open, onClose, contact, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  contact: Contact | null;
  onSaved: () => void;
}) {
  const isEdit = !!contact;
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', company: '',
    contact_type: 'prospect', status: 'active', source: 'manual', notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (contact) {
      setForm({
        full_name: contact.full_name ?? '',
        email: contact.email,
        phone: contact.phone ?? '',
        company: contact.company ?? '',
        contact_type: contact.contact_type ?? 'prospect',
        status: contact.status ?? 'active',
        source: contact.source ?? 'manual',
        notes: '',
      });
    } else {
      setForm({ full_name: '', email: '', phone: '', company: '', contact_type: 'prospect', status: 'active', source: 'manual', notes: '' });
    }
  }, [contact, open]);

  const handleSave = async () => {
    if (!form.email.trim()) { toast.error('Email is required'); return; }
    setSaving(true);
    try {
      if (isEdit && contact) {
        const { error } = await supabase.from('contacts').update({
          full_name: form.full_name || null,
          email: form.email.trim().toLowerCase(),
          phone: form.phone || null,
          company: form.company || null,
          contact_type: form.contact_type,
          status: form.status,
          source: form.source,
          updated_at: new Date().toISOString(),
        }).eq('id', contact.id);
        if (error) throw error;
        toast.success('Contact updated');
      } else {
        const { error } = await supabase.from('contacts').insert({
          full_name: form.full_name || null,
          email: form.email.trim().toLowerCase(),
          phone: form.phone || null,
          company: form.company || null,
          contact_type: form.contact_type,
          status: form.status,
          source: form.source,
        });
        if (error) throw error;
        toast.success('Contact created');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof form, type = 'text') => (
    <div>
      <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
      <Input
        type={type}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="h-9 text-sm"
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg max-h-[90dvh] overflow-y-auto mx-4 sm:mx-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
          <DialogDescription>{isEdit ? 'Update contact information' : 'Create a new contact in your CRM'}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          {field('Full Name', 'full_name')}
          {field('Email', 'email', 'email')}
          {field('Phone', 'phone', 'tel')}
          {field('Company', 'company')}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Contact Type</Label>
            <Select value={form.contact_type} onValueChange={v => setForm(f => ({ ...f, contact_type: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{CONTACT_TYPES.map(t => <SelectItem key={t} value={t}>{capitalize(t)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Status</Label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{capitalize(s)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Source</Label>
            <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{capitalize(s)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Contact'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Drip Enroll Dialog ─── */
function DripEnrollDialog({ open, onClose, contact }: { open: boolean; onClose: () => void; contact: Contact | null }) {
  const [drips, setDrips] = useState<Drip[]>([]);
  const [selectedDrip, setSelectedDrip] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    if (open) {
      supabase.from('drip_campaigns').select('id, name').eq('status', 'active').then(({ data }) => setDrips(data ?? []));
    }
  }, [open]);

  const handleEnroll = async () => {
    if (!selectedDrip || !contact) return;
    setEnrolling(true);
    try {
      const { error } = await supabase.from('drip_enrollments').insert({
        drip_campaign_id: selectedDrip,
        contact_email: contact.email,
        contact_name: contact.full_name ?? contact.email,
        current_step: 1,
        status: 'active',
      });
      if (error) throw error;
      toast.success('Contact enrolled in drip campaign');
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to enroll');
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-sm mx-4 sm:mx-auto">
        <DialogHeader>
          <DialogTitle>Add to Drip Campaign</DialogTitle>
          <DialogDescription>{contact?.full_name ?? contact?.email}</DialogDescription>
        </DialogHeader>
        <Select value={selectedDrip} onValueChange={setSelectedDrip}>
          <SelectTrigger><SelectValue placeholder="Select a campaign…" /></SelectTrigger>
          <SelectContent>
            {drips.length === 0
              ? <SelectItem value="none" disabled>No active drip campaigns</SelectItem>
              : drips.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)
            }
          </SelectContent>
        </Select>
        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button onClick={handleEnroll} disabled={enrolling || !selectedDrip} className="w-full sm:w-auto">
            {enrolling ? 'Enrolling…' : 'Enroll'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Convert to Member Dialog ─── */
function ConvertDialog({ open, onClose, contact }: { open: boolean; onClose: () => void; contact: Contact | null }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-sm mx-4 sm:mx-auto">
        <DialogHeader>
          <DialogTitle>Convert to Member</DialogTitle>
          <DialogDescription>Send {contact?.email} a signup link to join 704 Collective as a Social member.</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-lg text-sm text-muted-foreground">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-yellow-400" />
          This will send an email to {contact?.email} with a link to complete checkout at /join/checkout.
        </div>
        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button
            onClick={async () => {
              toast.success('Signup link sent to ' + contact?.email);
              onClose();
            }}
            className="w-full sm:w-auto"
          >
            Send Invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Filter Panel ─── */
function FilterPanel({
  filters, onChange, onClear, allTags,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClear: () => void;
  allTags: string[];
}) {
  const set = (key: keyof Filters) => (v: string) => onChange({ ...filters, [key]: v });
  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeCount > 0 && (
            <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">{activeCount}</span>
          )}
        </span>
        {activeCount > 0 && (
          <button type="button" onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <X className="w-3 h-3" /> Clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Contact Type</Label>
          <Select value={filters.contact_type || 'all'} onValueChange={v => set('contact_type')(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {CONTACT_TYPES.map(t => <SelectItem key={t} value={t}>{capitalize(t)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Status</Label>
          <Select value={filters.status || 'all'} onValueChange={v => set('status')(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{capitalize(s)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Source</Label>
          <Select value={filters.source || 'all'} onValueChange={v => set('source')(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All sources" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {SOURCES.map(s => <SelectItem key={s} value={s}>{capitalize(s)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Tag</Label>
          <Select value={filters.tag || 'all'} onValueChange={v => set('tag')(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All tags" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {allTags.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Lead Score Min</Label>
          <Input
            type="number" min={0} max={100} placeholder="0"
            value={filters.lead_score_min}
            onChange={e => set('lead_score_min')(e.target.value)}
            className="h-8 text-xs"
          />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Lead Score Max</Label>
          <Input
            type="number" min={0} max={100} placeholder="100"
            value={filters.lead_score_max}
            onChange={e => set('lead_score_max')(e.target.value)}
            className="h-8 text-xs"
          />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Added From</Label>
          <Input
            type="date"
            value={filters.date_from}
            onChange={e => set('date_from')(e.target.value)}
            className="h-8 text-xs"
          />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Added To</Label>
          <Input
            type="date"
            value={filters.date_to}
            onChange={e => set('date_to')(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Page ─── */
export default function CrmContactsPage() {
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [typeTab, setTypeTab] = useState<TypeTab>('all');
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [dripContact, setDripContact] = useState<Contact | null>(null);
  const [convertContact, setConvertContact] = useState<Contact | null>(null);
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // Load tags
  useEffect(() => {
    supabase.from('contact_tags').select('tag').then(({ data }) => {
      const unique = [...new Set((data ?? []).map(r => r.tag))].sort();
      setAllTags(unique);
    });
  }, []);

  // Unified load — merges profiles, contacts, applications, sponsors_vendors, partners
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const LIMIT = 2000;
      const merged = new Map<string, Contact>();

      const add = (row: Contact) => {
        const key = row.email.toLowerCase().trim();
        const existing = merged.get(key);
        const newPriority = TYPE_PRIORITY[row.contact_type ?? ''] ?? 0;
        const existingPriority = existing ? (TYPE_PRIORITY[existing.contact_type ?? ''] ?? 0) : -1;
        if (!existing || newPriority > existingPriority) {
          merged.set(key, { ...row, email: key });
        }
      };

      // 1 — profiles (members)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name, phone, subscription_status, membership_override, created_at')
        .is('deleted_at', null)
        .not('email', 'is', null)
        .limit(LIMIT);
      for (const p of profiles ?? []) {
        if (!p.email) continue;
        add({
          id: p.id,
          email: p.email,
          full_name: p.full_name ?? null,
          phone: p.phone ?? null,
          company: null,
          contact_type: 'member',
          status: deriveStatus(p as any),
          source: 'profiles',
          lead_score: null,
          last_activity_at: null,
          created_at: p.created_at ?? null,
          source_table: 'profiles',
        });
      }

      // 2 — contacts table
      const { data: contactRows } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      for (const c of contactRows ?? []) {
        if (!c.email) continue;
        const guestTypes = ['guest', 'guest_pass', 'event_guest'];
        const resolvedType = guestTypes.includes(c.contact_type ?? '') ? 'guest' : (c.contact_type ?? 'prospect');
        add({ ...c, contact_type: resolvedType, source_table: 'contacts' });
      }

      // 3 — business_applications (applicants)
      const { data: apps } = await supabase
        .from('business_applications')
        .select('id, email, first_name, last_name, phone, company, created_at, status')
        .limit(LIMIT);
      for (const a of apps ?? []) {
        if (!a.email) continue;
        add({
          id: a.id,
          email: a.email,
          full_name: [a.first_name, a.last_name].filter(Boolean).join(' ') || null,
          phone: a.phone ?? null,
          company: a.company ?? null,
          contact_type: 'applicant',
          status: a.status ?? 'pending',
          source: 'application',
          lead_score: null,
          last_activity_at: null,
          created_at: a.created_at ?? null,
          source_table: 'business_applications',
        });
      }

      // 4 — sponsors_vendors
      const { data: sv } = await supabase
        .from('sponsors_vendors')
        .select('id, email, contact_name, company_name, created_at, partnership_type, status')
        .limit(LIMIT);
      for (const s of sv ?? []) {
        if (!s.email) continue;
        const svType = s.partnership_type === 'partner' ? 'partner' : s.partnership_type === 'vendor' ? 'vendor' : 'sponsor';
        add({
          id: s.id,
          email: s.email,
          full_name: s.contact_name ?? null,
          phone: null,
          company: s.company_name ?? null,
          contact_type: svType,
          status: s.status ?? 'active',
          source: 'sponsors_vendors',
          lead_score: null,
          last_activity_at: null,
          created_at: s.created_at ?? null,
          source_table: 'sponsors_vendors',
        });
      }

      // 5 — partners table
      const { data: partners } = await supabase
        .from('partners')
        .select('id, email, full_name, phone, company, created_at, status')
        .limit(LIMIT);
      for (const p of partners ?? []) {
        if (!p.email) continue;
        add({
          id: p.id,
          email: p.email,
          full_name: (p as any).full_name ?? (p as any).name ?? null,
          phone: (p as any).phone ?? null,
          company: (p as any).company ?? null,
          contact_type: 'partner',
          status: (p as any).status ?? 'active',
          source: 'partners',
          lead_score: null,
          last_activity_at: null,
          created_at: p.created_at ?? null,
          source_table: 'partners',
        });
      }

      const all = Array.from(merged.values()).sort((a, b) => {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return db - da;
      });

      // Compute type counts
      const counts: Record<string, number> = {};
      for (const c of all) {
        const t = c.contact_type ?? 'prospect';
        counts[t] = (counts[t] ?? 0) + 1;
      }
      setTypeCounts(counts);
      setAllContacts(all);

    } catch (err) {
      console.error('[CRM] unified load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Apply search + typeTab + filters client-side
  useEffect(() => {
    let filtered = allContacts;

    if (typeTab !== 'all') {
      filtered = filtered.filter(c => c.contact_type === typeTab);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(c =>
        (c.full_name?.toLowerCase().includes(q)) ||
        c.email.toLowerCase().includes(q) ||
        (c.company?.toLowerCase().includes(q))
      );
    }
    if (filters.contact_type) filtered = filtered.filter(c => c.contact_type === filters.contact_type);
    if (filters.status)        filtered = filtered.filter(c => c.status === filters.status);
    if (filters.source)        filtered = filtered.filter(c => c.source === filters.source);
    if (filters.lead_score_min) filtered = filtered.filter(c => (c.lead_score ?? 0) >= parseInt(filters.lead_score_min));
    if (filters.lead_score_max) filtered = filtered.filter(c => (c.lead_score ?? 0) <= parseInt(filters.lead_score_max));
    if (filters.date_from) filtered = filtered.filter(c => c.created_at && c.created_at >= filters.date_from);
    if (filters.date_to)   filtered = filtered.filter(c => c.created_at && c.created_at <= filters.date_to + 'T23:59:59');

    setTotal(filtered.length);
    setContacts(filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
  }, [allContacts, typeTab, search, filters, page]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteContact) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('contacts').delete().eq('id', deleteContact.id);
      if (error) throw error;
      toast.success('Contact deleted');
      setDeleteContact(null);
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const handleExportCSV = () => {
    const rows = [
      ['Name', 'Email', 'Phone', 'Company', 'Type', 'Status', 'Source', 'Lead Score', 'Last Activity', 'Added'],
      ...contacts.map(c => [
        c.full_name ?? '',
        c.email,
        c.phone ?? '',
        c.company ?? '',
        c.contact_type ?? '',
        c.status ?? '',
        c.source ?? '',
        String(c.lead_score ?? 0),
        c.last_activity_at ? format(new Date(c.last_activity_at), 'yyyy-MM-dd') : '',
        c.created_at ? format(new Date(c.created_at), 'yyyy-MM-dd') : '',
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Contacts exported');
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === contacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contacts.map(c => c.id)));
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4 pb-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total.toLocaleString()} contact{total !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2">
            <Download className="w-4 h-4" /> Export
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Contact
          </Button>
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {TYPE_TABS.map(({ key, label }) => {
          const count = key === 'all'
            ? Object.values(typeCounts).reduce((a, b) => a + b, 0)
            : (typeCounts[key] ?? 0);
          const active = typeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { setTypeTab(key); setPage(0); }}
              className={active
                ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary text-primary-foreground transition-colors whitespace-nowrap'
                : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap'
              }
            >
              {label}
              {count > 0 && (
                <span className={active
                  ? 'bg-primary-foreground/20 text-primary-foreground ml-0.5 px-1.5 py-0 text-[11px] leading-5 font-normal rounded-full'
                  : 'bg-muted text-muted-foreground ml-0.5 px-1.5 py-0 text-[11px] leading-5 font-normal rounded-full'
                }>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search + Filter bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, company…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 h-9 text-sm"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2 shrink-0"
        >
          <Filter className="w-4 h-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <span className="text-xs bg-primary-foreground text-primary px-1.5 rounded-full">{activeFilterCount}</span>
          )}
        </Button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <FilterPanel
          filters={filters}
          onChange={f => { setFilters(f); setPage(0); }}
          onClear={() => { setFilters(EMPTY_FILTERS); setPage(0); }}
          allTags={allTags}
        />
      )}

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/10 border border-primary/20 rounded-lg text-sm">
          <span className="text-primary font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-2 ml-2">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
              <Mail className="w-3.5 h-3.5" /> Email
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
              <Workflow className="w-3.5 h-3.5" /> Add to Drip
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-red-400 border-red-400/30 hover:bg-red-400/10">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          </div>
          <button type="button" onClick={() => setSelected(new Set())} aria-label="Clear selection" className="ml-auto text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table — desktop */}
      <div className="hidden sm:block bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto min-w-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === contacts.length && contacts.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-border"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name + Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Score</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Last Activity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Added</th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-3"><div className="w-4 h-4 bg-muted animate-pulse rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-40" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-20" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-16" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-8" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-20" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-24" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-20" /></td>
                    <td className="px-4 py-3" />
                  </tr>
                ))
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-muted-foreground text-sm">
                    {search || activeFilterCount > 0 ? 'No contacts match your search or filters.' : 'No contacts yet. Add your first contact to get started.'}
                  </td>
                </tr>
              ) : (
                contacts.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => setEditContact(c)}
                  >
                    <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggleSelect(c.id); }}>
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="rounded border-border"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{c.full_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{c.email}</div>
                      {c.company && <div className="text-xs text-muted-foreground/60">{c.company}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-md capitalize font-normal ${TYPE_COLORS[c.contact_type ?? ''] ?? 'bg-muted text-muted-foreground'}`}>
                        {capitalize(c.contact_type ?? 'unknown')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[c.status ?? ''] ?? 'bg-muted text-muted-foreground border-border'}`}>
                        {capitalize(c.status ?? 'unknown')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <LeadScoreDot score={c.lead_score ?? 0} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{capitalize(c.source ?? '—')}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.last_activity_at ? format(new Date(c.last_activity_at), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.created_at ? format(new Date(c.created_at), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Open contact actions menu">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => setEditContact(c)} className="gap-2 text-sm">
                            <UserPlus className="w-4 h-4" /> View / Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDripContact(c)} className="gap-2 text-sm">
                            <Workflow className="w-4 h-4" /> Add to Drip
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-sm">
                            <Mail className="w-4 h-4" /> Add to Sequence
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setConvertContact(c)} className="gap-2 text-sm">
                            <ArrowRightLeft className="w-4 h-4" /> Convert to Member
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDeleteContact(c)} className="gap-2 text-sm text-red-400 focus:text-red-400">
                            <Trash2 className="w-4 h-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cards — mobile */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
          ))
        ) : contacts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {search || activeFilterCount > 0 ? 'No contacts match your search.' : 'No contacts yet.'}
          </div>
        ) : (
          contacts.map((c) => (
            <div
              key={c.id}
              className="bg-card border border-border rounded-xl p-4"
              onClick={() => setEditContact(c)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{c.full_name ?? c.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                  {c.company && <p className="text-xs text-muted-foreground/60 truncate">{c.company}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                  <LeadScoreDot score={c.lead_score ?? 0} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open contact actions menu">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => setEditContact(c)} className="gap-2 text-sm">
                        <UserPlus className="w-4 h-4" /> View / Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDripContact(c)} className="gap-2 text-sm">
                        <Workflow className="w-4 h-4" /> Add to Drip
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setConvertContact(c)} className="gap-2 text-sm">
                        <ArrowRightLeft className="w-4 h-4" /> Convert to Member
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setDeleteContact(c)} className="gap-2 text-sm text-red-400 focus:text-red-400">
                        <Trash2 className="w-4 h-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className={`text-[11px] px-1.5 py-0.5 rounded-md capitalize font-normal ${TYPE_COLORS[c.contact_type ?? ''] ?? 'bg-muted text-muted-foreground'}`}>
                  {capitalize(c.contact_type ?? 'unknown')}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[c.status ?? ''] ?? 'bg-muted text-muted-foreground border-border'}`}>
                  {capitalize(c.status ?? 'unknown')}
                </span>
                {c.last_activity_at && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {format(new Date(c.last_activity_at), 'MMM d')}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0} className="h-8 w-8 p-0">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} className="h-8 w-8 p-0">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <ContactDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        contact={null}
        onSaved={load}
      />
      <ContactDialog
        open={!!editContact}
        onClose={() => setEditContact(null)}
        contact={editContact}
        onSaved={load}
      />
      <DripEnrollDialog
        open={!!dripContact}
        onClose={() => setDripContact(null)}
        contact={dripContact}
      />
      <ConvertDialog
        open={!!convertContact}
        onClose={() => setConvertContact(null)}
        contact={convertContact}
      />

      {/* Delete confirm */}
      <Dialog open={!!deleteContact} onOpenChange={() => setDeleteContact(null)}>
        <DialogContent className="w-full max-w-sm mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
            <DialogDescription>
              Permanently delete {deleteContact?.full_name ?? deleteContact?.email}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setDeleteContact(null)} className="w-full sm:w-auto">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="w-full sm:w-auto">
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}