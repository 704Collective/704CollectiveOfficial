'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { AdminLayout } from '@/components/AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Severity = 'critical' | 'medium' | 'low';
type SuggestedAction = 'sync_from_stripe' | 'manual_review';

interface ProfileState {
  subscriptionStatus: string | null;
  subscriptionId: string | null;
  stripeCustomerId: string | null;
  subscriptionEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

interface StripeState {
  activeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  priceId: string | null;
}

interface Mismatch {
  profileId: string;
  email: string;
  fullName: string | null;
  memberType: string | null;
  severity: Severity;
  mismatchType: string;
  explanation: string;
  profileState: ProfileState;
  stripeState: StripeState | null;
  suggestedAction: SuggestedAction;
}

interface PreviewResponse {
  ok: boolean;
  scanned: number;
  partial?: boolean;
  total_profiles_with_stripe?: number;
  mismatches: Mismatch[];
  summary: { critical_count: number; medium_count: number; low_count: number };
  error?: string;
}

interface AppliedRow {
  profileId: string;
  email: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  success: boolean;
  error?: string;
}

interface ApplyResponse {
  ok: boolean;
  applied: AppliedRow[];
  successCount: number;
  failCount: number;
  error?: string;
}

const SAFE_AUTO_TYPES = new Set([
  'profile_says_canceled_stripe_says_active',
  'profile_says_active_stripe_says_canceled',
  'cancel_flag_mismatch',
  'end_date_mismatch',
]);

const MISMATCH_LABELS: Record<string, string> = {
  profile_says_canceled_stripe_says_active: 'Profile canceled, Stripe active',
  profile_says_active_stripe_says_canceled: 'Profile active, Stripe canceled',
  cancel_flag_mismatch: 'Cancel-at-period-end mismatch',
  end_date_mismatch: 'End-date drift (>24h)',
  subscription_id_missing: 'Missing subscription_id',
  subscription_id_orphan: 'Orphan subscription_id',
  stripe_paused: 'Stripe paused, profile not paused',
  trial_end_drift: 'Trial-end drift (>24h)',
  stripe_fetch_failed: 'Stripe fetch failed',
};

function severityBadge(s: Severity) {
  if (s === 'critical') {
    return (
      <Badge variant="destructive" className="uppercase text-[10px] tracking-wide">
        Critical
      </Badge>
    );
  }
  if (s === 'medium') {
    return (
      <Badge className="uppercase text-[10px] tracking-wide bg-amber-500/20 text-amber-200 border-amber-500/40 hover:bg-amber-500/30">
        Medium
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="uppercase text-[10px] tracking-wide">
      Low
    </Badge>
  );
}

function StateBlock({ title, state }: { title: string; state: ProfileState | StripeState | null }) {
  if (!state) {
    return (
      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{title}</p>
        <p className="text-xs text-muted-foreground italic">No data</p>
      </div>
    );
  }
  const rows = Object.entries(state).filter(([, v]) => v !== undefined);
  return (
    <div className="space-y-1 min-w-[200px]">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{title}</p>
      <div className="space-y-0.5">
        {rows.map(([k, v]) => {
          let display: string;
          if (v === null) display = 'null';
          else if (typeof v === 'boolean') display = v ? 'true' : 'false';
          else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
            try {
              display = format(new Date(v), 'MMM d, yyyy');
            } catch {
              display = v;
            }
          } else display = String(v);
          return (
            <p key={k} className="text-[11px] font-mono leading-snug">
              <span className="text-muted-foreground">{k}:</span>{' '}
              <span className={v === null ? 'text-muted-foreground/50' : 'text-foreground'}>{display}</span>
            </p>
          );
        })}
      </div>
    </div>
  );
}

export default function ReconcileStripePage() {
  const router = useRouter();
  const { isSuperAdmin, loading } = useAuth();
  usePageTitle('Stripe Reconciliation');

  const [auditing, setAuditing] = useState(false);
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [syncingRowId, setSyncingRowId] = useState<string | null>(null);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!loading && !isSuperAdmin) router.replace('/admin');
  }, [loading, isSuperAdmin, router]);

  const runAudit = useCallback(async () => {
    setAuditing(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/reconcile-stripe-preview', {
        cache: 'no-store',
        credentials: 'include',
      });
      const j = (await res.json()) as PreviewResponse;
      if (!res.ok || !j.ok) {
        setErr(j.error ?? 'Audit failed.');
        setData(null);
        return;
      }
      setData(j);
      toast.success(`Scan complete - ${j.mismatches.length} mismatches across ${j.scanned} profiles.`);
    } catch (e) {
      console.error('[reconcile-stripe] audit failed', e);
      setErr('Audit request failed.');
      setData(null);
    } finally {
      setAuditing(false);
    }
  }, []);

  const applyIds = useCallback(
    async (profileIds: string[]): Promise<ApplyResponse | null> => {
      try {
        const res = await fetch('/api/admin/reconcile-stripe-apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ profileIds }),
        });
        const j = (await res.json()) as ApplyResponse;
        if (!res.ok || !j.ok) {
          toast.error(j.error ?? 'Sync failed.');
          return null;
        }
        return j;
      } catch (e) {
        console.error('[reconcile-stripe] apply failed', e);
        toast.error('Sync request failed.');
        return null;
      }
    },
    [],
  );

  const handleSyncRow = useCallback(
    async (row: Mismatch) => {
      if (syncingRowId) return;
      setSyncingRowId(row.profileId);
      const result = await applyIds([row.profileId]);
      setSyncingRowId(null);
      if (!result) return;
      const ok = result.applied[0]?.success ?? false;
      if (ok) {
        toast.success(`Synced ${row.email}.`);
        setData((prev) =>
          prev
            ? {
                ...prev,
                mismatches: prev.mismatches.filter((m) => m.profileId !== row.profileId),
                summary: recomputeSummary(prev.mismatches.filter((m) => m.profileId !== row.profileId)),
              }
            : prev,
        );
      } else {
        toast.error(`${row.email}: ${result.applied[0]?.error ?? 'Unknown error'}`);
      }
    },
    [applyIds, syncingRowId],
  );

  const safeAutoMismatches = useMemo(() => {
    if (!data) return [];
    return data.mismatches.filter(
      (m) => m.suggestedAction === 'sync_from_stripe' && SAFE_AUTO_TYPES.has(m.mismatchType),
    );
  }, [data]);

  const handleBulkSync = useCallback(async () => {
    if (bulkSyncing || safeAutoMismatches.length === 0) return;
    setBulkSyncing(true);
    const ids = safeAutoMismatches.map((m) => m.profileId);
    const result = await applyIds(ids);
    setBulkSyncing(false);
    setConfirmOpen(false);
    if (!result) return;
    toast.success(`Synced ${result.successCount} profile(s). ${result.failCount} failed.`);
    const failedIds = new Set(result.applied.filter((a) => !a.success).map((a) => a.profileId));
    setData((prev) => {
      if (!prev) return prev;
      const remaining = prev.mismatches.filter(
        (m) => !ids.includes(m.profileId) || failedIds.has(m.profileId),
      );
      return { ...prev, mismatches: remaining, summary: recomputeSummary(remaining) };
    });
  }, [applyIds, bulkSyncing, safeAutoMismatches]);

  if (loading || !isSuperAdmin) {
    return (
      <AdminLayout title="Stripe Reconciliation">
        <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
          {loading ? <Loader2 className="h-8 w-8 animate-spin" /> : null}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Stripe Reconciliation">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stripe Reconciliation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compare profile state vs live Stripe state. Stripe is the source of truth.
          </p>
        </div>

        {/* Toolbar */}
        <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => void runAudit()} disabled={auditing}>
            {auditing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {auditing ? 'Running audit...' : data ? 'Re-run Audit' : 'Run Audit'}
          </Button>

          <Button
            variant="secondary"
            disabled={!data || safeAutoMismatches.length === 0 || bulkSyncing || auditing}
            onClick={() => setConfirmOpen(true)}
          >
            {bulkSyncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Sync All Safe ({safeAutoMismatches.length})
          </Button>

          {data && (
            <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="destructive" className="uppercase text-[10px] tracking-wide">
                Critical: {data.summary.critical_count}
              </Badge>
              <Badge className="uppercase text-[10px] tracking-wide bg-amber-500/20 text-amber-200 border-amber-500/40 hover:bg-amber-500/30">
                Medium: {data.summary.medium_count}
              </Badge>
              <Badge variant="secondary" className="uppercase text-[10px] tracking-wide">
                Low: {data.summary.low_count}
              </Badge>
              <span className="text-muted-foreground ml-2">
                Scanned {data.scanned}
                {data.partial ? ` of ${data.total_profiles_with_stripe ?? '?'}` : ''} profile(s)
              </span>
            </div>
          )}
        </div>

        {err && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3">
            <ShieldAlert className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{err}</p>
          </div>
        )}

        {data?.partial && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
            Only the first {data.scanned} of {data.total_profiles_with_stripe} eligible profiles were scanned in this batch.
            Run the audit again after fixing this batch to scan the rest.
          </div>
        )}

        {!data && !auditing && !err && (
          <div className="rounded-xl border border-border bg-card/50 px-6 py-12 text-center text-sm text-muted-foreground">
            Click <span className="font-semibold text-foreground">Run Audit</span> to compare every member profile against
            live Stripe data.
          </div>
        )}

        {data && data.mismatches.length === 0 && !auditing && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-6 py-8 text-center">
            <p className="text-base font-semibold text-emerald-300">All clean.</p>
            <p className="text-sm text-muted-foreground mt-1">
              No mismatches found across {data.scanned} profile(s).
            </p>
          </div>
        )}

        {data && data.mismatches.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[220px]">Member</TableHead>
                  <TableHead className="w-[110px]">Severity</TableHead>
                  <TableHead className="w-[220px]">Mismatch</TableHead>
                  <TableHead>Profile state</TableHead>
                  <TableHead>Stripe state</TableHead>
                  <TableHead className="text-right w-[160px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.mismatches.map((row) => {
                  const isSyncing = syncingRowId === row.profileId;
                  const isSafe = row.suggestedAction === 'sync_from_stripe';
                  return (
                    <TableRow key={row.profileId} className="align-top">
                      <TableCell>
                        <div className="space-y-0.5 min-w-0">
                          <p className="text-sm font-medium truncate">{row.fullName ?? '(no name)'}</p>
                          <p className="text-xs text-muted-foreground truncate">{row.email}</p>
                          {row.memberType && (
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                              {row.memberType}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{severityBadge(row.severity)}</TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">
                          {MISMATCH_LABELS[row.mismatchType] ?? row.mismatchType}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 leading-snug">{row.explanation}</p>
                      </TableCell>
                      <TableCell>
                        <StateBlock title="Profile" state={row.profileState} />
                      </TableCell>
                      <TableCell>
                        <StateBlock title="Stripe" state={row.stripeState} />
                      </TableCell>
                      <TableCell className="text-right">
                        {isSafe ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isSyncing || bulkSyncing}
                            onClick={() => void handleSyncRow(row)}
                          >
                            {isSyncing ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                Syncing...
                              </>
                            ) : (
                              'Sync from Stripe'
                            )}
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            Manual review
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Confirm modal for Sync All Safe */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync {safeAutoMismatches.length} profile(s) from Stripe?</DialogTitle>
            <DialogDescription>
              About to overwrite {safeAutoMismatches.length} profile record(s) with live Stripe data. This cannot be
              undone. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" disabled={bulkSyncing} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button disabled={bulkSyncing} onClick={() => void handleBulkSync()}>
              {bulkSyncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm sync
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function recomputeSummary(mismatches: Mismatch[]) {
  return {
    critical_count: mismatches.filter((m) => m.severity === 'critical').length,
    medium_count: mismatches.filter((m) => m.severity === 'medium').length,
    low_count: mismatches.filter((m) => m.severity === 'low').length,
  };
}
