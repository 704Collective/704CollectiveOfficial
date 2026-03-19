'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Plus, MoreHorizontal, X, Loader2, ArrowLeft,
  DollarSign, User, Building2, Calendar, FileText,
  CheckCircle2, XCircle, Clock, AlertCircle, ChevronRight,
  Mail, Phone, Trash2, Edit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/* ─── Types ─── */
type DealStage =
  | 'applied' | 'screening' | 'interviewed'
  | 'approved' | 'active' | 'denied' | 'waitlisted' | 'lost';

interface Deal {
  id: string;
  name: string;
  contact_id: string | null;
  profile_id: string | null;
  stage: DealStage;
  value: number | null;
  deal_type: string | null;
  industry: string | null;
  notes: string | null;
  internal_notes: string | null;
  application_data: Record<string, any>;
  applied_at: string | null;
  last_stage_change_at: string | null;
  closed_at: string | null;
  denial_reason: string | null;
  waitlist_reason: string | null;
  assigned_to: string | null;
  created_at: string | null;
  contact?: { email: string; full_name: string | null; phone: string | null; company: string | null } | null;
}

/* ─── Constants ─── */
const STAGES: { key: DealStage; label: string; color: string; bg: string; border: string }[] = [
  { key: 'applied',     label: 'Applied',     color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20' },
  { key: 'screening',   label: 'Screening',   color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/20' },
  { key: 'interviewed', label: 'Interviewed', color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20' },
  { key: 'approved',    label: 'Approved',    color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { key: 'active',      label: 'Active',      color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/20' },
  { key: 'waitlisted',  label: 'Waitlisted',  color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20' },
  { key: 'denied',      label: 'Denied',      color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
];

const VISIBLE_STAGES: DealStage[] = ['applied', 'screening', 'interviewed', 'approved', 'active', 'waitlisted'];

const INDUSTRIES = [
  'Technology', 'Finance', 'Real Estate', 'Healthcare', 'Marketing',
  'Legal', 'Consulting', 'Retail', 'Food & Beverage', 'Media',
  'Construction', 'Education', 'Nonprofit', 'Other',
];

function formatCurrency(n: number | null) {
  if (!n) return '—';
  return `$${n.toLocaleString()}/mo`;
}

function daysAgo(date: string | null) {
  if (!date) return '';
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return '1 day ago';
  return `${diff} days ago`;
}

/* ─── Deal Card ─── */
function DealCard({
  deal, onOpen, onStageChange,
}: {
  deal: Deal;
  onOpen: (d: Deal) => void;
  onStageChange: (id: string, stage: DealStage) => void;
}) {
  const stage = STAGES.find(s => s.key === deal.stage);

  return (
    <div
      className="bg-card border border-border rounded-xl p-3.5 cursor-pointer hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-all group"
      onClick={() => onOpen(deal)}
    >
      {/* Name + value */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-medium text-sm text-foreground leading-snug">{deal.name}</p>
        {deal.value && (
          <span className="text-xs text-primary font-semibold shrink-0">{formatCurrency(deal.value)}</span>
        )}
      </div>

      {/* Contact info */}
      {deal.contact && (
        <div className="space-y-0.5 mb-2.5">
          {deal.contact.full_name && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <User className="w-3 h-3 shrink-0" />{deal.contact.full_name}
            </p>
          )}
          <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
            <Mail className="w-3 h-3 shrink-0" />{deal.contact.email}
          </p>
          {deal.contact.company && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Building2 className="w-3 h-3 shrink-0" />{deal.contact.company}
            </p>
          )}
        </div>
      )}

      {/* Meta */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {deal.industry && (
            <span className="text-xs text-muted-foreground/60 bg-muted/60 px-2 py-0.5 rounded-full">{deal.industry}</span>
          )}
          <span className="text-xs text-muted-foreground/50 flex items-center gap-1">
            <Clock className="w-3 h-3" />{daysAgo(deal.applied_at)}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={e => { e.stopPropagation(); onOpen(deal); }} className="text-sm">View / Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <p className="px-2 py-1 text-xs text-muted-foreground">Move to stage</p>
            {STAGES.filter(s => s.key !== deal.stage).map(s => (
              <DropdownMenuItem
                key={s.key}
                onClick={e => { e.stopPropagation(); onStageChange(deal.id, s.key); }}
                className={`text-sm gap-2 ${s.color}`}
              >
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/* ─── Deal Detail Dialog ─── */
function DealDetailDialog({
  deal, open, onClose, onSaved, onDelete,
}: {
  deal: Deal | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: string) => void;
}) {
  const isNew = !deal;
  const [form, setForm] = useState({
    name: '', stage: 'applied' as DealStage, value: '',
    industry: '', notes: '', internal_notes: '',
    denial_reason: '', waitlist_reason: '',
    contact_email: '', contact_name: '', contact_phone: '', contact_company: '',
  });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'notes' | 'activity'>('details');

  useEffect(() => {
    if (deal) {
      setForm({
        name: deal.name,
        stage: deal.stage,
        value: deal.value?.toString() ?? '',
        industry: deal.industry ?? '',
        notes: deal.notes ?? '',
        internal_notes: deal.internal_notes ?? '',
        denial_reason: deal.denial_reason ?? '',
        waitlist_reason: deal.waitlist_reason ?? '',
        contact_email: deal.contact?.email ?? '',
        contact_name: deal.contact?.full_name ?? '',
        contact_phone: deal.contact?.phone ?? '',
        contact_company: deal.contact?.company ?? '',
      });
    } else {
      setForm({
        name: '', stage: 'applied', value: '', industry: '',
        notes: '', internal_notes: '', denial_reason: '', waitlist_reason: '',
        contact_email: '', contact_name: '', contact_phone: '', contact_company: '',
      });
    }
    setActiveTab('details');
  }, [deal, open]);

  const f = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Deal name is required'); return; }
    setSaving(true);
    try {
      let contactId: string | null = null;

      // Create or find contact by email
      if (form.contact_email.trim()) {
        const { data: existing } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', form.contact_email.trim().toLowerCase())
          .maybeSingle();

        if (existing) {
          contactId = existing.id;
          await supabase.from('contacts').update({
            full_name: form.contact_name || null,
            phone: form.contact_phone || null,
            company: form.contact_company || null,
          }).eq('id', contactId);
        } else {
          const { data: newContact } = await supabase.from('contacts').insert({
            email: form.contact_email.trim().toLowerCase(),
            full_name: form.contact_name || null,
            phone: form.contact_phone || null,
            company: form.contact_company || null,
            contact_type: 'prospect',
            source: 'manual',
          }).select('id').single();
          contactId = newContact?.id ?? null;
        }
      }

      const payload = {
        name: form.name.trim(),
        stage: form.stage,
        value: form.value ? parseFloat(form.value) : null,
        industry: form.industry || null,
        notes: form.notes || null,
        internal_notes: form.internal_notes || null,
        denial_reason: form.denial_reason || null,
        waitlist_reason: form.waitlist_reason || null,
        contact_id: contactId,
        last_stage_change_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (isNew) {
        const { error } = await supabase.from('crm_deals').insert({
          ...payload,
          applied_at: new Date().toISOString(),
        });
        if (error) throw error;
        toast.success('Deal created');
      } else {
        const { error } = await supabase.from('crm_deals').update(payload).eq('id', deal!.id);
        if (error) throw error;
        toast.success('Deal updated');
      }

      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const stageConfig = STAGES.find(s => s.key === form.stage);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto mx-4 sm:mx-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>{isNew ? 'New Deal' : form.name}</DialogTitle>
            {!isNew && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { onDelete(deal!.id); onClose(); }}
                className="text-red-400 hover:text-red-400 hover:bg-red-400/10 gap-2 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            )}
          </div>
          {!isNew && deal && (
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${stageConfig?.bg} ${stageConfig?.color} ${stageConfig?.border}`}>
                {stageConfig?.label}
              </span>
              <span className="text-xs text-muted-foreground">Applied {daysAgo(deal.applied_at)}</span>
              {deal.value && <span className="text-xs text-primary font-medium">{formatCurrency(deal.value)}</span>}
            </div>
          )}
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border -mt-2">
          {(['details', 'notes', 'activity'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'details' && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label className="text-xs text-muted-foreground mb-1.5 block">Deal Name <span className="text-red-400">*</span></Label>
                <Input value={form.name} onChange={f('name')} placeholder="e.g. John Smith — Business Application" className="text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Stage</Label>
                <Select value={form.stage} onValueChange={v => setForm(p => ({ ...p, stage: v as DealStage }))}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map(s => (
                      <SelectItem key={s.key} value={s.key}>
                        <span className={s.color}>{s.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Monthly Value ($)</Label>
                <Input type="number" value={form.value} onChange={f('value')} placeholder="300" className="text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Industry</Label>
                <Select value={form.industry || 'none'} onValueChange={v => setForm(p => ({ ...p, industry: v === 'none' ? '' : v }))}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Select industry" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Contact info */}
            <div className="border border-border rounded-xl p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contact Information</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Email</Label>
                  <Input type="email" value={form.contact_email} onChange={f('contact_email')} placeholder="john@example.com" className="text-sm h-9" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Full Name</Label>
                  <Input value={form.contact_name} onChange={f('contact_name')} placeholder="John Smith" className="text-sm h-9" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Phone</Label>
                  <Input type="tel" value={form.contact_phone} onChange={f('contact_phone')} placeholder="704-555-0100" className="text-sm h-9" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Company</Label>
                  <Input value={form.contact_company} onChange={f('contact_company')} placeholder="Acme Corp" className="text-sm h-9" />
                </div>
              </div>
            </div>

            {/* Stage-specific fields */}
            {form.stage === 'denied' && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Denial Reason</Label>
                <Textarea value={form.denial_reason} onChange={f('denial_reason')} placeholder="Reason for denial…" rows={3} className="text-sm resize-none" />
              </div>
            )}
            {form.stage === 'waitlisted' && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Waitlist Reason</Label>
                <Textarea value={form.waitlist_reason} onChange={f('waitlist_reason')} placeholder="e.g. Industry at capacity" rows={3} className="text-sm resize-none" />
              </div>
            )}
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Application Notes</Label>
              <Textarea
                value={form.notes}
                onChange={f('notes')}
                placeholder="Notes visible to all admins…"
                rows={5}
                className="text-sm resize-none"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Internal Notes (Super Admin only)</Label>
              <Textarea
                value={form.internal_notes}
                onChange={f('internal_notes')}
                placeholder="Private notes…"
                rows={4}
                className="text-sm resize-none"
              />
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="py-4">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Clock className="w-8 h-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Activity timeline coming soon</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Stage changes, notes, and emails will appear here</p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 flex-col sm:flex-row pt-2">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isNew ? 'Create Deal' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Pipeline Stats Bar ─── */
function PipelineStats({ deals }: { deals: Deal[] }) {
  const active = deals.filter(d => !['denied', 'lost'].includes(d.stage));
  const totalValue = active.reduce((s, d) => s + (d.value ?? 0), 0);
  const approved = deals.filter(d => d.stage === 'approved' || d.stage === 'active').length;
  const denied = deals.filter(d => d.stage === 'denied').length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: 'Open Deals',      value: active.length,                   color: 'text-foreground' },
        { label: 'Pipeline Value',  value: `$${totalValue.toLocaleString()}/mo`, color: 'text-primary' },
        { label: 'Approved/Active', value: approved,                        color: 'text-emerald-400' },
        { label: 'Denied',          value: denied,                          color: 'text-red-400' },
      ].map(s => (
        <div key={s.label} className="bg-card border border-border rounded-xl p-4 text-center">
          <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Page ─── */
export default function CrmPipelinePage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [detailDeal, setDetailDeal] = useState<Deal | null | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crm_deals')
        .select('*, contact:contacts(email, full_name, phone, company)')
        .order('applied_at', { ascending: false });
      if (error) throw error;
      setDeals(data ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStageChange = async (id: string, stage: DealStage) => {
    try {
      const { error } = await supabase.from('crm_deals').update({
        stage,
        last_stage_change_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      toast.success(`Moved to ${STAGES.find(s => s.key === stage)?.label}`);
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to move deal');
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from('crm_deals').delete().eq('id', id);
      if (error) throw error;
      toast.success('Deal deleted');
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  const dealsByStage = (stage: DealStage) => deals.filter(d => d.stage === stage);

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Business membership application pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            {(['kanban', 'list'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setDetailDeal(null)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Deal
          </Button>
        </div>
      </div>

      {/* Stats */}
      <PipelineStats deals={deals} />

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : view === 'kanban' ? (
        /* ── Kanban Board ── */
        <div className="overflow-x-auto -mx-4 px-4 lg:-mx-0 lg:px-0">
          <div className="flex gap-3 min-w-max lg:min-w-0 lg:grid lg:grid-cols-6 pb-3">
            {VISIBLE_STAGES.map(stageKey => {
              const stage = STAGES.find(s => s.key === stageKey)!;
              const stageDeals = dealsByStage(stageKey);
              return (
                <div key={stageKey} className="w-64 lg:w-auto shrink-0">
                  {/* Column header */}
                  <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl border ${stage.bg} ${stage.border} mb-2`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${stage.color}`}>{stage.label}</span>
                      <span className="text-xs text-muted-foreground bg-background/40 px-1.5 py-0.5 rounded-full">
                        {stageDeals.length}
                      </span>
                    </div>
                    {stageDeals.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ${stageDeals.reduce((s, d) => s + (d.value ?? 0), 0).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Cards */}
                  <div className="space-y-2 min-h-16">
                    {stageDeals.length === 0 ? (
                      <div className="flex items-center justify-center h-16 border border-dashed border-border/40 rounded-xl">
                        <p className="text-xs text-muted-foreground/40">Empty</p>
                      </div>
                    ) : (
                      stageDeals.map(deal => (
                        <DealCard
                          key={deal.id}
                          deal={deal}
                          onOpen={d => setDetailDeal(d)}
                          onStageChange={handleStageChange}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── List View ── */
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Deal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Stage</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Value</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Industry</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Applied</th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {deals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    No deals yet. Add your first deal to get started.
                  </td>
                </tr>
              ) : (
                deals.map(deal => {
                  const stage = STAGES.find(s => s.key === deal.stage);
                  return (
                    <tr
                      key={deal.id}
                      className="border-b border-border hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => setDetailDeal(deal)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{deal.name}</p>
                      </td>
                      <td className="px-4 py-3">
                        {deal.contact ? (
                          <div>
                            <p className="text-sm text-foreground">{deal.contact.full_name ?? '—'}</p>
                            <p className="text-xs text-muted-foreground">{deal.contact.email}</p>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${stage?.bg} ${stage?.color} ${stage?.border}`}>
                          {stage?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-primary font-medium">{formatCurrency(deal.value)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{deal.industry ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{daysAgo(deal.applied_at)}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => setDetailDeal(deal)} className="text-sm">View / Edit</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDelete(deal.id)} className="text-sm text-red-400 focus:text-red-400 gap-2">
                              <Trash2 className="w-4 h-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Deal detail dialog */}
      <DealDetailDialog
        deal={detailDeal ?? null}
        open={detailDeal !== undefined}
        onClose={() => setDetailDeal(undefined)}
        onSaved={load}
        onDelete={handleDelete}
      />
    </div>
  );
}