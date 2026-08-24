'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Shuffle, Play, Square, RefreshCw, Settings, Monitor, AlertTriangle, Users, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import {
  loadExchangeEvents, loadExchangeRegistrations, MIXER_CAP,
  type EventOption, type ExchangeRegistration,
} from '@/lib/admin/exchange';
import {
  loadMixerConfig, saveMixerConfig, loadOverrides, setOverride, loadRounds,
  eligibleRoster, buildPairHistory, proposeMix, createPendingRound,
  discardRound, startRound, endRound, setRoundDuration,
  currentRound, nextRoundNumber, DEFAULT_CONFIG,
  type MixerConfig, type MixerRound, type MixerSeat, type MixProposal,
} from '@/lib/admin/exchange-mixer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DEFAULT_EVENT_ID =
  process.env.NEXT_PUBLIC_EXCHANGE_EVENT_ID || '02afde72-33c4-4c99-8dba-0ea5a8c0a723';

const ROSTER_POLL_MS = 30000;

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function MixerPageInner() {
  const params = useSearchParams();
  const [eventId, setEventId] = useState(params.get('event') || DEFAULT_EVENT_ID);
  const [events, setEvents] = useState<EventOption[]>([]);

  const [registrations, setRegistrations] = useState<ExchangeRegistration[]>([]);
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const [rounds, setRounds] = useState<MixerRound[]>([]);
  const [seats, setSeats] = useState<MixerSeat[]>([]);
  const [config, setConfig] = useState<MixerConfig>({ event_id: eventId, ...DEFAULT_CONFIG });
  const [configDraft, setConfigDraft] = useState({
    tables_count: String(DEFAULT_CONFIG.tables_count),
    seats_per_table: String(DEFAULT_CONFIG.seats_per_table),
    planned_rounds: String(DEFAULT_CONFIG.planned_rounds),
    round_duration_seconds: String(DEFAULT_CONFIG.round_duration_seconds),
  });
  const [showConfig, setShowConfig] = useState(false);
  const [showRoster, setShowRoster] = useState(false);

  const [allowHangOnly, setAllowHangOnly] = useState(false);
  const [seatEveryone, setSeatEveryone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const proposalRef = useRef<MixProposal | null>(null);

  useEffect(() => {
    loadExchangeEvents().then(setEvents).catch(() => { /* selector is a convenience */ });
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [regs, cfg, ovr, rds] = await Promise.all([
        loadExchangeRegistrations(eventId),
        loadMixerConfig(eventId),
        loadOverrides(eventId),
        loadRounds(eventId),
      ]);
      setRegistrations(regs.registrations);
      setConfig(cfg);
      setOverrides(ovr);
      setRounds(rds.rounds);
      setSeats(rds.seats);
      if (!quiet) {
        setConfigDraft({
          tables_count: String(cfg.tables_count),
          seats_per_table: String(cfg.seats_per_table),
          planned_rounds: String(cfg.planned_rounds),
          round_duration_seconds: String(cfg.round_duration_seconds),
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load the mixer');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  // Late check-ins walk in all night; they join the next mix on their own.
  useEffect(() => {
    const t = setInterval(() => load(true), ROSTER_POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const roster = useMemo(
    () => eligibleRoster(registrations, overrides, { allowHangOnly }),
    [registrations, overrides, allowHangOnly],
  );

  const overCap = roster.length > config.mixer_cap;
  // Earliest check-in keeps the seats: the roster comes back sorted that way.
  const seatedRoster = overCap && !seatEveryone ? roster.slice(0, config.mixer_cap) : roster;

  const history = useMemo(() => buildPairHistory(rounds, seats), [rounds, seats]);
  const active = rounds.find((r) => r.status === 'active') ?? null;
  const pending = rounds.filter((r) => r.status === 'pending').sort((a, b) => b.round_number - a.round_number)[0] ?? null;
  const live = currentRound(rounds);
  const completedCount = rounds.filter((r) => r.status === 'completed').length;

  const liveSeats = useMemo(
    () => (live ? seats.filter((s) => s.round_id === live.id) : []),
    [live, seats],
  );
  const liveTables = useMemo(() => {
    const map = new Map<number, MixerSeat[]>();
    for (const s of liveSeats) {
      const list = map.get(s.table_number) ?? [];
      list.push(s);
      map.set(s.table_number, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [liveSeats]);

  // Repeat honesty for the round on screen, recomputed against completed history.
  const liveRepeats = useMemo(() => {
    if (!live) return 0;
    const completedIds = new Set(rounds.filter((r) => r.status === 'completed' && r.id !== live.id).map((r) => r.id));
    const past = buildPairHistory(rounds.filter((r) => completedIds.has(r.id)), seats);
    let n = 0;
    for (const [, list] of liveTables) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i].credential_id, b = list[j].credential_id;
          if ((past.get(a < b ? `${a}|${b}` : `${b}|${a}`) ?? 0) > 0) n++;
        }
      }
    }
    return n;
  }, [live, liveTables, rounds, seats]);

  const remaining = active?.started_at
    ? active.duration_seconds - Math.floor((now - new Date(active.started_at).getTime()) / 1000)
    : (live?.duration_seconds ?? config.round_duration_seconds);

  const doMix = async (replace: MixerRound | null) => {
    if (seatedRoster.length === 0) { toast.error('Nobody is checked in yet.'); return; }
    setBusy(true);
    try {
      if (replace) await discardRound(replace.id);
      const proposal = proposeMix({
        candidates: seatedRoster,
        tablesCount: config.tables_count,
        seatsPerTable: config.seats_per_table,
        history,
      });
      proposalRef.current = proposal;
      const number = replace ? replace.round_number : nextRoundNumber(rounds);
      await createPendingRound({
        eventId,
        roundNumber: number,
        proposal,
        durationSeconds: config.round_duration_seconds,
      });
      await load(true);
      toast.success(
        proposal.repeatPairs === 0
          ? `Round ${number} mixed - no repeat pairs`
          : `Round ${number} mixed - ${proposal.repeatPairs} repeat pair${proposal.repeatPairs === 1 ? '' : 's'} unavoidable`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Mix failed');
    } finally {
      setBusy(false);
    }
  };

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); await load(true); toast.success(ok); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'That did not work'); }
    finally { setBusy(false); }
  };

  const saveConfig = async () => {
    const next: MixerConfig = {
      ...config,
      tables_count: Math.max(1, parseInt(configDraft.tables_count, 10) || 1),
      seats_per_table: Math.max(2, parseInt(configDraft.seats_per_table, 10) || 2),
      planned_rounds: Math.max(1, parseInt(configDraft.planned_rounds, 10) || 1),
      round_duration_seconds: Math.max(30, parseInt(configDraft.round_duration_seconds, 10) || 30),
      event_id: eventId,
    };
    setBusy(true);
    try {
      await saveMixerConfig(next);
      setConfig(next);
      // A running round honors an edited duration immediately.
      if (active) await setRoundDuration(active.id, next.round_duration_seconds);
      await load(true);
      toast.success('Config saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save config');
    } finally {
      setBusy(false);
    }
  };

  const togglePerson = async (credentialId: string, included: boolean) => {
    try {
      await setOverride(eventId, credentialId, included);
      setOverrides((prev) => new Map(prev).set(credentialId, included));
      toast.success(included ? 'Back in the rounds' : 'Sitting this one out');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save that');
    }
  };

  const mixerSide = registrations.filter(
    (r) => r.credentialStatus !== 'voided' && (Boolean(r.checkedInAt) || r.credentialStatus === 'used') && !r.isFounder,
  );

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="px-2">
            <Link href="/admin/exchange"><ChevronLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Mixer</h1>
            <p className="text-sm text-muted-foreground">
              {events.find((e) => e.id === eventId)?.title ?? 'The Exchange'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href={`/admin/exchange/board?event=${eventId}`} target="_blank"><Monitor className="w-4 h-4" /> Board</Link>
          </Button>
        </div>
      </div>

      {/* ── The one screen that matters at 7pm ───────────────────────────────── */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground/70">
              {live ? `Round ${live.round_number} - ${live.status}` : 'No round yet'}
            </p>
            <p className="text-5xl font-bold tabular-nums text-foreground" data-testid="timer">
              {fmtClock(remaining)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground" data-testid="eligible-count">
              {seatedRoster.length} eligible
              {overCap && !seatEveryone && <span className="text-amber-400"> (of {roster.length})</span>}
            </p>
            <p className="text-sm text-muted-foreground">
              {completedCount} of {config.planned_rounds} rounds done
            </p>
            {live && (
              <p className="text-sm text-muted-foreground" data-testid="repeat-count">
                {liveRepeats} repeat pair{liveRepeats === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </div>

        {overCap && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p>{roster.length} eligible, over the cap of {config.mixer_cap}.</p>
              <label className="mt-1 flex items-center gap-2">
                <input type="checkbox" data-testid="seat-everyone" checked={seatEveryone}
                  onChange={(e) => setSeatEveryone(e.target.checked)} className="h-4 w-4" />
                Seat everyone anyway
              </label>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {!active && !pending && (
            <Button className="gap-2 h-12 text-base" disabled={busy} data-testid="btn-mix" onClick={() => doMix(null)}>
              <Shuffle className="w-4 h-4" /> Mix round {nextRoundNumber(rounds)}
            </Button>
          )}
          {pending && !active && (
            <>
              <Button className="gap-2 h-12 text-base" disabled={busy} data-testid="btn-start"
                onClick={() => run(() => startRound(pending.id), `Round ${pending.round_number} is live`)}>
                <Play className="w-4 h-4" /> Start round
              </Button>
              <Button variant="outline" className="gap-2 h-12 text-base" disabled={busy} data-testid="btn-reshuffle"
                onClick={() => doMix(pending)}>
                <Shuffle className="w-4 h-4" /> Reshuffle
              </Button>
            </>
          )}
          {active && (
            <Button variant="outline" className="gap-2 h-12 text-base" disabled={busy} data-testid="btn-end"
              onClick={() => run(() => endRound(active.id), `Round ${active.round_number} complete`)}>
              <Square className="w-4 h-4" /> End round
            </Button>
          )}
          <Button variant="ghost" className="gap-2 h-12" onClick={() => setShowConfig((v) => !v)}>
            <Settings className="w-4 h-4" /> Config
          </Button>
          <Button variant="ghost" className="gap-2 h-12" onClick={() => setShowRoster((v) => !v)}>
            <Users className="w-4 h-4" /> Roster
          </Button>
        </div>
      </div>

      {showConfig && (
        <div className="rounded-lg border border-border p-4 space-y-3" data-testid="config-panel">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="cfg-tables">Tables</Label>
              <Input id="cfg-tables" data-testid="cfg-tables" inputMode="numeric" value={configDraft.tables_count}
                onChange={(e) => setConfigDraft((d) => ({ ...d, tables_count: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="cfg-seats">Seats per table</Label>
              <Input id="cfg-seats" data-testid="cfg-seats" inputMode="numeric" value={configDraft.seats_per_table}
                onChange={(e) => setConfigDraft((d) => ({ ...d, seats_per_table: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="cfg-rounds">Planned rounds</Label>
              <Input id="cfg-rounds" data-testid="cfg-rounds" inputMode="numeric" value={configDraft.planned_rounds}
                onChange={(e) => setConfigDraft((d) => ({ ...d, planned_rounds: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="cfg-duration">Round seconds</Label>
              <Input id="cfg-duration" data-testid="cfg-duration" inputMode="numeric" value={configDraft.round_duration_seconds}
                onChange={(e) => setConfigDraft((d) => ({ ...d, round_duration_seconds: e.target.value }))} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={saveConfig} disabled={busy} data-testid="cfg-save">Save config</Button>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" data-testid="allow-hang-only" checked={allowHangOnly}
                onChange={(e) => setAllowHangOnly(e.target.checked)} className="h-4 w-4" />
              Allow hang-only guests into rounds
            </label>
          </div>
        </div>
      )}

      {showRoster && (
        <div className="rounded-lg border border-border divide-y divide-border" data-testid="roster-panel">
          {mixerSide.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Nobody is checked in yet.</p>
          )}
          {mixerSide.map((r) => {
            const included = overrides.get(r.credentialId) !== false;
            const hangOnly = r.participation === 'social_only';
            const inRounds = included && (hangOnly ? allowHangOnly : true);
            return (
              <div key={r.credentialId} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{r.name || r.email}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {hangOnly ? 'Hang only' : 'Mixer'} - {r.memberStatus}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] rounded-md px-1.5 py-0.5 ${inRounds ? 'bg-green-500/15 text-green-400' : 'bg-muted text-muted-foreground'}`}>
                    {inRounds ? 'In' : 'Out'}
                  </span>
                  <Button size="sm" variant="outline" data-testid={`toggle-${r.email}`}
                    onClick={() => togglePerson(r.credentialId, !included)}>
                    {included ? 'Exclude' : 'Include'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {live && (
        <div className="space-y-2" data-testid="tables">
          <h2 className="text-lg font-semibold text-foreground">
            Round {live.round_number} seating
            <span className="text-muted-foreground font-normal"> - {liveTables.length} tables, {liveSeats.length} seated</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {liveTables.map(([num, list]) => (
              <div key={num} className="rounded-lg border border-border p-3" data-testid={`table-${num}`}>
                <p className="text-xs uppercase tracking-wider text-muted-foreground/70 mb-1">Table {num}</p>
                <ul className="space-y-0.5">
                  {list.map((s) => (
                    <li key={s.id} className="text-sm text-foreground">{s.display_name}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {rounds.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground/70 mb-2">Rounds</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {rounds.map((r) => (
              <span key={r.id} className="rounded-md border border-border px-2 py-1 text-muted-foreground">
                #{r.round_number} {r.status}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MixerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <MixerPageInner />
    </Suspense>
  );
}
