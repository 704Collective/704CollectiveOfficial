import { supabase } from '@/integrations/supabase/client';
import { MIXER_CAP, type ExchangeRegistration } from '@/lib/admin/exchange';

// The mixer engine: config, roster, the mixing algorithm, and round lifecycle.
// Adam runs this from his phone while the room is full, so every call here is
// small, explicit, and safe to retry.

export interface MixerConfig {
  event_id: string;
  format: string;
  tables_count: number;
  seats_per_table: number;
  planned_rounds: number;
  round_duration_seconds: number;
  mixer_cap: number;
}

export const DEFAULT_CONFIG: Omit<MixerConfig, 'event_id'> = {
  format: 'speed_rounds',
  tables_count: 12,
  seats_per_table: 6,
  planned_rounds: 7,
  round_duration_seconds: 360,
  mixer_cap: MIXER_CAP,
};

export type RoundStatus = 'pending' | 'active' | 'completed' | 'discarded';

export interface MixerRound {
  id: string;
  event_id: string;
  round_number: number;
  status: RoundStatus;
  tables_used: number;
  seats_per_table: number;
  duration_seconds: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string | null;
}

export interface MixerSeat {
  id: string;
  round_id: string;
  table_number: number;
  credential_id: string;
  person_id: string | null;
  display_name: string | null;
}

export interface MixCandidate {
  credentialId: string;
  personId: string | null;
  name: string;
  email: string;
  checkedInAt: string | null;
  participation: 'business_and_social' | 'social_only';
}

export async function loadMixerConfig(eventId: string): Promise<MixerConfig> {
  const { data, error } = await supabase
    .from('exchange_mixer_config')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { event_id: eventId, ...DEFAULT_CONFIG };
  return data as MixerConfig;
}

export async function saveMixerConfig(cfg: MixerConfig): Promise<void> {
  const { error } = await supabase
    .from('exchange_mixer_config')
    .upsert({
      event_id: cfg.event_id,
      format: cfg.format,
      tables_count: cfg.tables_count,
      seats_per_table: cfg.seats_per_table,
      planned_rounds: cfg.planned_rounds,
      round_duration_seconds: cfg.round_duration_seconds,
      mixer_cap: cfg.mixer_cap,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'event_id' });
  if (error) throw new Error(error.message);
}

export async function loadOverrides(eventId: string): Promise<Map<string, boolean>> {
  const { data, error } = await supabase
    .from('exchange_mixer_overrides')
    .select('credential_id, included')
    .eq('event_id', eventId)
    .limit(100000);
  if (error) throw new Error(error.message);
  const out = new Map<string, boolean>();
  for (const r of data ?? []) out.set(r.credential_id as string, r.included !== false);
  return out;
}

export async function setOverride(eventId: string, credentialId: string, included: boolean): Promise<void> {
  const { error } = await supabase
    .from('exchange_mixer_overrides')
    .upsert({ event_id: eventId, credential_id: credentialId, included, updated_at: new Date().toISOString() },
      { onConflict: 'event_id,credential_id' });
  if (error) throw new Error(error.message);
}

export async function loadRounds(eventId: string): Promise<{ rounds: MixerRound[]; seats: MixerSeat[] }> {
  const { data: rounds, error } = await supabase
    .from('exchange_rounds')
    .select('*')
    .eq('event_id', eventId)
    .order('round_number', { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  const ids = (rounds ?? []).map((r) => r.id as string);
  if (ids.length === 0) return { rounds: [], seats: [] };
  const { data: seats, error: seatErr } = await supabase
    .from('exchange_round_seats')
    .select('id, round_id, table_number, credential_id, person_id, display_name')
    .in('round_id', ids)
    .limit(100000);
  if (seatErr) throw new Error(seatErr.message);
  return { rounds: (rounds ?? []) as MixerRound[], seats: (seats ?? []) as MixerSeat[] };
}

/**
 * Who is eligible for the rounds right now.
 *
 * Checked in, on the mixer side, not a host, and not switched off by hand.
 * Hang-only guests join only when Adam opens that door.
 */
export function eligibleRoster(
  registrations: ExchangeRegistration[],
  overrides: Map<string, boolean>,
  opts: { allowHangOnly: boolean },
): MixCandidate[] {
  return registrations
    .filter((r) => r.credentialStatus !== 'voided')
    .filter((r) => Boolean(r.checkedInAt) || r.credentialStatus === 'used')
    .filter((r) => !r.isFounder)
    .filter((r) => (opts.allowHangOnly ? true : r.participation === 'business_and_social'))
    .filter((r) => overrides.get(r.credentialId) !== false)
    .map((r) => ({
      credentialId: r.credentialId,
      personId: r.personId,
      name: r.name || r.email || 'Guest',
      email: r.email,
      checkedInAt: r.checkedInAt,
      participation: r.participation,
    }))
    .sort((a, b) => (a.checkedInAt ?? '').localeCompare(b.checkedInAt ?? ''));
}

/**
 * A seat label fit for the wall.
 *
 * A registrant with no name anywhere falls back to their email address, which
 * wraps onto two lines on a phone and reads badly across a room. Only the part
 * before the @ goes up. Anything containing whitespace is a real name and is
 * left alone.
 */
export function seatDisplayName(raw: string | null | undefined): string {
  const v = (raw ?? '').trim();
  if (!v) return 'Guest';
  if (/\s/.test(v)) return v;
  const at = v.indexOf('@');
  if (at <= 0) return v;
  return v.slice(0, at).trim() || 'Guest';
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Who has already sat with whom, counted from COMPLETED rounds only. A mix that
 *  was discarded, or is still pending, never happened as far as history goes. */
export function buildPairHistory(rounds: MixerRound[], seats: MixerSeat[]): Map<string, number> {
  const completed = new Set(rounds.filter((r) => r.status === 'completed').map((r) => r.id));
  const byTable = new Map<string, string[]>();
  for (const s of seats) {
    if (!completed.has(s.round_id)) continue;
    const key = `${s.round_id}:${s.table_number}`;
    const list = byTable.get(key) ?? [];
    list.push(s.credential_id);
    byTable.set(key, list);
  }
  const history = new Map<string, number>();
  for (const list of byTable.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const k = pairKey(list[i], list[j]);
        history.set(k, (history.get(k) ?? 0) + 1);
      }
    }
  }
  return history;
}

export interface MixProposal {
  tables: MixCandidate[][];
  /** Pairs seated together who have met in a previous completed round. */
  repeatPairs: number;
  repeats: { a: string; b: string; times: number }[];
  seated: number;
  /** Bodies the table plan has no seat for. */
  unseated: MixCandidate[];
  tablesUsed: number;
  seatsPerTable: number;
}

function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function tableCost(table: MixCandidate[], history: Map<string, number>): number {
  let cost = 0;
  for (let i = 0; i < table.length; i++) {
    for (let j = i + 1; j < table.length; j++) {
      cost += history.get(pairKey(table[i].credentialId, table[j].credentialId)) ?? 0;
    }
  }
  return cost;
}

function totalCost(tables: MixCandidate[][], history: Map<string, number>): number {
  return tables.reduce((sum, t) => sum + tableCost(t, history), 0);
}

/** Cost of adding one person to a table: how much old ground they would re-tread. */
function joinCost(person: MixCandidate, table: MixCandidate[], history: Map<string, number>): number {
  let cost = 0;
  for (const other of table) cost += history.get(pairKey(person.credentialId, other.credentialId)) ?? 0;
  return cost;
}

function greedyAssign(
  people: MixCandidate[],
  sizes: number[],
  history: Map<string, number>,
): MixCandidate[][] {
  const tables: MixCandidate[][] = sizes.map(() => []);
  for (const person of people) {
    let best = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    let ties: number[] = [];
    for (let t = 0; t < tables.length; t++) {
      if (tables[t].length >= sizes[t]) continue;
      const cost = joinCost(person, tables[t], history);
      if (cost < bestCost) { bestCost = cost; best = t; ties = [t]; }
      else if (cost === bestCost) ties.push(t);
    }
    if (best < 0) continue;
    // Among equally good tables prefer the emptiest, then break the tie at
    // random so the same roster does not produce the same seating every time.
    const minOccupancy = Math.min(...ties.map((t) => tables[t].length));
    const pool = ties.filter((t) => tables[t].length === minOccupancy);
    tables[pool[Math.floor(Math.random() * pool.length)]].push(person);
  }
  return tables;
}

/** Swap people between tables while it strictly reduces repeat cost. */
function improve(tables: MixCandidate[][], history: Map<string, number>, maxPasses = 12): void {
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    for (let a = 0; a < tables.length; a++) {
      for (let b = a + 1; b < tables.length; b++) {
        for (let i = 0; i < tables[a].length; i++) {
          for (let j = 0; j < tables[b].length; j++) {
            const before = tableCost(tables[a], history) + tableCost(tables[b], history);
            const pa = tables[a][i];
            const pb = tables[b][j];
            tables[a][i] = pb;
            tables[b][j] = pa;
            const after = tableCost(tables[a], history) + tableCost(tables[b], history);
            if (after < before) { improved = true; }
            else { tables[a][i] = pa; tables[b][j] = pb; }
          }
        }
      }
    }
    if (!improved) return;
  }
}

/**
 * Propose a seating for the next round.
 *
 * Shuffle, fill the tables, then repair: a handful of random restarts each
 * polished by swap-improvement. Repeats survive only when the arithmetic leaves
 * no alternative, and the count is reported honestly either way.
 */
export function proposeMix(args: {
  candidates: MixCandidate[];
  tablesCount: number;
  seatsPerTable: number;
  history: Map<string, number>;
  restarts?: number;
  budgetMs?: number;
}): MixProposal {
  const { candidates, tablesCount, seatsPerTable, history } = args;
  // Restarts are cheap when the answer is easy (it stops at the first clean mix)
  // and worth paying for when it is not. The budget keeps a phone responsive.
  const restarts = args.restarts ?? 40;
  const deadline = Date.now() + (args.budgetMs ?? 1500);

  const tablesUsed = Math.max(1, Math.min(tablesCount, Math.ceil(candidates.length / Math.max(1, seatsPerTable))));
  const capacity = tablesUsed * seatsPerTable;

  let bestTables: MixCandidate[][] = [];
  let bestUnseated: MixCandidate[] = [];
  let bestCost = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < restarts; attempt++) {
    if (attempt >= 4 && Date.now() > deadline) break;
    const order = shuffled(candidates);
    const seatable = order.slice(0, capacity);
    const unseated = order.slice(capacity);
    // Spread evenly rather than filling table 1 to the brim: a table of six and
    // a table of two is a worse room than two tables of four.
    const base = Math.floor(seatable.length / tablesUsed);
    const remainder = seatable.length % tablesUsed;
    const sizes = Array.from({ length: tablesUsed }, (_, i) => Math.min(seatsPerTable, base + (i < remainder ? 1 : 0)));

    const tables = greedyAssign(seatable, sizes, history);
    improve(tables, history);
    const cost = totalCost(tables, history);
    if (cost < bestCost) {
      bestCost = cost;
      bestTables = tables;
      bestUnseated = unseated;
      if (cost === 0) break;
    }
  }

  const repeats: { a: string; b: string; times: number }[] = [];
  for (const table of bestTables) {
    for (let i = 0; i < table.length; i++) {
      for (let j = i + 1; j < table.length; j++) {
        const times = history.get(pairKey(table[i].credentialId, table[j].credentialId)) ?? 0;
        if (times > 0) repeats.push({ a: table[i].name, b: table[j].name, times });
      }
    }
  }

  return {
    tables: bestTables,
    repeatPairs: repeats.length,
    repeats,
    seated: bestTables.reduce((n, t) => n + t.length, 0),
    unseated: bestUnseated,
    tablesUsed,
    seatsPerTable,
  };
}

/** Writes the proposal as a pending round. Nothing is live until START. */
export async function createPendingRound(args: {
  eventId: string;
  roundNumber: number;
  proposal: MixProposal;
  durationSeconds: number;
}): Promise<MixerRound> {
  const { eventId, roundNumber, proposal, durationSeconds } = args;
  const { data: round, error } = await supabase
    .from('exchange_rounds')
    .insert({
      event_id: eventId,
      round_number: roundNumber,
      status: 'pending',
      tables_used: proposal.tablesUsed,
      seats_per_table: proposal.seatsPerTable,
      duration_seconds: durationSeconds,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  const seatRows = proposal.tables.flatMap((table, idx) =>
    table.map((p) => ({
      round_id: round.id as string,
      table_number: idx + 1,
      credential_id: p.credentialId,
      person_id: p.personId,
      display_name: p.name,
    })),
  );
  if (seatRows.length > 0) {
    const { error: seatErr } = await supabase.from('exchange_round_seats').insert(seatRows);
    if (seatErr) {
      // A round with no seats is worse than no round at all.
      await supabase.from('exchange_rounds').update({ status: 'discarded' }).eq('id', round.id);
      throw new Error(seatErr.message);
    }
  }
  return round as MixerRound;
}

export async function setRoundStatus(
  roundId: string,
  status: RoundStatus,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase.from('exchange_rounds').update({ status, ...extra }).eq('id', roundId);
  if (error) throw new Error(error.message);
}

export const discardRound = (roundId: string) => setRoundStatus(roundId, 'discarded');
export const startRound = (roundId: string) => setRoundStatus(roundId, 'active', { started_at: new Date().toISOString() });
export const endRound = (roundId: string) => setRoundStatus(roundId, 'completed', { ended_at: new Date().toISOString() });

export async function setRoundDuration(roundId: string, seconds: number): Promise<void> {
  const { error } = await supabase.from('exchange_rounds').update({ duration_seconds: seconds }).eq('id', roundId);
  if (error) throw new Error(error.message);
}

/** The round on the board: the active one, else the pending proposal. */
export function currentRound(rounds: MixerRound[]): MixerRound | null {
  return rounds.find((r) => r.status === 'active')
    ?? rounds.filter((r) => r.status === 'pending').sort((a, b) => b.round_number - a.round_number)[0]
    ?? null;
}

/** Reshuffling reuses the number, so "Round 3" is whatever Adam is on. */
export function nextRoundNumber(rounds: MixerRound[]): number {
  const live = rounds.filter((r) => r.status !== 'discarded');
  return live.length === 0 ? 1 : Math.max(...live.map((r) => r.round_number)) + 1;
}
