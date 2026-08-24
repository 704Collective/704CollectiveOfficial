'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { loadRounds, currentRound, type MixerRound, type MixerSeat } from '@/lib/admin/exchange-mixer';

// The board is what the room looks at. It renders as a full-viewport overlay so
// it covers the admin chrome without needing a route outside the admin gate.

const DEFAULT_EVENT_ID =
  process.env.NEXT_PUBLIC_EXCHANGE_EVENT_ID || '02afde72-33c4-4c99-8dba-0ea5a8c0a723';

const REFRESH_MS = 8000;

function BoardInner() {
  const params = useSearchParams();
  const eventId = params.get('event') || DEFAULT_EVENT_ID;

  const [rounds, setRounds] = useState<MixerRound[]>([]);
  const [seats, setSeats] = useState<MixerSeat[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { rounds: r, seats: s } = await loadRounds(eventId);
      setRounds(r);
      setSeats(s);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the board');
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const live = currentRound(rounds);
  const tables = useMemo(() => {
    if (!live) return [];
    const map = new Map<number, MixerSeat[]>();
    for (const s of seats) {
      if (s.round_id !== live.id) continue;
      const list = map.get(s.table_number) ?? [];
      list.push(s);
      map.set(s.table_number, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [live, seats]);

  const remaining = live?.started_at
    ? live.duration_seconds - Math.floor((now - new Date(live.started_at).getTime()) / 1000)
    : (live?.duration_seconds ?? 0);
  const clock = `${Math.floor(Math.max(0, remaining) / 60)}:${String(Math.max(0, remaining) % 60).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black text-white" data-testid="board">
      <div className="flex items-baseline justify-between gap-4 border-b border-white/10 px-5 py-3 sm:px-8">
        <div className="flex items-baseline gap-4">
          <h1 className="text-2xl font-bold sm:text-4xl" data-testid="board-round">
            {live ? `Round ${live.round_number}` : 'The Exchange'}
          </h1>
          {live && <span className="text-sm uppercase tracking-wider text-white/40">{live.status}</span>}
        </div>
        <div className="flex items-baseline gap-4">
          <span className="text-3xl font-bold tabular-nums sm:text-5xl" data-testid="board-clock">{clock}</span>
          <Link href={`/admin/exchange/mixer?event=${eventId}`} className="text-white/40 hover:text-white" aria-label="Close board">
            <X className="h-6 w-6" />
          </Link>
        </div>
      </div>

      {error && <p className="px-5 py-4 text-lg text-red-400 sm:px-8">{error}</p>}

      {!live ? (
        <p className="px-5 py-16 text-center text-2xl text-white/40 sm:px-8">Waiting for the first mix.</p>
      ) : (
        <div className="grid gap-4 px-5 py-5 sm:px-8 sm:py-8 md:grid-cols-2 xl:grid-cols-3">
          {tables.map(([num, list]) => (
            <section key={num} className="rounded-2xl border border-white/15 p-4 sm:p-6" data-testid={`board-table-${num}`}>
              <h2 className="mb-2 text-xl font-bold text-[#C6A664] sm:mb-3 sm:text-3xl">Table {num}</h2>
              <ul className="space-y-1 sm:space-y-2">
                {list.map((s) => (
                  <li key={s.id} className="text-lg leading-tight sm:text-2xl">{s.display_name}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BoardPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
      <BoardInner />
    </Suspense>
  );
}
