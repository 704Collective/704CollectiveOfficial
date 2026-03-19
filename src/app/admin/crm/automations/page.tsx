'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Plus, MoreHorizontal, ArrowLeft, Trash2, X, Loader2,
  Workflow, Mail, Clock, Play, Pause, Archive,
  ChevronDown, ChevronUp, GripVertical, Users, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

/* ─── Types ─── */
type DripStatus = 'draft' | 'active' | 'paused' | 'archived';
type TriggerType =
  | 'event_guest' | 'guest_pass' | 'member_canceled'
  | 'prospect_added' | 'tag_added' | 'manual' | 'form_submitted' | 'member_joined';

interface DripStep {
  id: string;
  step_number: number;
  delay_days: number;
  subject: string;
  body_html: string;
}

interface DripCampaign {
  id: string;
  name: string;
  description: string | null;
  trigger_type: TriggerType;
  trigger_config: Record<string, any>;
  status: DripStatus;
  stop_on_conversion: boolean;
  created_at: string | null;
  steps?: DripStep[];
  enrollment_count?: number;
}

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string | null;
  step_count?: number;
}

/* ─── Constants ─── */
const STATUS_STYLES: Record<DripStatus, string> = {
  draft:    'bg-gray-500/15 text-gray-400 border-gray-500/20',
  active:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  paused:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  archived: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
};

const TRIGGER_OPTIONS: { value: TriggerType; label: string; desc: string }[] = [
  { value: 'event_guest',    label: 'Event Guest',       desc: 'Non-member buys a ticket' },
  { value: 'guest_pass',     label: 'Guest Pass',        desc: 'Guest pass redeemed at check-in' },
  { value: 'member_canceled',label: 'Member Canceled',   desc: 'Subscription canceled' },
  { value: 'prospect_added', label: 'Prospect Added',    desc: 'New contact created or imported' },
  { value: 'tag_added',      label: 'Tag Added',         desc: 'Specific tag applied to contact' },
  { value: 'form_submitted', label: 'Form Submitted',    desc: 'Contact submits a CRM form' },
  { value: 'member_joined',  label: 'Member Joined',     desc: 'New member completes signup' },
  { value: 'manual',         label: 'Manual',            desc: 'Admin enrolls contacts manually' },
];

function uid() { return Math.random().toString(36).slice(2, 10); }

function getTriggerLabel(type: TriggerType) {
  return TRIGGER_OPTIONS.find(t => t.value === type)?.label ?? type;
}

/* ─── Step Editor ─── */
function StepEditor({
  step, index, total, onChange, onDelete, onMove,
}: {
  step: DripStep; index: number; total: number;
  onChange: (s: DripStep) => void;
  onDelete: (id: string) => void;
  onMove: (from: number, to: number) => void;
}) {
  const [expanded, setExpanded] = useState(index === 0);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Step header */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-muted/30 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold shrink-0">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {step.subject || `Step ${index + 1}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {step.delay_days === 0 ? 'Send immediately' : `Send after ${step.delay_days} day${step.delay_days !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onMove(index, index - 1)}
            disabled={index === 0}
            className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => onMove(index, index + 1)}
            disabled={index === total - 1}
            className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(step.id)}
            className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" className="p-1.5">
            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* Step body */}
      {expanded && (
        <div className="px-4 py-4 space-y-4 border-t border-border">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Delay (days after enrollment)</Label>
              <Input
                type="number" min={0} max={365}
                value={step.delay_days}
                onChange={e => onChange({ ...step, delay_days: parseInt(e.target.value) || 0 })}
                className="h-9 text-sm"
              />
              <p className="text-xs text-muted-foreground/60 mt-1">0 = send immediately on enrollment</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Subject Line</Label>
              <Input
                value={step.subject}
                onChange={e => onChange({ ...step, subject: e.target.value })}
                placeholder="Email subject…"
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Email Body</Label>
            <Textarea
              value={step.body_html}
              onChange={e => onChange({ ...step, body_html: e.target.value })}
              placeholder="Write your email content here. Use {first_name} for personalization."
              rows={6}
              className="text-sm resize-none font-mono"
            />
            <p className="text-xs text-muted-foreground/60 mt-1">
              Supports HTML. Use {'{first_name}'}, {'{email}'} for personalization tokens.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Drip Builder ─── */
function DripBuilder({
  drip, onBack, onSaved,
}: {
  drip: DripCampaign | null;
  onBack: () => void;
  onSaved: () => void;
}) {
  const isNew = !drip;
  const [name, setName] = useState(drip?.name ?? '');
  const [description, setDescription] = useState(drip?.description ?? '');
  const [triggerType, setTriggerType] = useState<TriggerType>(drip?.trigger_type ?? 'prospect_added');
  const [tagTrigger, setTagTrigger] = useState(drip?.trigger_config?.tag ?? '');
  const [stopOnConversion, setStopOnConversion] = useState(drip?.stop_on_conversion ?? true);
  const [steps, setSteps] = useState<DripStep[]>(drip?.steps ?? []);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'steps' | 'settings'>('steps');

  const addStep = () => {
    const lastDelay = steps[steps.length - 1]?.delay_days ?? 0;
    setSteps(prev => [...prev, {
      id: uid(),
      step_number: prev.length + 1,
      delay_days: lastDelay + (prev.length === 0 ? 0 : 3),
      subject: '',
      body_html: '',
    }]);
  };

  const moveStep = (from: number, to: number) => {
    if (to < 0 || to >= steps.length) return;
    const next = [...steps];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setSteps(next.map((s, i) => ({ ...s, step_number: i + 1 })));
  };

  const deleteStep = (id: string) => setSteps(prev => prev.filter(s => s.id !== id).map((s, i) => ({ ...s, step_number: i + 1 })));
  const updateStep = (updated: DripStep) => setSteps(prev => prev.map(s => s.id === updated.id ? updated : s));

  const handleSave = async (status?: DripStatus) => {
    if (!name.trim()) { toast.error('Campaign name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description || null,
        trigger_type: triggerType,
        trigger_config: triggerType === 'tag_added' ? { tag: tagTrigger } : {},
        stop_on_conversion: stopOnConversion,
        ...(status ? { status } : {}),
      };

      let dripId = drip?.id;

      if (isNew) {
        const { data, error } = await supabase
          .from('drip_campaigns')
          .insert({ ...payload, status: 'draft' })
          .select('id')
          .single();
        if (error) throw error;
        dripId = data.id;
      } else {
        const { error } = await supabase.from('drip_campaigns').update(payload).eq('id', drip!.id);
        if (error) throw error;
      }

      // Upsert steps
      if (dripId && steps.length > 0) {
        // Delete existing steps and re-insert
        await supabase.from('drip_steps').delete().eq('drip_campaign_id', dripId);
        const { error: stepsError } = await supabase.from('drip_steps').insert(
          steps.map((s, i) => ({
            drip_campaign_id: dripId,
            step_number: i + 1,
            delay_days: s.delay_days,
            subject: s.subject,
            body_html: s.body_html,
          }))
        );
        if (stepsError) throw stepsError;
      }

      toast.success(status === 'active' ? 'Drip campaign activated!' : isNew ? 'Drip campaign created' : 'Changes saved');
      onSaved();
      onBack();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const selectedTrigger = TRIGGER_OPTIONS.find(t => t.value === triggerType);

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{isNew ? 'New Drip Campaign' : name}</h1>
            <p className="text-xs text-muted-foreground">
              {steps.length} step{steps.length !== 1 ? 's' : ''}
              {drip?.status === 'active' && <span className="ml-2 text-emerald-400">● Active</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleSave()} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Draft
          </Button>
          {drip?.status !== 'active' && (
            <Button size="sm" onClick={() => handleSave('active')} disabled={saving || steps.length === 0} className="gap-2">
              <Play className="w-4 h-4" /> Activate
            </Button>
          )}
          {drip?.status === 'active' && (
            <Button size="sm" variant="outline" onClick={() => handleSave('paused')} disabled={saving} className="gap-2 text-yellow-400 border-yellow-400/30">
              <Pause className="w-4 h-4" /> Pause
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['steps', 'settings'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'steps' ? `Steps (${steps.length})` : 'Settings'}
          </button>
        ))}
      </div>

      {activeTab === 'settings' ? (
        <div className="max-w-xl space-y-5">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Campaign Name <span className="text-red-400">*</span></Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Event Guest Follow-up" className="text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this drip do?" rows={3} className="text-sm resize-none" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Trigger</Label>
            <Select value={triggerType} onValueChange={v => setTriggerType(v as TriggerType)}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    <div>
                      <p>{t.label}</p>
                      <p className="text-xs text-muted-foreground">{t.desc}</p>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTrigger && (
              <p className="text-xs text-muted-foreground/60 mt-1">{selectedTrigger.desc}</p>
            )}
          </div>
          {triggerType === 'tag_added' && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Tag Value</Label>
              <Input value={tagTrigger} onChange={e => setTagTrigger(e.target.value)} placeholder="e.g. hot-lead" className="text-sm" />
            </div>
          )}
          <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl">
            <input
              type="checkbox"
              id="stop-conversion"
              checked={stopOnConversion}
              onChange={e => setStopOnConversion(e.target.checked)}
              className="rounded border-border w-4 h-4 shrink-0"
            />
            <div>
              <label htmlFor="stop-conversion" className="text-sm font-medium text-foreground cursor-pointer">
                Stop on conversion
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically stop sending if the contact becomes a member
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {/* Trigger badge */}
          <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-xl">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Trigger: {getTriggerLabel(triggerType)}</p>
              <p className="text-xs text-muted-foreground">{selectedTrigger?.desc}</p>
            </div>
          </div>

          {/* Steps */}
          {steps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-xl">
              <Mail className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">No steps yet</p>
              <Button size="sm" onClick={addStep} className="gap-2">
                <Plus className="w-4 h-4" /> Add First Step
              </Button>
            </div>
          ) : (
            <>
              {steps.map((step, index) => (
                <StepEditor
                  key={step.id}
                  step={step}
                  index={index}
                  total={steps.length}
                  onChange={updateStep}
                  onDelete={deleteStep}
                  onMove={moveStep}
                />
              ))}
              <Button variant="outline" size="sm" onClick={addStep} className="gap-2 w-full">
                <Plus className="w-4 h-4" /> Add Step
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─── */
export default function CrmAutomationsPage() {
  const [drips, setDrips] = useState<DripCampaign[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'drips' | 'sequences'>('drips');
  const [builderDrip, setBuilderDrip] = useState<DripCampaign | null | undefined>(undefined);
  // undefined = not open, null = new, DripCampaign = edit
  const [deleteDrip, setDeleteDrip] = useState<DripCampaign | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dripsRes, stepsRes, enrollRes, seqRes, seqStepsRes] = await Promise.all([
        supabase.from('drip_campaigns').select('*').order('created_at', { ascending: false }),
        supabase.from('drip_steps').select('*').order('step_number'),
        supabase.from('drip_enrollments').select('drip_campaign_id, status'),
        supabase.from('crm_sequences').select('*').order('created_at', { ascending: false }),
        supabase.from('crm_sequence_steps').select('sequence_id'),
      ]);

      const stepsMap: Record<string, DripStep[]> = {};
      (stepsRes.data ?? []).forEach(s => {
        if (!stepsMap[s.drip_campaign_id]) stepsMap[s.drip_campaign_id] = [];
        stepsMap[s.drip_campaign_id].push(s);
      });

      const enrollMap: Record<string, number> = {};
      (enrollRes.data ?? []).forEach(e => {
        if (e.status === 'active') enrollMap[e.drip_campaign_id] = (enrollMap[e.drip_campaign_id] ?? 0) + 1;
      });

      setDrips((dripsRes.data ?? []).map(d => ({
        ...d,
        steps: stepsMap[d.id] ?? [],
        enrollment_count: enrollMap[d.id] ?? 0,
      })));

      const seqStepsMap: Record<string, number> = {};
      (seqStepsRes.data ?? []).forEach(s => {
        seqStepsMap[s.sequence_id] = (seqStepsMap[s.sequence_id] ?? 0) + 1;
      });

      setSequences((seqRes.data ?? []).map(s => ({ ...s, step_count: seqStepsMap[s.id] ?? 0 })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (drip: DripCampaign, status: DripStatus) => {
    try {
      const { error } = await supabase.from('drip_campaigns').update({ status }).eq('id', drip.id);
      if (error) throw error;
      toast.success(`Campaign ${status}`);
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update');
    }
  };

  const handleDelete = async () => {
    if (!deleteDrip) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('drip_campaigns').delete().eq('id', deleteDrip.id);
      if (error) throw error;
      toast.success('Campaign deleted');
      setDeleteDrip(null);
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  if (builderDrip !== undefined) {
    return (
      <DripBuilder
        drip={builderDrip}
        onBack={() => setBuilderDrip(undefined)}
        onSaved={load}
      />
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Automations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Drip campaigns and email sequences</p>
        </div>
        <Button size="sm" onClick={() => setBuilderDrip(null)} className="gap-2">
          <Plus className="w-4 h-4" /> New Drip Campaign
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['drips', 'sequences'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'drips' ? `Drip Campaigns (${drips.length})` : `Sequences (${sequences.length})`}
          </button>
        ))}
      </div>

      {activeTab === 'drips' ? (
        /* ── Drips list ── */
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
            ))
          ) : drips.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-xl">
              <Workflow className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm mb-1">No drip campaigns yet</p>
              <p className="text-xs text-muted-foreground/60 mb-4">Automate your email outreach with trigger-based sequences</p>
              <Button size="sm" onClick={() => setBuilderDrip(null)} className="gap-2">
                <Plus className="w-4 h-4" /> Create First Drip Campaign
              </Button>
            </div>
          ) : (
            drips.map(drip => (
              <div
                key={drip.id}
                className="bg-card border border-border rounded-xl p-4 hover:border-border/60 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Status indicator */}
                    <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                      drip.status === 'active' ? 'bg-emerald-400 shadow-lg shadow-emerald-400/40' :
                      drip.status === 'paused' ? 'bg-yellow-400' : 'bg-gray-500'
                    }`} />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{drip.name}</p>
                      {drip.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{drip.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLES[drip.status]}`}>
                          {drip.status}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Zap className="w-3 h-3" />
                          {getTriggerLabel(drip.trigger_type)}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="w-3 h-3" />
                          {drip.steps?.length ?? 0} step{(drip.steps?.length ?? 0) !== 1 ? 's' : ''}
                        </span>
                        {(drip.enrollment_count ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-xs text-primary">
                            <Users className="w-3 h-3" />
                            {drip.enrollment_count} active
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => setBuilderDrip(drip)} className="gap-2 text-sm">
                        Edit
                      </DropdownMenuItem>
                      {drip.status === 'draft' && (
                        <DropdownMenuItem onClick={() => handleStatusChange(drip, 'active')} className="gap-2 text-sm text-emerald-400">
                          <Play className="w-4 h-4" /> Activate
                        </DropdownMenuItem>
                      )}
                      {drip.status === 'active' && (
                        <DropdownMenuItem onClick={() => handleStatusChange(drip, 'paused')} className="gap-2 text-sm text-yellow-400">
                          <Pause className="w-4 h-4" /> Pause
                        </DropdownMenuItem>
                      )}
                      {drip.status === 'paused' && (
                        <DropdownMenuItem onClick={() => handleStatusChange(drip, 'active')} className="gap-2 text-sm text-emerald-400">
                          <Play className="w-4 h-4" /> Resume
                        </DropdownMenuItem>
                      )}
                      {drip.status !== 'archived' && (
                        <DropdownMenuItem onClick={() => handleStatusChange(drip, 'archived')} className="gap-2 text-sm">
                          <Archive className="w-4 h-4" /> Archive
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setDeleteDrip(drip)} className="gap-2 text-sm text-red-400 focus:text-red-400">
                        <Trash2 className="w-4 h-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* ── Sequences list ── */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Semi-automated personal outreach sequences. Pause automatically when someone replies.
            </p>
            <Button size="sm" variant="outline" className="gap-2">
              <Plus className="w-4 h-4" /> New Sequence
            </Button>
          </div>

          {loading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />
            ))
          ) : sequences.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-xl">
              <Mail className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm mb-1">No sequences yet</p>
              <p className="text-xs text-muted-foreground/60 mb-4">Create personalized outreach sequences for high-value prospects</p>
              <Button size="sm" variant="outline" className="gap-2">
                <Plus className="w-4 h-4" /> Create First Sequence
              </Button>
            </div>
          ) : (
            sequences.map(seq => (
              <div key={seq.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{seq.name}</p>
                    {seq.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{seq.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLES[seq.status as DripStatus] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/20'}`}>
                        {seq.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {seq.step_count} step{seq.step_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Delete dialog */}
      <Dialog open={!!deleteDrip} onOpenChange={() => setDeleteDrip(null)}>
        <DialogContent className="w-full max-w-sm mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>Delete Drip Campaign</DialogTitle>
            <DialogDescription>
              Permanently delete "{deleteDrip?.name}"? All steps and active enrollments will be removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setDeleteDrip(null)} className="w-full sm:w-auto">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="w-full sm:w-auto">
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}