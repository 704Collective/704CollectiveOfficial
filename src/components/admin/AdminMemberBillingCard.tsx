'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { DollarSign, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { MemberBillingResponse } from '@/lib/admin/member-billing';

/** Stripe founding business monthly price — show Founding rate tag when matched. */
const FOUNDING_PRICE_ID = 'price_1SrNeVRzSIH3EgWLI21DpLB0';

interface AdminMemberBillingCardProps {
  profileId: string | null;
  isSuperAdmin: boolean;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'MMM d, yyyy');
  } catch {
    return '—';
  }
}

function toDateInput(iso: string | null | undefined) {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

export function AdminMemberBillingCard({
  profileId,
  isSuperAdmin,
}: AdminMemberBillingCardProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<MemberBillingResponse | null>(null);
  const [compReason, setCompReason] = useState('');
  const [paidThrough, setPaidThrough] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  const load = useCallback(async () => {
    if (!profileId) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/members/${profileId}/billing`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = (await res.json()) as MemberBillingResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Failed to load billing');
      }
      setData(json);
      setCompReason(json.profile?.comp_reason ?? '');
      setPaidThrough(toDateInput(json.profile?.external_paid_through));
      setPaymentNote(json.profile?.external_payment_note ?? '');
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to load billing');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!profileId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/members/${profileId}/billing`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comp_reason: compReason.trim() || null,
          external_paid_through: paidThrough.trim() || null,
          external_payment_note: paymentNote.trim() || null,
        }),
      });
      const json = (await res.json()) as MemberBillingResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Failed to save');
      }
      toast.success('Billing notes saved');
      setData((prev) =>
        prev
          ? {
              ...prev,
              profile: json.profile ?? prev.profile,
            }
          : prev,
      );
      setCompReason(json.profile?.comp_reason ?? '');
      setPaidThrough(toDateInput(json.profile?.external_paid_through));
      setPaymentNote(json.profile?.external_payment_note ?? '');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!profileId) return null;

  const profile = data?.profile;
  const stripe = data?.stripe;
  const isExternalPayer = !!profile?.external_paid_through;
  const periodEnd = isExternalPayer
    ? profile!.external_paid_through
    : stripe?.currentPeriodEnd || profile?.subscription_ends_at || null;
  const canceling = isExternalPayer
    ? false
    : !!(stripe?.cancelAtPeriodEnd || profile?.cancel_at_period_end);
  const priceLine = stripe?.priceDisplay
    ? stripe.priceDisplay
    : isExternalPayer
      ? 'External - annual'
      : profile?.membership_override
        ? 'Comped'
        : '—';
  const isFoundingRate =
    stripe?.priceId === FOUNDING_PRICE_ID || !!profile?.is_founding_member;

  return (
    <Card className="md:col-span-2">
      <CardContent className="p-5 space-y-4">
        <div className="flex justify-between items-start">
          <p className="text-xs uppercase tracking-wider text-muted-foreground/70">Billing</p>
          <DollarSign className="w-4 h-4 text-muted-foreground" />
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading billing…
          </div>
        )}

        {!loading && profile && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium">
                  {stripe?.status || profile.subscription_status || '—'}
                </span>
              </div>
              <div className="flex justify-between gap-2 items-center">
                <span className="text-muted-foreground">Price</span>
                <span className="font-medium inline-flex items-center gap-1.5">
                  {priceLine}
                  {isFoundingRate && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-[#C6A664]/20 text-[#C6A664] px-1.5 py-0.5 rounded">
                      Founding rate
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  {canceling ? 'Ends' : 'Renews'}
                </span>
                <span className="font-medium">{fmtDate(periodEnd)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-medium">
                  {stripe?.discount
                    ? stripe.discount.couponCode ||
                      stripe.discount.couponName ||
                      'Yes'
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Override / Comp</span>
                <span className="font-medium">
                  {profile.membership_override ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Founding / Locked</span>
                <span className="font-medium">
                  {[
                    profile.is_founding_member ? 'Founding' : null,
                    profile.is_locked_in_pricing ? 'Locked-in' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </span>
              </div>
              <div className="flex justify-between gap-2 sm:col-span-2">
                <span className="text-muted-foreground">Stripe customer</span>
                <span className="font-mono text-xs">
                  {profile.stripe_customer_id || '—'}
                </span>
              </div>
              <div className="flex justify-between gap-2 sm:col-span-2">
                <span className="text-muted-foreground">Subscription</span>
                <span className="font-mono text-xs">
                  {stripe?.subscriptionId || profile.subscription_id || '—'}
                </span>
              </div>
            </div>

            {isSuperAdmin ? (
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground/70">
                  Comp / external payment (super admin)
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="comp_reason">Comp reason</Label>
                    <Input
                      id="comp_reason"
                      value={compReason}
                      onChange={(e) => setCompReason(e.target.value)}
                      placeholder="e.g. Founding partner — Glue Up"
                      maxLength={500}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="external_paid_through">External paid through</Label>
                    <Input
                      id="external_paid_through"
                      type="date"
                      value={paidThrough}
                      onChange={(e) => setPaidThrough(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="external_payment_note">External payment note</Label>
                    <Textarea
                      id="external_payment_note"
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      placeholder="e.g. Paid $1,034 annual outside Stripe"
                      rows={2}
                      maxLength={2000}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => void handleSave()} disabled={saving} size="sm">
                    {saving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      'Save billing notes'
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              (profile.comp_reason ||
                profile.external_paid_through ||
                profile.external_payment_note) && (
                <div className="border-t border-border pt-4 space-y-1 text-sm">
                  {profile.comp_reason && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Comp reason</span>
                      <span className="font-medium text-right">{profile.comp_reason}</span>
                    </div>
                  )}
                  {profile.external_paid_through && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">External paid through</span>
                      <span className="font-medium">
                        {fmtDate(profile.external_paid_through)}
                      </span>
                    </div>
                  )}
                  {profile.external_payment_note && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">External note</span>
                      <span className="font-medium text-right">
                        {profile.external_payment_note}
                      </span>
                    </div>
                  )}
                </div>
              )
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
