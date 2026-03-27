'use client';

import { useState, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Linkedin,
  Globe,
  Phone,
  Mail,
  Download,
  Link,
  Pencil,
  Plus,
  Loader2,
  CreditCard,
  X,
} from 'lucide-react';
function generatePublicId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map((b) => chars[b % chars.length])
    .join('');
}

export interface BusinessCardData {
  id: string;
  user_id: string;
  public_id: string;
  full_name: string | null;
  title: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  avatar_url: string | null;
  custom_fields: Record<string, string> | null;
}

interface Props {
  userId: string;
  card: BusinessCardData | null;
  isOwner: boolean;
  onCardUpdated: () => void;
}

function memberDisplayName(fullName: string | null | undefined): string {
  const t = fullName?.trim();
  return t && t.length > 0 ? t : 'Member';
}

function initialsFromFullName(fullName: string | null | undefined): string {
  const t = fullName?.trim();
  if (!t) return 'M';
  const parts = t.split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return 'M';
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .filter(Boolean)
    .join('')
    .toUpperCase() || 'M';
}

// ── The visual card ────────────────────────────────────────────────────────

function CardDisplay({ card, className = '' }: { card: BusinessCardData; className?: string }) {
  return (
    <div
      id="business-card-printable"
      className={`relative bg-gradient-to-br from-[#1A1A1A] via-[#242424] to-[#1A1A1A] border border-[#D4A853]/30 rounded-2xl p-6 overflow-hidden shadow-2xl ${className}`}
    >
      {/* Gold accent lines */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#D4A853]/60 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#D4A853]/30 to-transparent" />
      <div className="absolute top-0 bottom-0 left-0 w-px bg-gradient-to-b from-transparent via-[#D4A853]/20 to-transparent" />

      {/* 704 watermark */}
      <span className="absolute top-4 right-4 text-[#D4A853]/8 font-black text-5xl select-none pointer-events-none leading-none">
        704
      </span>

      <div className="flex items-start gap-4 relative">
        <Avatar className="h-16 w-16 ring-2 ring-[#D4A853]/30 shrink-0">
          <AvatarImage src={card.avatar_url ?? undefined} alt={memberDisplayName(card.full_name)} />
          <AvatarFallback className="bg-[#2E2E2E] text-[#D4A853] text-xl">
            {initialsFromFullName(card.full_name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 pt-1">
          <h3 className="text-lg font-bold text-white leading-tight">{memberDisplayName(card.full_name)}</h3>
          {card.title && (
            <p className="text-sm text-[#D4A853] font-medium mt-0.5 leading-tight">{card.title}</p>
          )}
          {card.company && (
            <p className="text-sm text-white/60 mt-0.5 leading-tight">{card.company}</p>
          )}
        </div>
      </div>

      {/* Contact details */}
      <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {card.email && (
          <ContactItem icon={<Mail className="h-3.5 w-3.5" />} value={card.email} href={`mailto:${card.email}`} />
        )}
        {card.phone && (
          <ContactItem icon={<Phone className="h-3.5 w-3.5" />} value={card.phone} href={`tel:${card.phone}`} />
        )}
        {card.linkedin_url && (
          <ContactItem icon={<Linkedin className="h-3.5 w-3.5" />} value="LinkedIn" href={card.linkedin_url} external />
        )}
        {card.website_url && (
          <ContactItem
            icon={<Globe className="h-3.5 w-3.5" />}
            value={card.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            href={card.website_url}
            external
          />
        )}
        {Object.entries(card.custom_fields ?? {}).map(([k, v]) => (
          <ContactItem key={k} icon={<CreditCard className="h-3.5 w-3.5" />} value={`${k}: ${v}`} />
        ))}
      </div>

      {/* 704 Collective branding */}
      <div className="mt-4 flex items-center gap-1.5">
        <div className="h-px flex-1 bg-[#D4A853]/20" />
        <span className="text-[9px] text-[#D4A853]/50 font-semibold tracking-widest uppercase">
          704 Collective
        </span>
        <div className="h-px flex-1 bg-[#D4A853]/20" />
      </div>
    </div>
  );
}

function ContactItem({
  icon,
  value,
  href,
  external,
}: {
  icon: React.ReactNode;
  value: string;
  href?: string;
  external?: boolean;
}) {
  const inner = (
    <span className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white/90 transition-colors truncate">
      <span className="text-[#D4A853]/70 shrink-0">{icon}</span>
      <span className="truncate">{value}</span>
    </span>
  );
  if (href) {
    return (
      <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>
        {inner}
      </a>
    );
  }
  return <div>{inner}</div>;
}

// ── Edit modal ─────────────────────────────────────────────────────────────

interface EditModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  existing: BusinessCardData | null;
  onSaved: (card: BusinessCardData) => void;
}

function EditModal({ open, onClose, userId, existing, onSaved }: EditModalProps) {
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState({
    full_name: existing?.full_name ?? '',
    title: existing?.title ?? '',
    company: existing?.company ?? '',
    phone: existing?.phone ?? '',
    email: existing?.email ?? '',
    linkedin_url: existing?.linkedin_url ?? '',
    website_url: existing?.website_url ?? '',
    avatar_url: existing?.avatar_url ?? '',
  });
  const [customFields, setCustomFields] = useState<{ key: string; value: string }[]>(
    Object.entries(existing?.custom_fields ?? {}).map(([key, value]) => ({ key, value: String(value) }))
  );

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((prev) => ({ ...prev, [k]: e.target.value }));

  const addCustomField = () =>
    setCustomFields((prev) => [...prev, { key: '', value: '' }]);

  const removeCustomField = (i: number) =>
    setCustomFields((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!fields.full_name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const customFieldsMap = Object.fromEntries(
        customFields.filter((f) => f.key.trim()).map((f) => [f.key.trim(), f.value])
      );

      const payload = {
        user_id: userId,
        public_id: existing?.public_id ?? generatePublicId(),
        full_name: fields.full_name.trim(),
        title: fields.title.trim() || null,
        company: fields.company.trim() || null,
        phone: fields.phone.trim() || null,
        email: fields.email.trim() || null,
        linkedin_url: fields.linkedin_url.trim() || null,
        website_url: fields.website_url.trim() || null,
        avatar_url: fields.avatar_url.trim() || null,
        custom_fields: Object.keys(customFieldsMap).length ? customFieldsMap : null,
        updated_at: new Date().toISOString(),
      };

      let result: BusinessCardData | null = null;
      if (existing) {
        const { data } = await supabase
          .from('business_cards')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single();
        result = data as BusinessCardData;
      } else {
        const { data } = await supabase
          .from('business_cards')
          .insert(payload)
          .select()
          .single();
        result = data as BusinessCardData;
      }

      if (result) {
        toast.success('Business card saved');
        onSaved(result);
        onClose();
      }
    } catch {
      toast.error('Failed to save business card');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1A1A1A] border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">
            {existing ? 'Edit Business Card' : 'Create Business Card'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-white/70 text-xs">Full Name *</Label>
              <Input value={fields.full_name} onChange={set('full_name')} className="mt-1 bg-[#2E2E2E] border-white/10 text-white" />
            </div>
            <div>
              <Label className="text-white/70 text-xs">Title</Label>
              <Input value={fields.title} onChange={set('title')} className="mt-1 bg-[#2E2E2E] border-white/10 text-white" />
            </div>
            <div>
              <Label className="text-white/70 text-xs">Company</Label>
              <Input value={fields.company} onChange={set('company')} className="mt-1 bg-[#2E2E2E] border-white/10 text-white" />
            </div>
            <div>
              <Label className="text-white/70 text-xs">Phone</Label>
              <Input value={fields.phone} onChange={set('phone')} className="mt-1 bg-[#2E2E2E] border-white/10 text-white" />
            </div>
            <div>
              <Label className="text-white/70 text-xs">Email</Label>
              <Input value={fields.email} onChange={set('email')} type="email" className="mt-1 bg-[#2E2E2E] border-white/10 text-white" />
            </div>
            <div className="col-span-2">
              <Label className="text-white/70 text-xs">LinkedIn URL</Label>
              <Input value={fields.linkedin_url} onChange={set('linkedin_url')} className="mt-1 bg-[#2E2E2E] border-white/10 text-white" placeholder="https://linkedin.com/in/…" />
            </div>
            <div className="col-span-2">
              <Label className="text-white/70 text-xs">Website URL</Label>
              <Input value={fields.website_url} onChange={set('website_url')} className="mt-1 bg-[#2E2E2E] border-white/10 text-white" placeholder="https://…" />
            </div>
            <div className="col-span-2">
              <Label className="text-white/70 text-xs">Avatar URL</Label>
              <Input value={fields.avatar_url} onChange={set('avatar_url')} className="mt-1 bg-[#2E2E2E] border-white/10 text-white" placeholder="https://…" />
            </div>
          </div>

          {/* Custom fields */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-white/70 text-xs">Custom Fields</Label>
              <button onClick={addCustomField} className="text-xs text-[#D4A853] hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add Field
              </button>
            </div>
            <div className="space-y-2">
              {customFields.map((cf, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    value={cf.key}
                    onChange={(e) => setCustomFields((prev) => prev.map((f, idx) => idx === i ? { ...f, key: e.target.value } : f))}
                    placeholder="Label"
                    className="bg-[#2E2E2E] border-white/10 text-white text-sm"
                  />
                  <Input
                    value={cf.value}
                    onChange={(e) => setCustomFields((prev) => prev.map((f, idx) => idx === i ? { ...f, value: e.target.value } : f))}
                    placeholder="Value"
                    className="bg-[#2E2E2E] border-white/10 text-white text-sm"
                  />
                  <button onClick={() => removeCustomField(i)} className="text-white/40 hover:text-white/70 shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <Button
            onClick={save}
            disabled={saving}
            className="w-full bg-[#D4A853] hover:bg-[#B8923F] text-[#1A1A1A] font-semibold"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? 'Save Changes' : 'Create Card'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main exported component ────────────────────────────────────────────────

export function BusinessCard({ userId, card: initialCard, isOwner, onCardUpdated }: Props) {
  const [card, setCard] = useState<BusinessCardData | null>(initialCard);
  const [editOpen, setEditOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        body > * { display: none !important; }
        #business-card-print-wrapper { display: block !important; position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: #1A1A1A; }
      }
    `;
    document.head.appendChild(style);
    const wrapper = document.createElement('div');
    wrapper.id = 'business-card-print-wrapper';
    wrapper.style.display = 'none';
    if (cardRef.current) {
      wrapper.innerHTML = cardRef.current.outerHTML;
    }
    document.body.appendChild(wrapper);
    window.print();
    document.head.removeChild(style);
    document.body.removeChild(wrapper);
  };

  const handleCopyLink = () => {
    if (!card) return;
    const url = `https://704collective.com/card/${card.public_id}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success('Public card link copied'),
      () => toast.error('Failed to copy link')
    );
  };

  const handleCardSaved = (updated: BusinessCardData) => {
    setCard(updated);
    onCardUpdated();
  };

  if (!card) {
    if (!isOwner) return null;
    return (
      <div className="bg-[#2E2E2E] border border-dashed border-white/20 rounded-2xl p-8 flex flex-col items-center gap-4">
        <CreditCard className="h-10 w-10 text-white/20" />
        <div className="text-center">
          <p className="text-white/60 text-sm">No business card yet</p>
          <p className="text-white/30 text-xs mt-1">Create a digital card to share your contact info</p>
        </div>
        <Button
          onClick={() => setEditOpen(true)}
          className="bg-[#D4A853] hover:bg-[#B8923F] text-[#1A1A1A] font-semibold gap-2"
        >
          <Plus className="h-4 w-4" /> Create Card
        </Button>
        <EditModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          userId={userId}
          existing={null}
          onSaved={handleCardSaved}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Business Card</h2>
        {isOwner && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            className="border-white/10 text-white/70 hover:text-white hover:border-white/30 bg-transparent gap-1.5 text-xs"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit Card
          </Button>
        )}
      </div>

      <div ref={cardRef}>
        <CardDisplay card={card} className="max-w-lg" />
      </div>

      <div className="flex gap-2 max-w-lg">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrint}
          className="flex-1 border-white/10 text-white/70 hover:text-white hover:border-white/30 bg-transparent gap-1.5 text-xs"
        >
          <Download className="h-3.5 w-3.5" /> Download PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyLink}
          className="flex-1 border-white/10 text-white/70 hover:text-white hover:border-white/30 bg-transparent gap-1.5 text-xs"
        >
          <Link className="h-3.5 w-3.5" /> Copy Public Link
        </Button>
      </div>

      {isOwner && (
        <EditModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          userId={userId}
          existing={card}
          onSaved={handleCardSaved}
        />
      )}
    </div>
  );
}

// Re-export CardDisplay for use in the public page
export { CardDisplay };
