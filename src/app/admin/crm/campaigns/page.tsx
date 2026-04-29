'use client';

import NextImage from 'next/image';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Plus, MoreHorizontal, Search, X, ArrowLeft, Send, Clock,
  BarChart2, Copy, Trash2, ChevronUp, ChevronDown, GripVertical,
  Type, Image as ImageIcon, MousePointer, Minus, AlignLeft,
  Calendar, Space, Loader2, Users, ChevronDown as ChevronDownIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';

interface Campaign {
  id: string;
  name: string;
  subject: string;
  preview_text: string | null;
  from_name: string | null;
  audience: Record<string, any>;
  status: CampaignStatus;
  scheduled_for: string | null;
  sent_at: string | null;
  sent_count: number;
  open_count: number;
  click_count: number;
  body_json: Block[] | null;
  body_html: string | null;
  created_at: string | null;
}

type BlockType =
  | 'logo' | 'greeting' | 'heading' | 'text' | 'image'
  | 'button' | 'divider' | 'spacer' | 'events_list' | 'signoff' | 'footer';

interface Block {
  id: string;
  type: BlockType;
  content: Record<string, any>;
}

/* ─── Constants ─── */
const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft:     'bg-gray-500/15 text-gray-400 border-gray-500/20',
  scheduled: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  sending:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  sent:      'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  failed:    'bg-red-500/15 text-red-400 border-red-500/20',
  cancelled: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
};

const AUDIENCE_OPTIONS = [
  { value: 'all_active',    label: 'All Active Members' },
  { value: 'social',        label: 'Social Members Only' },
  { value: 'business',      label: 'Business Members Only' },
  { value: 'non_member',    label: 'Non-Members (Leads)' },
  { value: 'all_contacts',  label: 'All Contacts' },
  { value: 'cancelled',     label: 'Cancelled Members' },
  { value: 'event_guests',  label: 'Event Guests' },
];

// All admins and super admins who can be sender

// Available tokens for insertion into text blocks
const EMAIL_TOKENS = [
  { label: 'First Name',       value: '{{first_name}}' },
  { label: 'Sender Name',      value: '{{sender_name}}' },
  { label: 'Unsubscribe Link', value: '{{unsubscribe_url}}' },
];

const BLOCK_PALETTE: { type: BlockType; label: string; icon: React.ElementType }[] = [
  { type: 'heading',     label: 'Heading',     icon: Type },
  { type: 'text',        label: 'Text Block',  icon: AlignLeft },
  { type: 'image',       label: 'Image',       icon: ImageIcon },
  { type: 'button',      label: 'Button',      icon: MousePointer },
  { type: 'divider',     label: 'Divider',     icon: Minus },
  { type: 'spacer',      label: 'Spacer',      icon: Space },
  { type: 'events_list', label: 'Events List', icon: Calendar },
  { type: 'signoff',     label: 'Sign-off',    icon: AlignLeft },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function defaultContent(type: BlockType): Record<string, any> {
  switch (type) {
    case 'logo':       return { link: 'https://704collective.com' };
    case 'greeting':   return { text: 'Hey {{first_name}},' };
    case 'heading':    return { text: 'Section Heading', size: 'h2' };
    case 'text':       return { text: 'Write your message here…' };
    case 'image':      return { url: '', alt: '', link: '' };
    case 'button':     return { text: 'Join Now', url: 'https://704collective.com/join/checkout', align: 'center', color: '#C6A664' };
    case 'divider':    return { color: '#2E2E2E' };
    case 'spacer':     return { height: 24 };
    case 'events_list': return { days_ahead: 7, title: 'The Weekly Lineup' };
    case 'signoff':    return { name: '{{sender_name}}', title: 'Co-Founder, 704 Collective', ps: '' };
    case 'footer':     return { org: '704 Collective, Charlotte, NC' };
    default:           return {};
  }
}

const DEFAULT_BLOCKS: Block[] = [
  { id: uid(), type: 'logo',       content: defaultContent('logo') },
  { id: uid(), type: 'greeting',   content: defaultContent('greeting') },
  { id: uid(), type: 'text',       content: defaultContent('text') },
  { id: uid(), type: 'events_list', content: defaultContent('events_list') },
  { id: uid(), type: 'signoff',    content: defaultContent('signoff') },
  { id: uid(), type: 'footer',     content: defaultContent('footer') },
];

/* ─── Token Insert Button ─── */
function TokenInsertButton({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1 hover:bg-muted transition-colors"
        >
          Insert token <ChevronDownIcon className="w-3 h-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {EMAIL_TOKENS.map(token => (
          <DropdownMenuItem
            key={token.value}
            onClick={() => onInsert(token.value)}
            className="text-xs gap-2"
          >
            <code className="text-primary text-[10px] bg-primary/10 px-1 rounded">{token.value}</code>
            {token.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── Block Renderer (preview) ─── */
function BlockPreview({ block }: { block: Block }) {
  const c = block.content;
  switch (block.type) {
    case 'logo':
      return (
        <div className="text-center py-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-black rounded-lg">
            <span className="text-white font-bold text-sm">704 Collective</span>
          </div>
        </div>
      );
    case 'greeting':
      return <p className="text-foreground font-medium py-2">{c.text}</p>;
    case 'heading':
      return <p className="font-bold text-lg text-foreground py-2">{c.text}</p>;
    case 'text':
      return <p className="text-muted-foreground text-sm py-2 whitespace-pre-wrap">{c.text}</p>;
    case 'image':
      return (
        <div className="py-2 flex justify-center">
          {c.url
            ? (
                <NextImage
                  src={c.url}
                  alt={c.alt || 'Campaign image'}
                  width={800}
                  height={384}
                  className="max-w-full rounded-lg max-h-48 object-cover w-auto h-auto"
                  sizes="(max-width:768px) 100vw, 600px"
                  loading="lazy"
                  unoptimized
                />
              )
            : <div className="w-full h-24 bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">Image URL required</div>
          }
        </div>
      );
    case 'button':
      return (
        <div className={`py-3 flex ${c.align === 'left' ? 'justify-start' : c.align === 'right' ? 'justify-end' : 'justify-center'}`}>
          <span className="px-6 py-2.5 rounded-lg text-sm font-semibold text-black" style={{ backgroundColor: c.color ?? '#C6A664' }}>
            {c.text}
          </span>
        </div>
      );
    case 'divider':
      return <hr className="my-3 border-border" />;
    case 'spacer':
      return <div style={{ height: c.height ?? 24 }} />;
    case 'events_list':
      return (
        <div className="py-2">
          <p className="font-bold text-foreground mb-2">{c.title}</p>
          <div className="space-y-1.5">
            {['Tue, Mar 18 • Coffee & Connect • 9:00 AM • Cool Idiot Coffee',
              'Thu, Mar 20 • Happy Hour Social • 6:00 PM • Tipsy Pickle',
              'Sat, Mar 22 • Cold Plunge & Sauna • 10:00 AM • Reset Recovery'].map((e, i) => (
              <div key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className="text-primary mt-0.5">•</span>{e}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground/60 mt-2 italic">Live event data will populate when sent</p>
        </div>
      );
    case 'signoff':
      return (
        <div className="py-2">
          <p className="text-muted-foreground text-sm">{c.name}</p>
          <p className="text-muted-foreground/60 text-xs">{c.title}</p>
          {c.ps && <p className="text-xs text-muted-foreground mt-2 italic">P.S. {c.ps}</p>}
        </div>
      );
    case 'footer':
      return (
        <div className="py-3 text-center border-t border-border mt-2">
          <p className="text-xs text-muted-foreground/60">{c.org}</p>
          <p className="text-xs text-muted-foreground/40 mt-1">
            <span className="underline cursor-pointer">Unsubscribe</span> · <span className="underline cursor-pointer">Manage preferences</span>
          </p>
        </div>
      );
    default:
      return null;
  }
}

/* ─── Block Editor ─── */
function BlockEditor({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const update = (key: string, value: any) => onChange({ ...block, content: { ...block.content, [key]: value } });
  const c = block.content;

  // Insert token at cursor position in a textarea
  const insertToken = (fieldKey: string, token: string, currentValue: string) => {
    update(fieldKey, currentValue + token);
  };

  switch (block.type) {
    case 'greeting':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs text-muted-foreground">Greeting text</Label>
            <TokenInsertButton onInsert={(t) => insertToken('text', t, c.text)} />
          </div>
          <Textarea
            value={c.text}
            onChange={e => update('text', e.target.value)}
            rows={2}
            className="text-sm resize-none"
            placeholder="Greeting line…"
          />
        </div>
      );
    case 'text':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs text-muted-foreground">Content</Label>
            <TokenInsertButton onInsert={(t) => insertToken('text', t, c.text)} />
          </div>
          <Textarea
            value={c.text}
            onChange={e => update('text', e.target.value)}
            rows={5}
            className="text-sm resize-none"
            placeholder="Write your message…"
          />
        </div>
      );
    case 'heading':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs text-muted-foreground">Heading text</Label>
            <TokenInsertButton onInsert={(t) => insertToken('text', t, c.text)} />
          </div>
          <Input value={c.text} onChange={e => update('text', e.target.value)} placeholder="Heading text" className="text-sm" />
          <Select value={c.size} onValueChange={v => update('size', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="h1">H1 - Large</SelectItem>
              <SelectItem value="h2">H2 - Medium</SelectItem>
              <SelectItem value="h3">H3 - Small</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    case 'image':
      return (
        <div className="space-y-2">
          <Input value={c.url} onChange={e => update('url', e.target.value)} placeholder="Image URL" className="text-sm" />
          <Input value={c.alt} onChange={e => update('alt', e.target.value)} placeholder="Alt text" className="text-sm" />
          <Input value={c.link} onChange={e => update('link', e.target.value)} placeholder="Link URL (optional)" className="text-sm" />
        </div>
      );
    case 'button':
      return (
        <div className="space-y-2">
          <Input value={c.text} onChange={e => update('text', e.target.value)} placeholder="Button label" className="text-sm" />
          <Input value={c.url} onChange={e => update('url', e.target.value)} placeholder="URL" className="text-sm" />
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1 block">Alignment</Label>
              <Select value={c.align} onValueChange={v => update('align', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1 block">Color</Label>
              <Input type="color" value={c.color} onChange={e => update('color', e.target.value)} className="h-8 p-1 cursor-pointer" />
            </div>
          </div>
        </div>
      );
    case 'spacer':
      return (
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Height (px): {c.height}</Label>
          <input type="range" min={8} max={80} value={c.height} onChange={e => update('height', parseInt(e.target.value))} className="w-full" />
        </div>
      );
    case 'events_list':
      return (
        <div className="space-y-2">
          <Input value={c.title} onChange={e => update('title', e.target.value)} placeholder="Section title" className="text-sm" />
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Days ahead: {c.days_ahead}</Label>
            <input type="range" min={3} max={30} value={c.days_ahead} onChange={e => update('days_ahead', parseInt(e.target.value))} className="w-full" />
          </div>
        </div>
      );
    case 'signoff':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <TokenInsertButton onInsert={(t) => insertToken('name', t, c.name)} />
          </div>
          <Input value={c.name} onChange={e => update('name', e.target.value)} placeholder="Your name or {{sender_name}}" className="text-sm" />
          <Input value={c.title} onChange={e => update('title', e.target.value)} placeholder="Title" className="text-sm" />
          <Input value={c.ps} onChange={e => update('ps', e.target.value)} placeholder="P.S. line (optional)" className="text-sm" />
          <p className="text-xs text-muted-foreground/60">
            Use <code className="text-primary bg-primary/10 px-1 rounded text-[10px]">{"{{sender_name}}"}</code> to auto-fill from the "From Name" setting.
          </p>
        </div>
      );
    case 'logo':
    case 'divider':
    case 'footer':
      return <p className="text-xs text-muted-foreground italic">This block has no editable content.</p>;
    default:
      return null;
  }
}

/* ─── Block Card ─── */
function BlockCard({
  block, index, total, onMove, onDelete, onChange, isSelected, onSelect,
}: {
  block: Block; index: number; total: number;
  onMove: (from: number, to: number) => void;
  onDelete: (id: string) => void;
  onChange: (b: Block) => void;
  isSelected: boolean;
  onSelect: (id: string | null) => void;
}) {
  const isFixed = block.type === 'logo' || block.type === 'footer';

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-all ${
        isSelected ? 'border-primary shadow-md shadow-primary/10' : 'border-border hover:border-border/80'
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40" />
          <span className="text-xs font-medium text-muted-foreground capitalize">{block.type.replace('_', ' ')}</span>
        </div>
        <div className="flex items-center gap-1">
          {!isFixed && (
            <>
              <button type="button" onClick={() => onMove(index, index - 1)} disabled={index === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors">
                <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button type="button" onClick={() => onMove(index, index + 1)} disabled={index === total - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors">
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button type="button" onClick={() => onDelete(block.id)} className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button type="button" onClick={() => onSelect(isSelected ? null : block.id)} className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors">
            {isSelected ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>

      <div className="px-4 py-1 bg-background cursor-pointer" onClick={() => onSelect(isSelected ? null : block.id)}>
        <BlockPreview block={block} />
      </div>

      {isSelected && (
        <div className="px-4 py-3 bg-muted/20 border-t border-border">
          <BlockEditor block={block} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

/* ─── Schedule Dialog ─── */
function ScheduleDialog({ open, onClose, campaign, onScheduled }: { open: boolean; onClose: () => void; campaign: Campaign | null; onScheduled: () => void }) {
  const [datetime, setDatetime] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSchedule = async () => {
    if (!datetime || !campaign) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('email_campaigns').update({
        status: 'scheduled',
        scheduled_for: new Date(datetime).toISOString(),
      }).eq('id', campaign.id);
      if (error) throw error;
      toast.success('Campaign scheduled');
      onScheduled();
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to schedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-sm mx-4 sm:mx-auto">
        <DialogHeader>
          <DialogTitle>Schedule Campaign</DialogTitle>
          <DialogDescription>{campaign?.name}</DialogDescription>
        </DialogHeader>
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Send Date & Time</Label>
          <Input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)} className="text-sm" />
        </div>
        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button onClick={handleSchedule} disabled={saving || !datetime} className="w-full sm:w-auto gap-2">
            <Clock className="w-4 h-4" />
            {saving ? 'Scheduling…' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Analytics Dialog ─── */
function AnalyticsDialog({ open, onClose, campaign }: { open: boolean; onClose: () => void; campaign: Campaign | null }) {
  if (!campaign) return null;
  const openRate  = campaign.sent_count > 0 ? Math.round((campaign.open_count  / campaign.sent_count) * 100) : 0;
  const clickRate = campaign.sent_count > 0 ? Math.round((campaign.click_count / campaign.sent_count) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-md mx-4 sm:mx-auto">
        <DialogHeader>
          <DialogTitle>Campaign Analytics</DialogTitle>
          <DialogDescription>{campaign.name}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Sent',      value: campaign.sent_count.toLocaleString(),  sub: 'emails delivered' },
            { label: 'Opened',    value: campaign.open_count.toLocaleString(),   sub: `${openRate}% open rate` },
            { label: 'Clicked',   value: campaign.click_count.toLocaleString(), sub: `${clickRate}% click rate` },
            { label: 'Sent Date', value: campaign.sent_at ? format(new Date(campaign.sent_at), 'MMM d, yyyy') : '—', sub: '' },
          ].map(s => (
            <div key={s.label} className="bg-muted/40 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              {s.sub && <p className="text-xs text-muted-foreground/60">{s.sub}</p>}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="w-full">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Composer View ─── */
function CampaignComposer({ campaign, onBack, onSaved }: { campaign: Campaign | null; onBack: () => void; onSaved: () => void }) {
  const isNew = !campaign;
  const [name, setName] = useState(campaign?.name ?? '');
  const [subject, setSubject] = useState(campaign?.subject ?? '');
  const [previewText, setPreviewText] = useState(campaign?.preview_text ?? '');
  const [fromName, setFromName] = useState(campaign?.from_name ?? '704 Collective Team');
  const [audience, setAudience] = useState(campaign?.audience?.type ?? 'all_active');
  const [blocks, setBlocks] = useState<Block[]>(campaign?.body_json ?? DEFAULT_BLOCKS);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'design' | 'settings'>('design');
  const [senderNames, setSenderNames] = useState<string[]>(['704 Collective Team']);
  const [sendingTest, setSendingTest] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [audienceCounts, setAudienceCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    supabase
      .from('profiles')
      .select('full_name')
      .in('role', ['admin', 'super_admin'])
      .not('full_name', 'is', null)
      .then(({ data }) => {
        const names = (data ?? [])
          .map((p: { full_name: string | null }) => p.full_name)
          .filter((n): n is string => !!n);
        setSenderNames(['704 Collective Team', ...names]);
      });
  }, []);

  useEffect(() => {
    async function fetchCounts() {
      const [activeQ, socialQ, businessQ, nonMemberQ, cancelledQ, guestsQ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('subscription_status', 'active').is('deleted_at', null),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('subscription_status', 'active').eq('member_type', 'social').is('deleted_at', null),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('subscription_status', 'active').eq('member_type', 'business').is('deleted_at', null),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('member_type', 'non_member').is('deleted_at', null),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('subscription_status', 'canceled').is('deleted_at', null),
        supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('contact_type', 'guest'),
      ]);
      setAudienceCounts({
        all_active: activeQ.count ?? 0,
        social: socialQ.count ?? 0,
        business: businessQ.count ?? 0,
        non_member: nonMemberQ.count ?? 0,
        all_contacts: (activeQ.count ?? 0) + (nonMemberQ.count ?? 0),
        cancelled: cancelledQ.count ?? 0,
        event_guests: guestsQ.count ?? 0,
      });
    }
    void fetchCounts();
  }, []);

  const addBlock = (type: BlockType) => {
    const newBlock: Block = { id: uid(), type, content: defaultContent(type) };
    const footerIdx = blocks.findIndex(b => b.type === 'footer');
    const insertAt = footerIdx >= 0 ? footerIdx : blocks.length;
    const next = [...blocks];
    next.splice(insertAt, 0, newBlock);
    setBlocks(next);
    setSelectedBlockId(newBlock.id);
  };

  const moveBlock = (from: number, to: number) => {
    if (to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setBlocks(next);
  };

  const deleteBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    if (selectedBlockId === id) setSelectedBlockId(null);
  };

  const updateBlock = (updated: Block) => {
    setBlocks(prev => prev.map(b => b.id === updated.id ? updated : b));
  };

  const handleSave = async (status: 'draft' | 'sending' = 'draft') => {
    if (!name.trim() || !subject.trim()) {
      toast.error('Campaign name and subject are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        subject: subject.trim(),
        preview_text: previewText || null,
        from_name: fromName,
        audience: { type: audience },
        body_json: blocks,
        status,
        updated_at: new Date().toISOString(),
        ...(status === 'sending' ? { sent_at: new Date().toISOString() } : {}),
      };

      if (isNew) {
        const { error } = await supabase.from('email_campaigns').insert({ ...payload, status: 'draft' });
        if (error) throw error;
        toast.success('Campaign saved as draft');
      } else {
        const { error } = await supabase.from('email_campaigns').update(payload).eq('id', campaign!.id);
        if (error) throw error;
        toast.success(status === 'sending' ? 'Campaign sent!' : 'Campaign saved');
      }
      onSaved();
      onBack();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-6">
      {/* Composer header */}
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{isNew ? 'New Campaign' : name}</h1>
            <p className="text-xs text-muted-foreground">{isNew ? 'Create a new email campaign' : 'Edit campaign'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTestDialog(true)}
            disabled={!campaign?.id}
            title={!campaign?.id ? 'Save your campaign as a draft first' : undefined}
            className="gap-2"
          >
            <Send className="w-4 h-4" /> Send Test
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleSave('draft')} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save Draft
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSchedule(true)} className="gap-2">
            <Clock className="w-4 h-4" /> Schedule
          </Button>
          <Button size="sm" onClick={() => { setSending(true); handleSave('sending'); }} disabled={saving || sending} className="gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send Now
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-6">
        {(['design', 'settings'] as const).map(tab => (
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
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'settings' ? (
        <div className="max-w-xl space-y-5">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Campaign Name <span className="text-red-400">*</span></Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. March Weekly Update" className="text-sm" />
            <p className="text-xs text-muted-foreground/60 mt-1">Internal name - not visible to recipients</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Subject Line <span className="text-red-400">*</span></Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. This Week at 704 Collective 🏙️" className="text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Preview Text</Label>
            <Input value={previewText} onChange={e => setPreviewText(e.target.value)} placeholder="Short preview shown in inbox…" className="text-sm" />
            <p className="text-xs text-muted-foreground/60 mt-1">Shown below the subject line in most email clients</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">From Name</Label>
            <Select value={fromName} onValueChange={setFromName}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {senderNames.map(n => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground/60 mt-1">
              This name replaces <code className="text-primary bg-primary/10 px-1 rounded text-[10px]">{"{{sender_name}}"}</code> tokens throughout the email
            </p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Audience</Label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AUDIENCE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    <span className="flex items-center justify-between gap-3 w-full">
                      <span>{o.label}</span>
                      {audienceCounts[o.value] !== undefined && (
                        <span className="text-xs text-muted-foreground ml-2">{audienceCounts[o.value]}</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {audienceCounts[audience] !== undefined && (
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                <Users className="w-3 h-3" />
                {audienceCounts[audience]} recipient{audienceCounts[audience] === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Block palette */}
          <div className="lg:w-48 shrink-0">
            <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Add Block</p>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
              {BLOCK_PALETTE.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addBlock(type)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left text-sm text-muted-foreground hover:text-foreground"
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs">{label}</span>
                </button>
              ))}
            </div>

            {/* Token reference */}
            <div className="mt-6 p-3 bg-muted/30 rounded-lg border border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Tokens</p>
              <div className="space-y-1.5">
                {EMAIL_TOKENS.map(t => (
                  <div key={t.value}>
                    <code className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded block">{t.value}</code>
                    <span className="text-[10px] text-muted-foreground/60">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 space-y-3">
            {(!name || !subject) && (
              <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-400">
                <span>⚠</span> Fill in campaign name and subject in the Settings tab before sending.
              </div>
            )}
            <div className="max-w-2xl mx-auto space-y-2">
              {blocks.map((block, index) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  index={index}
                  total={blocks.length}
                  onMove={moveBlock}
                  onDelete={deleteBlock}
                  onChange={updateBlock}
                  isSelected={selectedBlockId === block.id}
                  onSelect={setSelectedBlockId}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <ScheduleDialog open={showSchedule} onClose={() => setShowSchedule(false)} campaign={campaign} onScheduled={onSaved} />

      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>Send a test version of this campaign to an email address.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs text-muted-foreground">Send test to</Label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestDialog(false)}>Cancel</Button>
            <Button
              disabled={sendingTest || !testEmail}
              onClick={async () => {
                setSendingTest(true);
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-campaign`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${session?.access_token}`,
                      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                    },
                    body: JSON.stringify({ campaign_id: campaign?.id, test_email: testEmail }),
                  });
                  if (res.ok) {
                    toast.success(`Test sent to ${testEmail}`);
                    setShowTestDialog(false);
                  } else {
                    const errBody = await res.json().catch(() => ({}));
                    console.error('[Send Test] HTTP', res.status, errBody);
                    toast.error(errBody.error || 'Failed to send test email');
                  }
                } catch (err) {
                  console.error('[Send Test] fetch threw:', err);
                  toast.error('Failed to send test email');
                } finally {
                  setSendingTest(false);
                }
              }}
            >
              {sendingTest ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Send Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Main List View ─── */
export default function CrmCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [composing, setComposing] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  const [deleteCampaign, setDeleteCampaign] = useState<Campaign | null>(null);
  const [analyticsCampaign, setAnalyticsCampaign] = useState<Campaign | null>(null);
  const [scheduleCampaign, setScheduleCampaign] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('email_campaigns').select('*').order('created_at', { ascending: false });
      if (search) query = query.ilike('name', `%${search}%`);
      const { data, error } = await query;
      if (error) throw error;
      setCampaigns(data ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const handleDuplicate = async (c: Campaign) => {
    try {
      const { error } = await supabase.from('email_campaigns').insert({
        name: `${c.name} (Copy)`,
        subject: c.subject,
        preview_text: c.preview_text,
        from_name: c.from_name,
        audience: c.audience,
        body_json: c.body_json,
        body_html: c.body_html,
        status: 'draft',
      });
      if (error) throw error;
      toast.success('Campaign duplicated');
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to duplicate');
    }
  };

  const handleDelete = async () => {
    if (!deleteCampaign) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('email_campaigns').delete().eq('id', deleteCampaign.id);
      if (error) throw error;
      toast.success('Campaign deleted');
      setDeleteCampaign(null);
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  if (composing || editCampaign) {
    return (
      <CampaignComposer
        campaign={editCampaign}
        onBack={() => { setComposing(false); setEditCampaign(null); }}
        onSaved={load}
      />
    );
  }

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}</p>
        </div>
        <Button size="sm" onClick={() => setComposing(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New Campaign
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search campaigns…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        {search && (
          <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Table — desktop */}
      <div className="hidden sm:block bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto min-w-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">From</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Audience</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Sent</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Open %</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Click %</th>
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-full" /></td>
                  ))}
                </tr>
              ))
            ) : campaigns.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center">
                  <p className="text-muted-foreground text-sm mb-3">No campaigns yet</p>
                  <Button size="sm" onClick={() => setComposing(true)} className="gap-2">
                    <Plus className="w-4 h-4" /> Create your first campaign
                  </Button>
                </td>
              </tr>
            ) : (
              campaigns.map(c => {
                const openRate  = c.sent_count > 0 ? Math.round((c.open_count  / c.sent_count) * 100) : null;
                const clickRate = c.sent_count > 0 ? Math.round((c.click_count / c.sent_count) * 100) : null;
                const date = c.sent_at ?? c.scheduled_for ?? c.created_at;
                const audienceLabel = AUDIENCE_OPTIONS.find(a => a.value === c.audience?.type)?.label ?? c.audience?.type ?? '—';

                return (
                  <tr key={c.id} className="border-b border-border hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setEditCampaign(c)}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-xs">{c.subject}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLES[c.status] ?? ''}`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.from_name ?? '704 Collective Team'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Users className="w-3 h-3" />{audienceLabel}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{date ? format(new Date(date), 'MMM d, yyyy') : '—'}</td>
                    <td className="px-4 py-3 text-right text-sm text-foreground">{c.sent_count > 0 ? c.sent_count.toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      {openRate !== null ? <span className="text-emerald-400 font-medium">{openRate}%</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      {clickRate !== null ? <span className="text-blue-400 font-medium">{clickRate}%</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Open campaign actions menu"><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => setEditCampaign(c)} className="text-sm">Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(c)} className="gap-2 text-sm"><Copy className="w-4 h-4" /> Duplicate</DropdownMenuItem>
                          {c.status === 'draft' && <DropdownMenuItem onClick={() => setScheduleCampaign(c)} className="gap-2 text-sm"><Clock className="w-4 h-4" /> Schedule</DropdownMenuItem>}
                          {c.status === 'sent' && <DropdownMenuItem onClick={() => setAnalyticsCampaign(c)} className="gap-2 text-sm"><BarChart2 className="w-4 h-4" /> Analytics</DropdownMenuItem>}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDeleteCampaign(c)} className="gap-2 text-sm text-red-400 focus:text-red-400"><Trash2 className="w-4 h-4" /> Delete</DropdownMenuItem>
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
      </div>

      {/* Cards — mobile */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-sm mb-3">No campaigns yet</p>
            <Button size="sm" onClick={() => setComposing(true)} className="gap-2"><Plus className="w-4 h-4" /> Create your first campaign</Button>
          </div>
        ) : (
          campaigns.map(c => {
            const openRate = c.sent_count > 0 ? Math.round((c.open_count / c.sent_count) * 100) : null;
            const date = c.sent_at ?? c.scheduled_for ?? c.created_at;
            return (
              <div key={c.id} className="bg-card border border-border rounded-xl p-4 cursor-pointer" onClick={() => setEditCampaign(c)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.subject}</p>
                    {c.from_name && <p className="text-xs text-muted-foreground/60 mt-0.5">From: {c.from_name}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize shrink-0 ${STATUS_STYLES[c.status] ?? ''}`}>{c.status}</span>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  {date && <span>{format(new Date(date), 'MMM d, yyyy')}</span>}
                  {c.sent_count > 0 && <span>{c.sent_count.toLocaleString()} sent</span>}
                  {openRate !== null && <span className="text-emerald-400">{openRate}% open</span>}
                </div>
              </div>
            );
          })
        )}
      </div>

      <AnalyticsDialog open={!!analyticsCampaign} onClose={() => setAnalyticsCampaign(null)} campaign={analyticsCampaign} />
      <ScheduleDialog open={!!scheduleCampaign} onClose={() => setScheduleCampaign(null)} campaign={scheduleCampaign} onScheduled={load} />

      <Dialog open={!!deleteCampaign} onOpenChange={() => setDeleteCampaign(null)}>
        <DialogContent className="w-full max-w-sm mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>Delete Campaign</DialogTitle>
            <DialogDescription>Permanently delete "{deleteCampaign?.name}"? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setDeleteCampaign(null)} className="w-full sm:w-auto">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="w-full sm:w-auto">{deleting ? 'Deleting…' : 'Delete'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}