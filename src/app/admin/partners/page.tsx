'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { AdminLayout } from '@/components/AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  approvePartnerApplication,
  denyPartnerApplication,
  markPartnerApplicationReviewing,
  togglePartnerFeatured,
  removePartner,
  revokePartnerInvite,
  createPartnerInvite,
  ensureAdminDirectConversation,
  postAdminInboxMessage,
  postAdminInquiryReply,
} from '@/app/actions/adminPartnerActions';
import { Loader2, Mail, Star } from 'lucide-react';

type AppRow = {
  id: string;
  user_id: string;
  company_name: string;
  website: string | null;
  phone: string;
  description: string;
  logo_url: string | null;
  photo_urls: string[];
  partner_types: string[];
  status: string;
  applied_at: string;
  denial_reason: string | null;
  profiles: { email: string; full_name: string | null } | null;
};

type PartnerRow = {
  id: string;
  email: string;
  full_name: string | null;
  partner_types: string[] | null;
  is_featured_partner: boolean;
  partner_listings: { company_name: string; id: string; is_featured: boolean } | null;
};

type InviteRow = {
  id: string;
  email: string | null;
  unique_token: string;
  used: boolean;
  revoked: boolean;
  created_at: string;
  created_by: string;
  creator?: { full_name: string | null } | null;
};

type InquiryAdminRow = {
  id: string;
  inquiry_type: string;
  status: string;
  created_at: string;
  partner_id: string;
  event_id: string | null;
  events: { title: string } | null;
  partner_company: string | null;
};

export default function AdminPartnersPage() {
  const router = useRouter();
  const { isAdmin, loading, profile } = useAuth();
  usePageTitle('Partners');

  const [tab, setTab] = useState('applications');
  const [apps, setApps] = useState<AppRow[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [inquiries, setInquiries] = useState<InquiryAdminRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [selectedApp, setSelectedApp] = useState<AppRow | null>(null);
  const [denyOpen, setDenyOpen] = useState(false);
  const [denyReason, setDenyReason] = useState('');
  const [denySubmitting, setDenySubmitting] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgBody, setMsgBody] = useState('');
  const [msgSending, setMsgSending] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);

  const [inqThread, setInqThread] = useState<InquiryAdminRow | null>(null);
  const [inqMsgs, setInqMsgs] = useState<{ id: string; content: string; created_at: string; sender_id: string }[]>([]);
  const [inqReply, setInqReply] = useState('');
  const [listingView, setListingView] = useState<PartnerRow | null>(null);
  const [listingDetail, setListingDetail] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoadingData(true);
    const [a, p, i, qRes] = await Promise.all([
      supabase
        .from('partner_applications')
        .select(
          'id, user_id, company_name, website, phone, description, logo_url, photo_urls, partner_types, status, applied_at, denial_reason, profiles!partner_applications_user_id_fkey(email, full_name)'
        )
        .order('applied_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, email, full_name, partner_types, is_featured_partner, partner_listings(company_name, id, is_featured)')
        .eq('member_type', 'partner')
        .eq('partner_status', 'approved')
        .is('deleted_at', null),
      supabase
        .from('partner_invites')
        .select('id, email, unique_token, used, revoked, created_at, created_by')
        .order('created_at', { ascending: false }),
      supabase
        .from('event_inquiries')
        .select('id, inquiry_type, status, created_at, partner_id, event_id, events(title)')
        .order('created_at', { ascending: false }),
    ]);

    const appRows = (a.data ?? []) as unknown as AppRow[];
    setApps(
      appRows.map((row) => ({
        ...row,
        profiles: Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles,
      }))
    );
    const rawPartners = (p.data ?? []) as {
      id: string;
      email: string;
      full_name: string | null;
      partner_types: string[] | null;
      is_featured_partner: boolean;
      partner_listings: { company_name: string; id: string; is_featured: boolean } | { company_name: string; id: string; is_featured: boolean }[] | null;
    }[];
    setPartners(
      rawPartners.map((row) => ({
        ...row,
        partner_listings: Array.isArray(row.partner_listings)
          ? row.partner_listings[0] ?? null
          : row.partner_listings,
      })) as PartnerRow[]
    );
    const inv = (i.data ?? []) as InviteRow[];
    const creators = [...new Set(inv.map((x) => x.created_by))];
    let creatorMap: Record<string, string> = {};
    if (creators.length) {
      const { data: cr } = await supabase.from('profiles').select('id, full_name').in('id', creators);
      creatorMap = Object.fromEntries((cr ?? []).map((c) => [c.id, c.full_name ?? '']));
    }
    setInvites(inv.map((r) => ({ ...r, creator: { full_name: creatorMap[r.created_by] ?? null } })));

    const qrows = (qRes.data ?? []) as {
      id: string;
      inquiry_type: string;
      status: string;
      created_at: string;
      partner_id: string;
      event_id: string | null;
      events: { title: string } | { title: string }[] | null;
    }[];
    const partnerIds = [...new Set(qrows.map((r) => r.partner_id))];
    let lmap: Record<string, string> = {};
    if (partnerIds.length) {
      const { data: listings } = await supabase
        .from('partner_listings')
        .select('user_id, company_name')
        .in('user_id', partnerIds);
      lmap = Object.fromEntries((listings ?? []).map((l) => [l.user_id, l.company_name]));
    }
    setInquiries(
      qrows.map((row) => ({
        id: row.id,
        inquiry_type: row.inquiry_type,
        status: row.status,
        created_at: row.created_at,
        partner_id: row.partner_id,
        event_id: row.event_id,
        events: Array.isArray(row.events) ? row.events[0] ?? null : row.events,
        partner_company: lmap[row.partner_id] ?? null,
      }))
    );
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (!loading && (!isAdmin)) router.replace('/admin/login');
  }, [loading, isAdmin, router]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  async function openListing(p: PartnerRow) {
    setListingView(p);
    const { data } = await supabase.from('partner_listings').select('*').eq('user_id', p.id).maybeSingle();
    setListingDetail(data);
  }

  async function openInqThread(row: InquiryAdminRow) {
    setInqThread(row);
    const { data } = await supabase
      .from('event_inquiry_messages')
      .select('id, content, created_at, sender_id')
      .eq('inquiry_id', row.id)
      .order('created_at', { ascending: true });
    setInqMsgs(data ?? []);
    setInqReply('');
  }

  async function sendInqReply() {
    if (!inqThread || !inqReply.trim()) return;
    const res = await postAdminInquiryReply(inqThread.id, inqReply.trim());
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success('Sent');
    setInqReply('');
    const { data } = await supabase
      .from('event_inquiry_messages')
      .select('id, content, created_at, sender_id')
      .eq('inquiry_id', inqThread.id)
      .order('created_at', { ascending: true });
    setInqMsgs(data ?? []);
  }

  async function sendAppMessage() {
    if (!selectedApp || !msgBody.trim()) return;
    setMsgSending(true);
    const conv = await ensureAdminDirectConversation(selectedApp.user_id);
    if (!conv.ok) {
      toast.error(conv.error);
      setMsgSending(false);
      return;
    }
    const post = await postAdminInboxMessage(conv.conversationId, msgBody.trim(), [], [], []);
    setMsgSending(false);
    if (!post.ok) {
      toast.error(post.error);
      return;
    }
    toast.success('Message sent');
    setMsgBody('');
    setMsgOpen(false);
  }

  if (loading || !isAdmin) {
    return (
      <AdminLayout title="">
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Partners">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="active">Active Partners</TabsTrigger>
          <TabsTrigger value="invites">Invites</TabsTrigger>
          <TabsTrigger value="inquiries">Inquiries</TabsTrigger>
        </TabsList>

        <TabsContent value="applications" className="mt-6">
          {loadingData ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Types</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelectedApp(r)}>
                    <TableCell className="font-medium">{r.company_name}</TableCell>
                    <TableCell>{r.profiles?.email ?? '—'}</TableCell>
                    <TableCell>{(r.partner_types ?? []).join(', ')}</TableCell>
                    <TableCell>{format(new Date(r.applied_at), 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="active" className="mt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Types</TableHead>
                <TableHead>Featured</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.partner_listings?.company_name ?? r.full_name ?? r.email}</TableCell>
                  <TableCell>{(r.partner_types ?? []).join(', ')}</TableCell>
                  <TableCell>{r.is_featured_partner ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> : '—'}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => openListing(r)}>
                      View listing
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        const res = await togglePartnerFeatured(r.id, !r.is_featured_partner);
                        if (!res.ok) toast.error(res.error);
                        else {
                          toast.success('Updated');
                          load();
                        }
                      }}
                    >
                      Toggle featured
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        if (!confirm('Remove partner access?')) return;
                        const res = await removePartner(r.id);
                        if (!res.ok) toast.error(res.error);
                        else {
                          toast.success('Partner removed');
                          load();
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="invites" className="mt-6 space-y-4">
          <Button onClick={() => setInviteModal(true)}>Create invite</Button>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email / Link</TableHead>
                <TableHead>Created by</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Used</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.email?.trim() || 'Generic link'}</TableCell>
                  <TableCell>{r.creator?.full_name ?? r.created_by}</TableCell>
                  <TableCell>{format(new Date(r.created_at), 'MMM d, yyyy')}</TableCell>
                  <TableCell>{r.used ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={r.revoked || r.used}
                      onClick={async () => {
                        const res = await revokePartnerInvite(r.id);
                        if (!res.ok) toast.error(res.error);
                        else {
                          toast.success('Revoked');
                          load();
                        }
                      }}
                    >
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="inquiries" className="mt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {inquiries.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.partner_company ?? r.partner_id}</TableCell>
                  <TableCell>{r.inquiry_type}</TableCell>
                  <TableCell>{r.events?.title ?? 'New Event Suggestion'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => openInqThread(r)}>
                      View thread
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      <Sheet open={!!selectedApp} onOpenChange={(o) => !o && setSelectedApp(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedApp && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedApp.company_name}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                {selectedApp.logo_url && (
                  <div className="relative w-32 h-32 rounded-lg overflow-hidden border">
                    <Image src={selectedApp.logo_url} alt="" fill className="object-cover" unoptimized />
                  </div>
                )}
                <p>
                  <span className="text-muted-foreground">Email:</span> {selectedApp.profiles?.email}
                </p>
                <p>
                  <span className="text-muted-foreground">Phone:</span> {selectedApp.phone}
                </p>
                <p>
                  <span className="text-muted-foreground">Website:</span> {selectedApp.website ?? '—'}
                </p>
                <p className="whitespace-pre-wrap">{selectedApp.description}</p>
                <div className="flex flex-wrap gap-2">
                  {selectedApp.partner_types.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 pt-4">
                  <Button
                    onClick={async () => {
                      const res = await approvePartnerApplication(selectedApp.id);
                      if (!res.ok) toast.error(res.error);
                      else {
                        toast.success('Approved');
                        setSelectedApp(null);
                        load();
                      }
                    }}
                  >
                    Approve
                  </Button>
                  <Button variant="destructive" onClick={() => setDenyOpen(true)}>
                    Deny
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      const res = await markPartnerApplicationReviewing(selectedApp.id);
                      if (!res.ok) toast.error(res.error);
                      else {
                        toast.success('Marked reviewing');
                        load();
                      }
                    }}
                  >
                    Mark reviewing
                  </Button>
                  <Button variant="outline" onClick={() => setMsgOpen(true)}>
                    <Mail className="w-4 h-4 mr-2" />
                    Message
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(selectedApp.photo_urls ?? []).map((url) => (
                    <div key={url} className="relative aspect-square rounded border overflow-hidden">
                      <Image src={url} alt="" fill className="object-cover" unoptimized />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={denyOpen} onOpenChange={setDenyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny application</DialogTitle>
          </DialogHeader>
          <Textarea value={denyReason} onChange={(e) => setDenyReason(e.target.value)} placeholder="Reason (emailed to applicant)" />
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={denySubmitting}
              onClick={async () => {
                if (!selectedApp) return;
                setDenySubmitting(true);
                const res = await denyPartnerApplication(selectedApp.id, denyReason);
                setDenySubmitting(false);
                if (!res.ok) toast.error(res.error);
                else {
                  toast.success('Denied and account removed');
                  setDenyOpen(false);
                  setSelectedApp(null);
                  load();
                }
              }}
            >
              Confirm deny
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Message applicant</DialogTitle>
          </DialogHeader>
          <Textarea value={msgBody} onChange={(e) => setMsgBody(e.target.value)} rows={5} />
          <DialogFooter>
            <Button disabled={msgSending} onClick={sendAppMessage}>
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteModal} onOpenChange={setInviteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create partner invite</DialogTitle>
          </DialogHeader>
          <Label>Optional email (leave blank for generic link)</Label>
          <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          <DialogFooter>
            <Button
              disabled={inviteBusy}
              onClick={async () => {
                setInviteBusy(true);
                const res = await createPartnerInvite(inviteEmail.trim() || null);
                setInviteBusy(false);
                if (!res.ok) toast.error(res.error);
                else {
                  await navigator.clipboard.writeText(res.url);
                  toast.success('Invite URL copied');
                  setInviteModal(false);
                  setInviteEmail('');
                  load();
                }
              }}
            >
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!inqThread} onOpenChange={(o) => !o && setInqThread(null)}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col">
          {inqThread && (
            <>
              <SheetHeader>
                <SheetTitle>Inquiry thread</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto space-y-2 mt-4">
                {inqMsgs.map((m) => (
                  <div key={m.id} className="rounded-lg border p-2 text-sm">
                    <p className="text-xs text-muted-foreground">{format(new Date(m.created_at), 'PPp')}</p>
                    <p className="whitespace-pre-wrap mt-1">{m.content}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4 pt-4 border-t">
                <Textarea value={inqReply} onChange={(e) => setInqReply(e.target.value)} className="min-h-[72px]" />
                <Button onClick={sendInqReply}>Reply</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!listingView} onOpenChange={(o) => !o && setListingView(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Partner listing</SheetTitle>
          </SheetHeader>
          <pre className="mt-4 text-xs overflow-auto max-h-[70vh] whitespace-pre-wrap">
            {listingDetail ? JSON.stringify(listingDetail, null, 2) : 'No listing row'}
          </pre>
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
