'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Search, ChevronLeft, ChevronRight, Download, RefreshCw, Shuffle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  loadExchangeEvents,
  loadExchangeRegistrations,
  orDash,
  MIXER_CAP,
  POOL_CAPS,
  SOURCE_TRACKING_SINCE,
  type EventOption,
  type ExchangeRegistration,
} from '@/lib/admin/exchange';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { UpdatedAgo } from '@/components/admin/UpdatedAgo';
import { ExchangePersonSheet } from '@/components/admin/ExchangePersonSheet';

const PAGE_SIZE = 25;

/** Counts, pools and roster refresh on their own; the room changes all night. */
const POLL_MS = 10000;

/** The Aug 27 Exchange. The page is event-keyed; this is only the default pick. */
const DEFAULT_EVENT_ID =
  process.env.NEXT_PUBLIC_EXCHANGE_EVENT_ID || '02afde72-33c4-4c99-8dba-0ea5a8c0a723';

const DOOR_LABEL: Record<string, string> = {
  public: 'Public',
  commonwealth: 'Commonwealth',
  invited: 'Invited',
  member_rsvp: 'Member RSVP',
};

const MEMBER_BADGE: Record<string, string> = {
  member: 'bg-green-500/15 text-green-400',
  guest: 'bg-purple-500/15 text-purple-400',
  lead: 'bg-blue-500/15 text-blue-400',
};

type ParticipationFilter = 'all' | 'business_and_social' | 'social_only';
type AnswersFilter = 'all' | 'answered' | 'skipped';

function SummaryCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-normal">{label}</p>
      <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
      {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
    </div>
  );
}

function Pill({
  active, label, count, onClick,
}: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary text-primary-foreground transition-colors whitespace-nowrap'
        : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap'}
    >
      {label}
      {count !== undefined && (
        <span className={active
          ? 'bg-primary-foreground/20 text-primary-foreground ml-0.5 px-1.5 py-0 text-[11px] leading-5 font-normal rounded-full'
          : 'bg-muted text-muted-foreground ml-0.5 px-1.5 py-0 text-[11px] leading-5 font-normal rounded-full'}>
          {count}
        </span>
      )}
    </button>
  );
}

function RegistrationRows({
  rows, onSelect,
}: { rows: ExchangeRegistration[]; onSelect: (r: ExchangeRegistration) => void }) {
  return (
    <>
      {rows.map((r) => {
        return (
            <TableRow
              key={r.credentialId}
              className="cursor-pointer border-b border-border hover:bg-muted/50"
              onClick={() => onSelect(r)}
              data-testid={`reg-row-${r.email}`}
            >
              <TableCell className="px-4 py-3 font-medium text-foreground">
                <div className="flex items-center gap-2">
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  <span>{orDash(r.name)}</span>
                  {r.isFounder && (
                    <span className="text-[10px] rounded-md bg-amber-500/15 text-amber-400 px-1.5 py-0.5 font-normal">Host</span>
                  )}
                  {r.credentialStatus === 'voided' && (
                    <span className="text-[10px] rounded-md bg-red-500/15 text-red-400 px-1.5 py-0.5 font-normal">Voided</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="px-4 py-3 text-sm text-muted-foreground">{orDash(r.email)}</TableCell>
              <TableCell className="px-4 py-3">
                <span className={`text-[11px] capitalize font-normal rounded-md px-1.5 py-0.5 ${MEMBER_BADGE[r.memberStatus]}`}>
                  {r.memberStatus}
                </span>
              </TableCell>
              <TableCell className="px-4 py-3 text-sm text-muted-foreground capitalize">{orDash(r.tier)}</TableCell>
              <TableCell className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{DOOR_LABEL[r.door]}</TableCell>
              <TableCell className="px-4 py-3 text-sm text-muted-foreground">{r.sourceLabel}</TableCell>
              <TableCell className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                {r.participation === 'social_only' ? 'Hang only' : 'Mixer'}
                {r.isMemberRsvpOnly && <span className="text-muted-foreground/60"> (member RSVP)</span>}
              </TableCell>
              <TableCell className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                {r.answersState === 'answered' ? '4 of 4' : r.answersState === 'partial' ? `${r.answeredCount} of 4` : 'None'}
              </TableCell>
              <TableCell className="px-4 py-3">
                <div className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${r.checkedInAt ? 'bg-green-500' : 'bg-muted-foreground/50'}`} />
                  {r.checkedInAt ? format(new Date(r.checkedInAt), 'h:mm a') : 'No'}
                </div>
              </TableCell>
              <TableCell className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                {r.registeredAt ? format(new Date(r.registeredAt), 'MMM d, h:mm a') : '-'}
              </TableCell>
            </TableRow>
        );
      })}
    </>
  );
}

function ExchangePageInner() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventId, setEventId] = useState<string>(DEFAULT_EVENT_ID);
  const [rows, setRows] = useState<ExchangeRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeVoided, setIncludeVoided] = useState(false);

  const [search, setSearch] = useState('');
  const [participation, setParticipation] = useState<ParticipationFilter>('all');
  const [door, setDoor] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [source, setSource] = useState<string>('all');
  const [memberStatus, setMemberStatus] = useState<string>('all');
  const [answersFilter, setAnswersFilter] = useState<AnswersFilter>('all');
  const [page, setPage] = useState(0);

  const [poolCounts, setPoolCounts] = useState<Record<string, number>>({});
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  // The sheet is keyed by credential id rather than holding the row object, so
  // a 10s background refresh re-derives it in place: the sheet stays open and
  // its contents go live instead of freezing at whatever was on screen when it
  // opened. Looked up against the full load, not `filtered`, so changing a
  // filter underneath cannot yank the sheet shut.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    loadExchangeEvents()
      .then((list) => {
        setEvents(list);
        // Only fall back when the default event genuinely has nothing here.
        if (list.length > 0 && !list.some((e) => e.id === DEFAULT_EVENT_ID)) {
          setEventId(list[0].id);
        }
      })
      .catch(() => toast.error('Failed to load events'));
  }, []);

  // quiet = a background refresh: no spinner, no table swapped for "Loading...",
  // and a failure stays silent rather than throwing a toast every 10 seconds at
  // someone running a room. The stamp going stale is the signal instead.
  const load = useCallback(async (quiet = false) => {
    if (!eventId) return;
    if (!quiet) setLoading(true);
    try {
      const { registrations, poolCounts: pools } = await loadExchangeRegistrations(eventId, { includeVoided });
      setRows(registrations);
      setPoolCounts(pools);
      setLastUpdatedAt(Date.now());
    } catch (e) {
      console.error(e);
      if (!quiet) toast.error(e instanceof Error ? e.message : 'Failed to load registrations');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [eventId, includeVoided]);

  useEffect(() => { load(); }, [load]);

  // Background refreshes are HELD while the admin is off page 0, because a
  // refetch that changes the row count re-slices the window and moves rows out
  // from under whoever is reading them. Returning to page 0 resumes.
  const holdForPaging = page > 0;

  useEffect(() => {
    if (holdForPaging) return;
    const t = setInterval(() => { void load(true); }, POLL_MS);
    return () => clearInterval(t);
  }, [load, holdForPaging]);

  // A backgrounded tab throttles its timers, so the numbers can be minutes old
  // by the time the phone comes back out of a pocket. Catch up on return.
  const holdRef = useRef(holdForPaging);
  holdRef.current = holdForPaging;
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !holdRef.current) void load(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const sourceOptions = useMemo(
    () => [...new Set(rows.map((r) => r.sourceLabel))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    let out = rows;
    if (participation !== 'all') out = out.filter((r) => r.participation === participation);
    if (door !== 'all') out = out.filter((r) => r.door === door);
    if (status !== 'all') {
      out = status === 'checked_in'
        ? out.filter((r) => Boolean(r.checkedInAt))
        : status === 'not_checked_in'
          ? out.filter((r) => !r.checkedInAt)
          : out.filter((r) => r.credentialStatus === status);
    }
    if (source !== 'all') out = out.filter((r) => r.sourceLabel === source);
    if (memberStatus !== 'all') out = out.filter((r) => r.memberStatus === memberStatus);
    if (answersFilter !== 'all') {
      out = answersFilter === 'answered'
        ? out.filter((r) => r.answersState === 'answered')
        : out.filter((r) => r.answersState !== 'answered');
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) => r.email.includes(q) || r.name.toLowerCase().includes(q));
    }
    return out;
  }, [rows, participation, door, status, source, memberStatus, answersFilter, search]);

  const mixerRows = filtered.filter((r) => r.participation === 'business_and_social');
  const hangRows = filtered.filter((r) => r.participation === 'social_only');

  const selectedPerson = useMemo(
    () => rows.find((r) => r.credentialId === selectedId) ?? null,
    [rows, selectedId],
  );

  // Summary is about the night, not the current filter: it reads the full load.
  const summary = useMemo(() => {
    const live = rows.filter((r) => r.credentialStatus !== 'voided');
    const mixer = live.filter((r) => r.participation === 'business_and_social' && !r.isFounder);
    const hang = live.filter((r) => r.participation === 'social_only');
    return {
      total: live.length,
      mixer: mixer.length,
      hang: hang.length,
      checkedIn: live.filter((r) => Boolean(r.checkedInAt)).length,
    };
  }, [rows]);

  const handleExportCSV = () => {
    const rowsOut = [
      ['Name', 'Email', 'Phone', 'Member Status', 'Tier', 'Door', 'Source', 'Participation', 'Answers', 'Checked In', 'Registered', 'Host', 'Credential Status', 'Pool', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Content', 'Role/Title', 'Company', 'Years in Charlotte', 'Seeking'],
      ...filtered.map((r) => [
        r.name || '',
        r.email,
        (r.phone ?? '').trim(),
        r.memberStatus,
        r.tier,
        DOOR_LABEL[r.door],
        r.sourceLabel,
        r.participation === 'social_only' ? 'Hang only' : (r.isMemberRsvpOnly ? 'Mixer (member RSVP)' : 'Mixer'),
        r.answersState === 'answered' ? '4 of 4' : r.answersState === 'partial' ? `${r.answeredCount} of 4` : (r.skipReason ?? 'None'),
        r.checkedInAt ? format(new Date(r.checkedInAt), 'yyyy-MM-dd HH:mm') : '',
        r.registeredAt ? format(new Date(r.registeredAt), 'yyyy-MM-dd HH:mm') : '',
        r.isFounder ? 'yes' : '',
        r.credentialStatus,
        r.pool,
        r.utm.utm_source ?? '',
        r.utm.utm_medium ?? '',
        r.utm.utm_campaign ?? '',
        r.utm.utm_content ?? '',
        (r.intake?.q_role_title ?? '').replace(/"/g, "'"),
        (r.intake?.q_company ?? '').replace(/"/g, "'"),
        (r.intake?.q_years_charlotte ?? '').replace(/"/g, "'"),
        (r.intake?.q_seeking ?? '').replace(/"/g, "'").replace(/[\r\n]+/g, ' '),
      ]),
    ];
    const csv = rowsOut.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exchange-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Registrations exported');
  };

  const total = filtered.length;
  const start = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const end = Math.min((page + 1) * PAGE_SIZE, total);
  const pagedMixer = mixerRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const mixerShown = pagedMixer.length;
  // Hang-only continues the same paging window once the mixer rows run out.
  const hangStart = Math.max(0, page * PAGE_SIZE - mixerRows.length);
  const pagedHang = hangRows.slice(hangStart, hangStart + (PAGE_SIZE - mixerShown));

  const resetFilters = () => {
    setParticipation('all'); setDoor('all'); setStatus('all'); setSource('all');
    setMemberStatus('all'); setAnswersFilter('all'); setSearch(''); setPage(0);
  };

  const header = (
    <TableHeader>
      <TableRow className="bg-muted/50 hover:bg-muted/50">
        {['Name', 'Email', 'Member', 'Tier', 'Door', 'Source', 'Participation', 'Answers', 'Checked In', 'Registered'].map((h) => (
          <TableHead key={h} className="text-xs uppercase tracking-wider text-muted-foreground/70 px-4 py-3 font-normal whitespace-nowrap">{h}</TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Sparkles className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              The Exchange <span className="text-muted-foreground font-semibold">({summary.total})</span>
            </h1>
            <p className="text-sm text-muted-foreground">Registrations, read-only.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <UpdatedAgo
            at={lastUpdatedAt}
            paused={holdForPaging ? `paused on page ${page + 1}` : undefined}
            className="mr-1"
          />
          {/* Arrow function, not a bare `load`: onClick would hand the click
              event in as `quiet` and silently suppress the spinner. */}
          <Button variant="outline" className="gap-2" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleExportCSV}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href={`/admin/exchange/mixer?event=${eventId}`}><Shuffle className="w-4 h-4" /> Mixer</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:max-w-sm">
          <Select value={eventId} onValueChange={(v) => { setEventId(v); setPage(0); }}>
            <SelectTrigger data-testid="event-select"><SelectValue placeholder="Choose an event" /></SelectTrigger>
            <SelectContent>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.title} - {format(new Date(e.start_time), 'MMM d, yyyy')}
                </SelectItem>
              ))}
              {events.length === 0 && <SelectItem value={DEFAULT_EVENT_ID}>The Exchange</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            data-testid="include-voided"
            checked={includeVoided}
            onChange={(e) => { setIncludeVoided(e.target.checked); setPage(0); }}
            className="h-4 w-4 rounded border-border"
          />
          Include voided
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Registered" value={String(summary.total)} note="live credentials" />
        <SummaryCard label="Mixer" value={String(summary.mixer)} note={`cap ${MIXER_CAP} - hosts excluded`} />
        <SummaryCard label="Hang only" value={String(summary.hang)} />
        <SummaryCard label="House pool" value={`${poolCounts.house ?? 0} of ${POOL_CAPS.house}`} />
        <SummaryCard label="Commonwealth" value={`${poolCounts.commonwealth ?? 0} of ${POOL_CAPS.commonwealth}`} />
        <SummaryCard label="Checked in" value={`${summary.checkedIn} of ${summary.total}`} />
      </div>

      <div className="w-full max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            id="exchange-search"
            className="pl-9"
            placeholder="Search name or email..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <Pill active={participation === 'all'} label="All" count={rows.length} onClick={() => { setParticipation('all'); setPage(0); }} />
        <Pill active={participation === 'business_and_social'} label="Mixer" count={rows.filter(r => r.participation === 'business_and_social').length} onClick={() => { setParticipation('business_and_social'); setPage(0); }} />
        <Pill active={participation === 'social_only'} label="Hang only" count={rows.filter(r => r.participation === 'social_only').length} onClick={() => { setParticipation('social_only'); setPage(0); }} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Select value={door} onValueChange={(v) => { setDoor(v); setPage(0); }}>
          <SelectTrigger data-testid="filter-door"><SelectValue placeholder="Door" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All doors</SelectItem>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="commonwealth">Commonwealth</SelectItem>
            <SelectItem value="invited">Invited</SelectItem>
            <SelectItem value="member_rsvp">Member RSVP</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
          <SelectTrigger data-testid="filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="checked_in">Checked in</SelectItem>
            <SelectItem value="not_checked_in">Not checked in</SelectItem>
            <SelectItem value="active">Credential active</SelectItem>
            <SelectItem value="used">Credential used</SelectItem>
            <SelectItem value="voided">Credential voided</SelectItem>
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={(v) => { setSource(v); setPage(0); }}>
          <SelectTrigger data-testid="filter-source"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {sourceOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={memberStatus} onValueChange={(v) => { setMemberStatus(v); setPage(0); }}>
          <SelectTrigger data-testid="filter-member"><SelectValue placeholder="Member status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Members and guests</SelectItem>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="guest">Guest</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
          </SelectContent>
        </Select>
        <Select value={answersFilter} onValueChange={(v) => { setAnswersFilter(v as AnswersFilter); setPage(0); }}>
          <SelectTrigger data-testid="filter-answers"><SelectValue placeholder="Answers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Answered or not</SelectItem>
            <SelectItem value="answered">Answered</SelectItem>
            <SelectItem value="skipped">Skipped or partial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground border border-border rounded-lg px-3 py-2">
        Source tracking began {SOURCE_TRACKING_SINCE}; earlier registrations show Direct/Organic.
      </p>

      {loading ? (
        <div className="rounded-lg border border-border py-10 text-center text-muted-foreground">Loading...</div>
      ) : total === 0 ? (
        <div className="rounded-lg border border-border py-10 text-center text-muted-foreground">
          No registrations match these filters.
          <div className="mt-3"><Button variant="outline" size="sm" onClick={resetFilters}>Clear filters</Button></div>
        </div>
      ) : (
        <>
          {pagedMixer.length > 0 && (
            <section className="space-y-2" data-testid="section-mixer">
              <h2 className="text-lg font-semibold text-foreground">
                Mixer <span className="text-muted-foreground font-normal">({mixerRows.length})</span>
              </h2>
              {/* One scroller, on the element that owns the rounded border, so
                  the off-edge columns are reachable and the header row is cut
                  by a real scroll viewport instead of a nested overflow. */}
              <div className="rounded-lg border border-border overflow-x-auto" data-testid="roster-scroll-mixer">
                <Table className="min-w-max">{header}<TableBody><RegistrationRows rows={pagedMixer} onSelect={(r) => setSelectedId(r.credentialId)} /></TableBody></Table>
              </div>
            </section>
          )}

          {pagedHang.length > 0 && (
            <section className="space-y-2" data-testid="section-hang">
              <h2 className="text-lg font-semibold text-foreground">
                Hang only <span className="text-muted-foreground font-normal">({hangRows.length})</span>
              </h2>
              <div className="rounded-lg border border-border overflow-x-auto" data-testid="roster-scroll-hang">
                <Table className="min-w-max">{header}<TableBody><RegistrationRows rows={pagedHang} onSelect={(r) => setSelectedId(r.credentialId)} /></TableBody></Table>
              </div>
            </section>
          )}
        </>
      )}

      {total > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Showing {start}-{end} of {total}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <ExchangePersonSheet
        person={selectedPerson}
        open={selectedPerson !== null}
        onOpenChange={(next) => { if (!next) setSelectedId(null); }}
      />
    </div>
  );
}

export default function AdminExchangePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ExchangePageInner />
    </Suspense>
  );
}
