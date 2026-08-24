import { supabase } from '@/integrations/supabase/client';

// Shared data layer for the Exchange admin surfaces: the read-only viewer and
// the mixer engine both hang off this so the two can never disagree about who
// is registered, who is on the mixer side, and who is a host.

/** Registration is credential-keyed: the credential is the seat. */
export const CREDENTIAL_STATUSES_LIVE = ['active', 'used'] as const;

/** Per-pool door caps, mirroring POOL_CAPS in the exchange-intake-submit function. */
export const POOL_CAPS: Record<string, number> = { house: 60, commonwealth: 60 };

/** Seats in the room for the structured rounds. */
export const MIXER_CAP = 72;

/**
 * The people running the night. They still appear in every list — Adam needs to
 * see his own row — but they are not counted toward the mixer headcount and they
 * are never seated in a round. All three of Timi's identities are here on
 * purpose: she exists under a member email and two personal ones.
 */
export const FOUNDER_EMAILS = new Set([
  'adam@cltbucketlist.com',
  'baumanngabbi@gmail.com',
  'hello@704collective.com',
  'timi@cltbucketlist.com',
  'deaktimid@gmail.com',
  'dtimi22@gmail.com',
]);

export function isFounderEmail(email: string | null | undefined): boolean {
  return Boolean(email && FOUNDER_EMAILS.has(email.trim().toLowerCase()));
}

/** Empty strings are as common as nulls in this data: phone and last_name are
 *  NOT NULL but happily hold ''. Everything user-facing goes through here. */
export function orDash(v: string | null | undefined): string {
  const t = (v ?? '').trim();
  return t === '' ? '-' : t;
}

export type Door = 'public' | 'commonwealth' | 'invited' | 'member_rsvp';
export type Participation = 'business_and_social' | 'social_only';
export type MemberStatusWord = 'member' | 'guest' | 'lead';

export interface ExchangeIntakeRow {
  id: string;
  event_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  credential_id: string | null;
  person_id: string | null;
  profile_id: string | null;
  form_variant: string | null;
  pool: string | null;
  participation: string | null;
  member_status_at_submit: string | null;
  status: string | null;
  q_role_title: string | null;
  q_company: string | null;
  q_years_charlotte: string | null;
  q_seeking: string | null;
  submitted_at: string | null;
  created_at: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
}

export interface ExchangeRegistration {
  /** The credential id. The stable identity of a registration. */
  credentialId: string;
  credentialToken: string | null;
  credentialType: string | null;
  credentialStatus: string;
  checkedInAt: string | null;
  registeredAt: string | null;
  pool: string;
  personId: string | null;

  name: string;
  email: string;
  phone: string;

  memberStatus: MemberStatusWord;
  tier: string;
  door: Door;
  participation: Participation;
  /** A live member RSVP that never went through an intake form. */
  isMemberRsvpOnly: boolean;
  isFounder: boolean;

  answers: { label: string; value: string }[];
  answeredCount: number;
  answersState: 'answered' | 'partial' | 'skipped';
  /** Why a zero-answer row is legitimately empty. */
  skipReason: string | null;

  utm: { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null };
  sourceLabel: string;

  intake: ExchangeIntakeRow | null;
}

/**
 * Ad source, human-readable. utm_content is matched case-insensitively after
 * URL-decoding, because the ad platform hands back `Video%20A` and `photo+b`
 * for the same two creatives.
 */
export function sourceLabel(utm: {
  utm_source: string | null;
  utm_content: string | null;
}): string {
  const decode = (v: string | null) => {
    if (!v) return '';
    let out = v.replace(/\+/g, ' ');
    try { out = decodeURIComponent(out); } catch { /* a stray % is not worth losing the label over */ }
    return out.toLowerCase();
  };
  const content = decode(utm.utm_content);
  if (content.includes('video')) return 'Facebook Ad (Video)';
  if (content.includes('photo')) return 'Facebook Ad (Photo)';
  const src = (utm.utm_source ?? '').trim();
  if (src) return src;
  return 'Direct/Organic';
}

/** The date source tracking shipped. Registrations before it cannot have UTM. */
export const SOURCE_TRACKING_SINCE = 'August 24, 2026';

const ANSWER_LABELS: [keyof ExchangeIntakeRow, string][] = [
  ['q_role_title', 'Role or title'],
  ['q_company', 'Company'],
  ['q_years_charlotte', 'Years in Charlotte'],
  ['q_seeking', 'Looking to connect with'],
];

function metaString(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function metaUtm(meta: unknown) {
  const empty = { utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null };
  if (!meta || typeof meta !== 'object') return empty;
  const raw = (meta as Record<string, unknown>)['utm'];
  if (!raw || typeof raw !== 'object') return empty;
  const src = raw as Record<string, unknown>;
  const pick = (k: string) => (typeof src[k] === 'string' && (src[k] as string).trim() ? (src[k] as string).trim() : null);
  return {
    utm_source: pick('utm_source'),
    utm_medium: pick('utm_medium'),
    utm_campaign: pick('utm_campaign'),
    utm_content: pick('utm_content'),
  };
}

export interface EventOption {
  id: string;
  title: string;
  start_time: string;
}

/** Events worth pointing this page at: anything with intake rows or a mixer config. */
export async function loadExchangeEvents(): Promise<EventOption[]> {
  const [intake, config] = await Promise.all([
    supabase.from('exchange_intake').select('event_id').limit(100000),
    supabase.from('exchange_mixer_config').select('event_id').limit(1000),
  ]);
  const ids = new Set<string>();
  for (const r of intake.data ?? []) if (r.event_id) ids.add(r.event_id as string);
  for (const r of config.data ?? []) if (r.event_id) ids.add(r.event_id as string);
  if (ids.size === 0) return [];
  const { data } = await supabase
    .from('events')
    .select('id, title, start_time')
    .in('id', [...ids])
    .order('start_time', { ascending: false });
  return (data ?? []) as EventOption[];
}

export interface LoadedExchange {
  registrations: ExchangeRegistration[];
  /** Pool usage counted the credential way: every live credential lands in a
   *  pool, defaulting to house when the tag is missing. Matches the function. */
  poolCounts: Record<string, number>;
  /** Intake rows with no live credential — invited-but-never-registered, and the
   *  rows whose credential was voided. Surfaced so nobody goes missing. */
  intakeWithoutCredential: ExchangeIntakeRow[];
}

/**
 * Every registration for one event. Read-only: this touches nothing.
 *
 * Credentials are the spine. Intake rows attach by credential_id first and by
 * email second, because the healed rows and the invited rows were linked at
 * different times by different code paths.
 */
export async function loadExchangeRegistrations(
  eventId: string,
  opts: { includeVoided?: boolean } = {},
): Promise<LoadedExchange> {
  const statuses = opts.includeVoided
    ? ['active', 'used', 'voided']
    : [...CREDENTIAL_STATUSES_LIVE];

  const [credRes, intakeRes] = await Promise.all([
    supabase
      .from('attendance_credentials')
      .select('id, token, person_id, credential_type, status, checked_in_at, metadata, created_at')
      .eq('event_id', eventId)
      .in('status', statuses)
      .limit(100000),
    supabase
      .from('exchange_intake')
      .select('*')
      .eq('event_id', eventId)
      .limit(100000),
  ]);

  if (credRes.error) throw new Error(credRes.error.message);
  if (intakeRes.error) throw new Error(intakeRes.error.message);

  const creds = (credRes.data ?? []) as {
    id: string; token: string | null; person_id: string | null; credential_type: string | null;
    status: string; checked_in_at: string | null; metadata: unknown; created_at: string | null;
  }[];
  const intakeRows = (intakeRes.data ?? []) as ExchangeIntakeRow[];

  const personIds = [...new Set(creds.map((c) => c.person_id).filter(Boolean))] as string[];
  const peopleRes = personIds.length
    ? await supabase
        .from('people')
        .select('id, full_name, email, phone, roles, member_status, member_tier, auth_user_id')
        .in('id', personIds)
        .limit(100000)
    : { data: [], error: null };
  const people = (peopleRes.data ?? []) as {
    id: string; full_name: string | null; email: string | null; phone: string | null;
    roles: string[] | null; member_status: string | null; member_tier: string | null; auth_user_id: string | null;
  }[];
  const personById = new Map(people.map((p) => [p.id, p]));

  const emails = new Set<string>();
  for (const p of people) if (p.email) emails.add(p.email.toLowerCase());
  for (const r of intakeRows) if (r.email) emails.add(r.email.toLowerCase());
  const profileRes = emails.size
    ? await supabase
        .from('profiles')
        .select('id, email, full_name, phone, member_type, subscription_status, membership_override, role')
        .in('email', [...emails])
        .limit(100000)
    : { data: [], error: null };
  const profiles = (profileRes.data ?? []) as {
    id: string; email: string | null; full_name: string | null; phone: string | null;
    member_type: string | null; subscription_status: string | null; membership_override: boolean | null; role: string | null;
  }[];
  const profileByEmail = new Map(profiles.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p]));

  const intakeByCredential = new Map<string, ExchangeIntakeRow>();
  const intakeByEmail = new Map<string, ExchangeIntakeRow>();
  for (const r of intakeRows) {
    if (r.credential_id) intakeByCredential.set(r.credential_id, r);
    if (r.email) {
      const k = r.email.toLowerCase();
      // A submitted row always beats a merely-invited one for the same email.
      const prior = intakeByEmail.get(k);
      if (!prior || (prior.status !== 'submitted' && r.status === 'submitted')) intakeByEmail.set(k, r);
    }
  }

  const claimedIntakeIds = new Set<string>();
  const registrations: ExchangeRegistration[] = [];
  const poolCounts: Record<string, number> = {};

  for (const c of creds) {
    const person = c.person_id ? personById.get(c.person_id) ?? null : null;
    const personEmail = (person?.email ?? '').toLowerCase();
    let intake = intakeByCredential.get(c.id) ?? null;
    if (!intake && personEmail) intake = intakeByEmail.get(personEmail) ?? null;
    if (intake) claimedIntakeIds.add(intake.id);

    const email = (intake?.email ?? person?.email ?? '').trim().toLowerCase();
    const profile = email ? profileByEmail.get(email) ?? null : null;

    const intakeName = [intake?.first_name ?? '', intake?.last_name ?? '']
      .map((s) => s.trim()).filter(Boolean).join(' ');
    const name = intakeName || (person?.full_name ?? '').trim() || (profile?.full_name ?? '').trim() || '';

    const isActiveMember = Boolean(
      profile && (profile.subscription_status === 'active' || profile.subscription_status === 'trialing' || profile.membership_override === true)
    );
    const roles = Array.isArray(person?.roles) ? person!.roles! : [];
    const memberStatus: MemberStatusWord = isActiveMember || roles.includes('member')
      ? 'member'
      : roles.includes('guest')
        ? 'guest'
        : 'lead';

    const tier = (profile?.member_type ?? person?.member_tier ?? '').trim();

    // Pool the credential way: the tag on the credential, house when absent.
    const pool = metaString(c.metadata, 'pool') ?? 'house';
    if (c.status !== 'voided') poolCounts[pool] = (poolCounts[pool] ?? 0) + 1;

    const variant = (intake?.form_variant ?? '').trim();
    const door: Door =
      variant === 'public' || variant === 'commonwealth' || variant === 'invited' ? variant : 'member_rsvp';
    const isMemberRsvpOnly = !intake;

    // A member RSVP with no intake row is a mixer body: they RSVP'd to the
    // event itself, which is the business exchange.
    const participation: Participation = intake?.participation === 'social_only' ? 'social_only' : 'business_and_social';

    const answers = ANSWER_LABELS
      .map(([key, label]) => ({ label, value: ((intake?.[key] as string | null) ?? '').trim() }))
      .filter((a) => a.value !== '');
    const answeredCount = answers.length;
    const answersState: 'answered' | 'partial' | 'skipped' =
      answeredCount === 4 ? 'answered' : answeredCount === 0 ? 'skipped' : 'partial';

    // Zero answers is usually correct rather than missing. Business members are
    // never asked, and the social-only door has no questions at all.
    let skipReason: string | null = null;
    if (answeredCount === 0) {
      if (participation === 'social_only') skipReason = 'Skipped by design (social only)';
      else if (intake?.member_status_at_submit === 'business_member' || tier === 'business') skipReason = 'Skipped by design (business member)';
      else if (isMemberRsvpOnly) skipReason = 'Member RSVP - no intake form';
      else if (intake?.status === 'invited') skipReason = 'Invited - answers not submitted';
      else skipReason = 'No answers on file';
    }

    const utm = intake
      ? {
          utm_source: intake.utm_source,
          utm_medium: intake.utm_medium,
          utm_campaign: intake.utm_campaign,
          utm_content: intake.utm_content,
        }
      : metaUtm(c.metadata);

    registrations.push({
      credentialId: c.id,
      credentialToken: c.token,
      credentialType: c.credential_type,
      credentialStatus: c.status,
      checkedInAt: c.checked_in_at,
      registeredAt: intake?.submitted_at ?? c.created_at,
      pool,
      personId: c.person_id,
      name,
      email,
      phone: (intake?.phone ?? person?.phone ?? profile?.phone ?? '') as string,
      memberStatus,
      tier,
      door,
      participation,
      isMemberRsvpOnly,
      isFounder: isFounderEmail(email),
      answers,
      answeredCount,
      answersState,
      skipReason,
      utm,
      sourceLabel: sourceLabel(utm),
      intake,
    });
  }

  registrations.sort((a, b) => (b.registeredAt ?? '').localeCompare(a.registeredAt ?? ''));

  return {
    registrations,
    poolCounts,
    intakeWithoutCredential: intakeRows.filter((r) => !claimedIntakeIds.has(r.id)),
  };
}
