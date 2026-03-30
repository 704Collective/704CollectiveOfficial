'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { PlatformIcon, platformLabel } from '@/components/social/PlatformIcons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

interface ContactRow {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  social_handles?: Record<string, string> | null;
}

const PLAT_KEYS = ['instagram', 'linkedin', 'twitter', 'facebook', 'tiktok'] as const;

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [contact, setContact] = useState<ContactRow | null>(null);
  const [mentions, setMentions] = useState<Record<string, unknown>[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [plat, setPlat] = useState('instagram');
  const [handle, setHandle] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('contacts').select('*').eq('id', id).single();
      if (error || !data) {
        toast.error('Contact not found');
        return;
      }
      setContact(data as ContactRow);
      const { data: inbox } = await supabase
        .from('social_inbox_messages')
        .select('*')
        .eq('contact_id', id)
        .order('received_at', { ascending: false })
        .limit(10);
      setMentions(inbox ?? []);
    })();
  }, [id]);

  const saveHandle = async () => {
    if (!contact) return;
    const next = { ...(contact.social_handles ?? {}), [plat]: handle.trim() };
    const { error } = await supabase.from('contacts').update({ social_handles: next }).eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setContact({ ...contact, social_handles: next });
    toast.success('Social handle saved');
    setLinkOpen(false);
    setHandle('');
  };

  if (!contact) {
    return (
      <div className="p-6 text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  const handles = contact.social_handles ?? {};

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="gap-2">
          <Link href="/admin/crm/contacts">
            <ArrowLeft className="h-4 w-4" /> Contacts
          </Link>
        </Button>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4 border border-border rounded-xl p-6 bg-card">
          <h1 className="text-2xl font-semibold text-foreground">{contact.full_name ?? contact.email}</h1>
          <p className="text-sm text-muted-foreground">{contact.email}</p>
          {contact.company && <p className="text-sm text-muted-foreground">{contact.company}</p>}
          {contact.phone && <p className="text-sm text-muted-foreground">{contact.phone}</p>}
        </div>

        <aside className="space-y-4 border border-border rounded-xl p-4 bg-card h-fit">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Social</h2>
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setLinkOpen(true)}>
              Link profile
            </Button>
          </div>
          <div className="space-y-2">
            {PLAT_KEYS.map(p => {
              const h = handles[p];
              if (!h) return null;
              return (
                <div key={p} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <PlatformIcon platform={p} className="h-4 w-4" />
                  <span className="text-foreground">{platformLabel(p)}:</span> {h}
                </div>
              );
            })}
            {!Object.keys(handles).length && (
              <p className="text-xs text-muted-foreground">No social profiles linked yet.</p>
            )}
          </div>

          <div className="border-t border-border pt-4 mt-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Recent mentions</h3>
            {mentions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No inbox threads linked to this contact.</p>
            ) : (
              <ul className="space-y-2">
                {mentions.map(m => (
                  <li key={m.id as string} className="text-xs border border-border rounded-md p-2 bg-muted/20">
                    <span className="text-muted-foreground">{m.author_name as string}</span>
                    <p className="text-foreground mt-1 line-clamp-2">{m.content as string}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle>Link social profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-muted-foreground">Platform</Label>
            <select
              value={plat}
              onChange={e => setPlat(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              {PLAT_KEYS.map(p => (
                <option key={p} value={p}>
                  {platformLabel(p)}
                </option>
              ))}
            </select>
            <Label className="text-muted-foreground">Handle or URL</Label>
            <Input value={handle} onChange={e => setHandle(e.target.value)} placeholder="@username" className="border-border bg-background" />
          </div>
          <DialogFooter>
            <Button type="button" className="btn-primary" onClick={saveHandle}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
