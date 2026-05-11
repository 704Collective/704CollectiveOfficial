'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ArrowLeft, Search, CheckCircle2, XCircle, Clock, Eye,
  ChevronLeft, ChevronRight, Building2, Linkedin, Globe, Phone, Mail,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface Application {
  id: string;
  created_at: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  title: string | null;
  linkedin_url: string | null;
  website: string | null;
  referral_source: string | null;
  why_join: string | null;
  what_bring: string | null;
  goals: string | null;
  industry: string | null;
  years_in_charlotte: number | null;
  billing_plan: string;
  status: 'pending' | 'reviewing' | 'approved' | 'denied' | 'waitlisted';
  admin_notes: string | null;
  card_saved: boolean;
  stripe_customer_id: string | null;
}

type StatusFilter = 'all' | 'pending' | 'reviewing' | 'approved' | 'denied' | 'waitlisted';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Pending',    color: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' },
  reviewing:  { label: 'Reviewing',  color: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' },
  approved:   { label: 'Approved',   color: 'bg-green-500/20 text-green-400 border border-green-500/30' },
  denied:     { label: 'Denied',     color: 'bg-destructive/20 text-destructive border border-destructive/30' },
  waitlisted: { label: 'Waitlisted', color: 'bg-muted text-muted-foreground border border-border' },
};

const PAGE_SIZE = 20;

async function fetchApplications(page: number, status: StatusFilter) {
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE - 1;
  let query = supabase
    .from('business_applications')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (status !== 'all') query = query.eq('status', status);
  const { data, error, count } = await query.range(start, end);
  if (error) throw error;
  return { applications: (data ?? []) as Application[], totalCount: count ?? 0 };
}

interface AdminApplicationsTabProps {
  onNavigateToDashboard: () => void;
}

export function AdminApplicationsTab({ onNavigateToDashboard }: AdminApplicationsTabProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [page, setPage] = useState(1);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'denied' | 'waitlisted' | null>(null);
  const [denyReason, setDenyReason] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-applications'] });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-applications', page, statusFilter],
    queryFn: () => fetchApplications(page, statusFilter),
    staleTime: 60 * 1000,
  });

  const applications = data?.applications ?? [];
  const totalCount = data?.totalCount ?? 0;
  const filtered = applications.filter(a =>
    `${a.first_name} ${a.last_name} ${a.email} ${a.company ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

  // ── Open detail ──────────────────────────────────────────────────────────
  const openDetail = (app: Application) => {
    setSelectedApp(app);
    setNotes(app.admin_notes ?? '');
    setDetailOpen(true);
  };

  // ── Action mutation ──────────────────────────────────────────────────────
  const actionMutation = useMutation({
    mutationFn: async ({ appId, action, notesText, reason }: { appId: string; action: 'reviewing' | 'approved' | 'denied' | 'waitlisted'; notesText: string; reason?: string }) => {
      if (!selectedApp) throw new Error('No application selected');

      if (action === 'approved') {
        // DO NOT touch business_applications here — the edge function writes all DB fields
        // atomically only after Stripe succeeds, so a failure leaves status='pending' and
        // the admin can safely retry.
        const { data: fnData, error: fnError } = await supabase.functions.invoke(
          'approve-business-application',
          { body: { application_id: appId } },
        );
        // If the function threw a network/invocation error, fnError is set.
        // The function also returns { error } in the body on a 500, so prefer that message.
        if (fnError) {
          const msg = (fnData as { error?: string } | null)?.error ?? fnError.message ?? 'Approval failed';
          throw new Error(msg);
        }
        if ((fnData as { success?: boolean } | null)?.success !== true) {
          throw new Error((fnData as { error?: string } | null)?.error ?? 'Approval failed');
        }
      } else {
        // reviewing / denied / waitlisted — no Stripe involvement, safe to write directly
        const { error: updateErr } = await supabase
          .from('business_applications')
          .update({
            status: action,
            admin_notes: notesText || null,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', appId);
        if (updateErr) throw updateErr;

        if (action === 'denied' || action === 'waitlisted') {
          await supabase.functions.invoke('deny-business-application', {
            body: { application_id: appId, action, reason: reason || null },
          });
        }
      }
    },
    onSuccess: (_, { action }) => {
      const labels: Record<string, string> = {
        reviewing:  'Moved to reviewing',
        approved:   'Application approved - member has been notified',
        denied:     'Application denied',
        waitlisted: 'Added to waitlist',
      };
      toast.success(labels[action] ?? 'Updated');
      setPendingAction(null);
      setDenyReason('');
      setDetailOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Action failed'),
    onSettled: () => setActionLoading(null),
  });

  const handleAction = (action: 'reviewing' | 'approved' | 'denied' | 'waitlisted') => {
    if (!selectedApp) return;
    // Deny and Waitlist require a confirmation step with optional reason
    if (action === 'denied' || action === 'waitlisted') {
      setPendingAction(action);
      return;
    }
    setActionLoading(action);
    actionMutation.mutate({ appId: selectedApp.id, action, notesText: notes });
  };

  const handleConfirmDecision = () => {
    if (!selectedApp || !pendingAction) return;
    setActionLoading(pendingAction);
    actionMutation.mutate({ appId: selectedApp.id, action: pendingAction, notesText: notes, reason: denyReason });
  };

  const saveNotes = async () => {
    if (!selectedApp) return;
    const { error } = await supabase
      .from('business_applications')
      .update({ admin_notes: notes || null })
      .eq('id', selectedApp.id);
    if (error) toast.error('Failed to save notes');
    else { toast.success('Notes saved'); invalidate(); }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="animate-in fade-in-0 duration-200">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" aria-label="Back to admin overview" onClick={onNavigateToDashboard}><ArrowLeft className="w-4 h-4" /></Button>
        <h2 className="text-xl font-semibold">Business Applications</h2>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search applicants..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'pending', 'reviewing', 'approved', 'denied', 'waitlisted'] as StatusFilter[]).map(s => (
            <Button key={s} variant={statusFilter === s ? 'filterActive' : 'filterInactive'} size="sm"
              onClick={() => { setStatusFilter(s); setPage(1); }}>
              {s === 'all' ? 'All' : STATUS_CONFIG[s].label}
            </Button>
          ))}
        </div>
      </div>

      {isError ? (
        <div className="text-center py-12">
          <p className="text-sm text-destructive mb-2">Failed to load applications.</p>
          <Button variant="outline" size="sm" onClick={invalidate}>Retry</Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-1">No applications</h3>
          <p className="text-sm text-muted-foreground">
            {statusFilter === 'pending' ? 'No pending applications right now.' : `No ${statusFilter} applications.`}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider">Applicant</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Company</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Plan</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Card</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Applied</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(app => (
                  <TableRow key={app.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(app)}>
                    <TableCell className="py-3">
                      <div>
                        <p className="font-medium">{app.first_name} {app.last_name}</p>
                        <p className="text-xs text-muted-foreground">{app.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-muted-foreground">
                      {app.company ?? '-'}
                      {app.title && <span className="block text-xs">{app.title}</span>}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge variant="outline" className="text-xs capitalize">{app.billing_plan}</Badge>
                    </TableCell>
                    <TableCell className="py-3">
                      {app.card_saved
                        ? <Badge className="bg-green-500/10 text-green-400 text-xs">Saved</Badge>
                        : <span className="text-xs text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[app.status]?.color ?? 'bg-muted text-muted-foreground border border-border'}`}>
                        {STATUS_CONFIG[app.status]?.label ?? app.status}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-muted-foreground text-sm">
                      {format(new Date(app.created_at), 'MMM d')}
                    </TableCell>
                    <TableCell className="py-3">
                      <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); openDetail(app); }}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, totalCount)} of {totalCount}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p-1)}><ChevronLeft className="w-4 h-4 mr-1" />Previous</Button>
                <Button variant="outline" size="sm" disabled={page*PAGE_SIZE >= totalCount} onClick={() => setPage(p => p+1)}>Next<ChevronRight className="w-4 h-4 ml-1" /></Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) { setPendingAction(null); setDenyReason(''); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedApp && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  {selectedApp.first_name} {selectedApp.last_name}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[selectedApp.status]?.color ?? 'bg-muted text-muted-foreground border border-border'}`}>
                    {STATUS_CONFIG[selectedApp.status]?.label}
                  </span>
                </DialogTitle>
                <DialogDescription>Applied {format(new Date(selectedApp.created_at), 'MMMM d, yyyy')}</DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-2">
                {/* Contact info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <a href={`mailto:${selectedApp.email}`} className="text-primary hover:underline truncate">{selectedApp.email}</a>
                  </div>
                  {selectedApp.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{selectedApp.phone}</span>
                    </div>
                  )}
                  {selectedApp.company && (
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{selectedApp.company}{selectedApp.title ? ` · ${selectedApp.title}` : ''}</span>
                    </div>
                  )}
                  {selectedApp.linkedin_url && (
                    <div className="flex items-center gap-2 text-sm">
                      <Linkedin className="w-4 h-4 text-muted-foreground shrink-0" />
                      <a href={selectedApp.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">LinkedIn</a>
                    </div>
                  )}
                  {selectedApp.website && (
                    <div className="flex items-center gap-2 text-sm">
                      <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                      <a href={selectedApp.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{selectedApp.website}</a>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selectedApp.industry && <div><span className="text-muted-foreground">Industry: </span>{selectedApp.industry}</div>}
                  {selectedApp.years_in_charlotte && <div><span className="text-muted-foreground">Years in CLT: </span>{selectedApp.years_in_charlotte}</div>}
                  {selectedApp.referral_source && <div className="col-span-2"><span className="text-muted-foreground">How they heard: </span>{selectedApp.referral_source}</div>}
                  <div><span className="text-muted-foreground">Plan: </span><span className="capitalize">{selectedApp.billing_plan}</span> - {selectedApp.billing_plan === 'annual' ? '$3,600/yr' : '$300/mo'}</div>
                  <div><span className="text-muted-foreground">Card on file: </span>{selectedApp.card_saved ? '✓ Saved' : 'Not yet'}</div>
                </div>

                {/* Application answers */}
                {selectedApp.why_join && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Why do you want to join?</p>
                    <p className="text-sm leading-relaxed">{selectedApp.why_join}</p>
                  </div>
                )}
                {selectedApp.what_bring && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">What do you bring to the community?</p>
                    <p className="text-sm leading-relaxed">{selectedApp.what_bring}</p>
                  </div>
                )}
                {selectedApp.goals && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Goals for your first 90 days</p>
                    <p className="text-sm leading-relaxed">{selectedApp.goals}</p>
                  </div>
                )}

                {/* Admin notes */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Internal Notes (private)</p>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Add notes for the team..."
                    rows={3}
                    className="text-sm"
                  />
                  <Button variant="ghost" size="sm" className="mt-1" onClick={saveNotes}>Save Notes</Button>
                </div>
              </div>

              {/* Inline reason panel for Deny / Waitlist */}
              {pendingAction && (
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <p className="text-sm font-medium">
                    {pendingAction === 'denied' ? 'Deny this application?' : 'Move to waitlist?'}
                  </p>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">
                      Reason <span className="font-normal">(optional - will be included in the email to the applicant)</span>
                    </label>
                    <Textarea
                      value={denyReason}
                      onChange={e => setDenyReason(e.target.value)}
                      placeholder={pendingAction === 'denied'
                        ? 'e.g. We don\'t feel it\'s the right fit at this time...'
                        : 'e.g. We\'d love to have you - we\'ll be in touch when a spot opens...'}
                      rows={3}
                      className="text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => { setPendingAction(null); setDenyReason(''); }} disabled={!!actionLoading}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant={pendingAction === 'denied' ? 'destructive' : 'outline'}
                      className={pendingAction === 'waitlisted' ? 'text-orange-400 border-orange-400/30 hover:bg-orange-500/10' : ''}
                      disabled={!!actionLoading}
                      onClick={handleConfirmDecision}
                    >
                      {actionLoading === pendingAction
                        ? 'Sending...'
                        : pendingAction === 'denied' ? 'Confirm Deny' : 'Confirm Waitlist'}
                    </Button>
                  </div>
                </div>
              )}

              <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                <div className="flex gap-2 flex-wrap">
                  {selectedApp.status !== 'reviewing' && (
                    <Button variant="outline" size="sm" disabled={!!actionLoading || !!pendingAction} onClick={() => handleAction('reviewing')}>
                      {actionLoading === 'reviewing' ? 'Updating...' : 'Mark Reviewing'}
                    </Button>
                  )}
                  {selectedApp.status !== 'waitlisted' && (
                    <Button variant="outline" size="sm" className="text-orange-400 border-orange-400/30 hover:bg-orange-500/10" disabled={!!actionLoading || !!pendingAction} onClick={() => handleAction('waitlisted')}>
                      <Clock className="w-4 h-4 mr-1" />{pendingAction === 'waitlisted' ? 'Waitlisting...' : 'Waitlist'}
                    </Button>
                  )}
                  {selectedApp.status !== 'denied' && (
                    <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" disabled={!!actionLoading || !!pendingAction} onClick={() => handleAction('denied')}>
                      <XCircle className="w-4 h-4 mr-1" />{pendingAction === 'denied' ? 'Denying...' : 'Deny'}
                    </Button>
                  )}
                </div>
                {selectedApp.status !== 'approved' && (
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    disabled={!!actionLoading || !!pendingAction || !selectedApp.card_saved}
                    onClick={() => handleAction('approved')}
                    title={!selectedApp.card_saved ? 'Card must be saved before approval' : ''}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {actionLoading === 'approved' ? 'Approving...' : selectedApp.card_saved ? 'Approve & Charge' : 'Approve (no card yet)'}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}