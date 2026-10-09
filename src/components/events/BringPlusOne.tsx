'use client';

// Business member +1 — "Bring a +1" (name + email) for business members who hold
// an RSVP on an eligible event. Reads/writes only through add-business-plus-one;
// the member cannot read the guest's credential directly (RLS), so the function's
// `status` action is the source of truth.

import { useCallback, useEffect, useState } from 'react';
import { UserPlus, X, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isPlusOneEligibleEvent, plusOneEventStarted, type PlusOneEvent, type PlusOneStatus, type PlusOneSummary } from '@/lib/events/plusOne';

type Props = { eventId: string; event: PlusOneEvent; hasRsvp: boolean; compact?: boolean; onChange?: (plusOne: PlusOneSummary | null) => void };

const GOLD = '#C6A664';
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: '0.875rem', outline: 'none' };

export function BringPlusOne({ eventId, event, hasRsvp, compact = false, onChange }: Props) {
  const { profile, isAdmin } = useAuth();
  const isBusiness = (profile as { member_type?: string } | null)?.member_type === 'business';
  const eligible = isPlusOneEligibleEvent(event) && !plusOneEventStarted(event);
  const [status, setStatus] = useState<PlusOneStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState(''); const [last, setLast] = useState(''); const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [noRoom, setNoRoom] = useState(false);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('add-business-plus-one', { body: { event_id: eventId, ...body } });
    if (error) {
      // invoke() treats non-2xx as error; the JSON body still carries code/error.
      let payload: { error?: string; code?: string; plus_one?: PlusOneSummary | null } | null = null;
      try { const ctx = (error as { context?: Response }).context; if (ctx) payload = await ctx.json(); } catch { /* ignore */ }
      return { ok: false as const, status: (error as { context?: Response }).context?.status ?? 0, ...(payload ?? { error: 'Something went wrong' }) };
    }
    const d = data as Record<string, unknown>;
    // Expected outcomes (no room / guest already attending / +1 exists) arrive as 200 + success:false.
    if (d.success === false) return { ok: false as const, status: 200, ...d };
    return { ok: true as const, ...d };
  }, [eventId]);

  const applyStatus = useCallback((r: Awaited<ReturnType<typeof call>>) => {
    if (r.ok) { const s = r as unknown as PlusOneStatus & { ok: true }; setStatus({ eligible: s.eligible, has_rsvp: s.has_rsvp, started: s.started, plus_one: s.plus_one }); onChange?.(s.plus_one); }
  }, [onChange]);
  const refresh = useCallback(async () => {
    if (!isBusiness && !isAdmin) return;
    applyStatus(await call({ action: 'status' }));
  }, [call, isBusiness, isAdmin, applyStatus]);
  // Re-read through the function whenever the member's RSVP state changes (the component renders
  // nothing without an RSVP, so a stale status is never shown). State is set in the response callback.
  useEffect(() => {
    if (!hasRsvp || (!isBusiness && !isAdmin)) return;
    let live = true;
    call({ action: 'status' }).then((r) => { if (live) applyStatus(r); });
    return () => { live = false; };
  }, [hasRsvp, isBusiness, isAdmin, call, applyStatus]);

  if (!isBusiness || !hasRsvp || !eligible) return null;

  const add = async () => {
    setBusy(true); setNoRoom(false);
    const r = await call({ action: 'add', guest_first_name: first, guest_last_name: last, guest_email: email });
    setBusy(false);
    if (!r.ok) {
      const code = (r as { code?: string }).code;
      if (code === 'PLUS_ONE_NO_ROOM') { setNoRoom(true); return; }
      // Pending-cancel member, event after their paid window: informational, not an error.
      if (code === 'MEMBERSHIP_ENDS_BEFORE_EVENT') { toast.info((r as { error?: string }).error ?? 'Your membership ends before this event.'); setOpen(false); return; }
      toast.error((r as { error?: string }).error ?? 'Could not add your +1');
      if (code === 'PLUS_ONE_EXISTS') void refresh();
      return;
    }
    toast.success(`${first.trim()} is on the list as your +1`);
    setOpen(false); setFirst(''); setLast(''); setEmail('');
    void refresh();
  };
  const remove = async () => {
    setBusy(true);
    const r = await call({ action: 'remove' });
    setBusy(false);
    if (!r.ok) { toast.error((r as { error?: string }).error ?? 'Could not remove your +1'); return; }
    toast.success('Your +1 was removed. Your own RSVP is unchanged.');
    void refresh();
  };

  const guest = status?.plus_one ?? null;
  return (
    <div data-testid="bring-plus-one" style={{ width: '100%', textAlign: 'left', padding: compact ? '12px 14px' : '16px', borderRadius: '12px', background: 'rgba(198,166,100,0.06)', border: '1px solid rgba(198,166,100,0.28)' }}>
      <p style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(198,166,100,0.9)', margin: '0 0 6px' }}>Business member +1</p>
      {guest ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }} data-testid="plus-one-guest">
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}><Check style={{ width: 14, height: 14, color: '#4CAF50' }} />{guest.guest_name}{guest.checked_in_at ? <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.45)' }}>· checked in</span> : null}</p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{guest.guest_email} · their pass is in their inbox</p>
          </div>
          {!guest.checked_in_at && (
            <button type="button" onClick={() => void remove()} disabled={busy} aria-label="Remove +1" data-testid="plus-one-remove" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>{busy ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <X style={{ width: 12, height: 12 }} />}Remove</button>
          )}
        </div>
      ) : noRoom ? (
        <div role="status" data-testid="plus-one-no-room" style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
          <strong style={{ color: '#fff' }}>You&apos;re in.</strong> There isn&apos;t room for your +1 right now - the event is full. If a spot opens up you can add them from here.
          <button type="button" onClick={() => { setNoRoom(false); setOpen(true); }} style={{ display: 'block', marginTop: 8, fontSize: '0.75rem', color: GOLD, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>Try again</button>
        </div>
      ) : open ? (
        <form onSubmit={(e) => { e.preventDefault(); void add(); }} data-testid="plus-one-form" style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Guest first name" required style={input} data-testid="plus-one-first" />
            <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" required style={input} data-testid="plus-one-last" />
          </div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Guest email (their pass goes here)" required style={input} data-testid="plus-one-email" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={busy} data-testid="plus-one-submit" style={{ flex: 1, padding: '10px 14px', borderRadius: 8, fontSize: '0.8125rem', fontWeight: 600, background: GOLD, color: '#1A1A1A', border: 'none', cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Adding…' : 'Add my +1'}</button>
            <button type="button" onClick={() => setOpen(false)} disabled={busy} style={{ padding: '10px 12px', borderRadius: 8, fontSize: '0.8125rem', background: 'transparent', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer' }}>Cancel</button>
          </div>
          <p style={{ margin: 0, fontSize: '0.6875rem', color: 'rgba(255,255,255,0.4)' }}>One named guest per event, included with your business membership.</p>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} data-testid="plus-one-open" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'center', padding: '10px 14px', borderRadius: 8, fontSize: '0.8125rem', fontWeight: 600, background: 'rgba(198,166,100,0.15)', color: GOLD, border: '1px solid rgba(198,166,100,0.4)', cursor: 'pointer' }}>
          <UserPlus style={{ width: 15, height: 15 }} /> Bring a +1
        </button>
      )}
    </div>
  );
}
