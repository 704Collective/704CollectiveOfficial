import { supabase } from '@/integrations/supabase/client';

export type UnifiedSourceTable =
  | 'profiles'
  | 'contacts'
  | 'business_applications'
  | 'sponsors_vendors'
  | 'partners';

export interface UnifiedContact {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  company: string | null;
  /** Primary type after merge priority */
  contact_type: string;
  status: string | null;
  source: string | null;
  lead_score: number | null;
  last_activity_at: string | null;
  created_at: string | null;
  tags?: string[];
  source_table?: UnifiedSourceTable;
  /** All types seen for this email (for +N chip) */
  all_types?: string[];
}

const TYPE_PRIORITY: Record<string, number> = {
  guest: 1,
  prospect: 2,
  vendor: 3,
  partner: 4,
  sponsor: 5,
  applicant: 6,
  member: 7,
};

export function deriveContactStatus(row: {
  subscription_status?: string | null;
  membership_override?: boolean | null;
  status?: string | null;
}): string {
  if (row.membership_override) return 'active';
  if (row.subscription_status === 'active') return 'active';
  if (row.subscription_status === 'canceled') return 'canceled';
  if (row.status) return row.status;
  return 'inactive';
}

function mergeContact(
  merged: Map<string, UnifiedContact>,
  row: UnifiedContact,
  resolvedType: string,
) {
  const key = row.email.toLowerCase().trim();
  const newPriority = TYPE_PRIORITY[resolvedType] ?? 0;
  const existing = merged.get(key);
  const types = new Set<string>(existing?.all_types ?? []);
  if (existing?.contact_type) types.add(existing.contact_type);
  types.add(resolvedType);

  if (!existing) {
    merged.set(key, {
      ...row,
      email: key,
      contact_type: resolvedType,
      all_types: [...types],
    });
    return;
  }

  const existingPriority = TYPE_PRIORITY[existing.contact_type ?? ''] ?? 0;
  const pickNew = newPriority > existingPriority;
  const primary = pickNew ? resolvedType : existing.contact_type;
  const mergedRow: UnifiedContact = {
    ...(pickNew ? row : existing),
    email: key,
    contact_type: primary,
    all_types: [...types],
    full_name: pickNew
      ? (row.full_name ?? existing.full_name)
      : (existing.full_name ?? row.full_name),
    phone: pickNew ? (row.phone ?? existing.phone) : (existing.phone ?? row.phone),
    company: pickNew ? (row.company ?? existing.company) : (existing.company ?? row.company),
  };
  merged.set(key, mergedRow);
}

/** Load merged contacts (same sources as CRM unified page). */
export async function loadUnifiedContacts(): Promise<UnifiedContact[]> {
  const LIMIT = 2000;
  const merged = new Map<string, UnifiedContact>();

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, subscription_status, membership_override, created_at')
    .is('deleted_at', null)
    .not('email', 'is', null)
    .limit(LIMIT);

  for (const p of profiles ?? []) {
    if (!p.email) continue;
    mergeContact(merged, {
      id: p.id,
      email: p.email,
      full_name: p.full_name ?? null,
      phone: (p as { phone?: string | null }).phone ?? null,
      company: null,
      contact_type: 'member',
      status: deriveContactStatus(p as never),
      source: 'profiles',
      lead_score: null,
      last_activity_at: null,
      created_at: p.created_at ?? null,
      source_table: 'profiles',
    }, 'member');
  }

  const { data: contactRows } = await supabase
    .from('contacts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  for (const c of contactRows ?? []) {
    if (!c.email) continue;
    const guestTypes = ['guest', 'guest_pass', 'event_guest'];
    const resolvedType = guestTypes.includes(c.contact_type ?? '') ? 'guest' : (c.contact_type ?? 'prospect');
    mergeContact(merged, { ...c, source_table: 'contacts' } as UnifiedContact, resolvedType);
  }

  const { data: apps } = await supabase
    .from('business_applications')
    .select('id, email, first_name, last_name, phone, company, created_at, status')
    .limit(LIMIT);

  for (const a of apps ?? []) {
    if (!a.email) continue;
    mergeContact(
      merged,
      {
        id: a.id,
        email: a.email,
        full_name: [a.first_name, a.last_name].filter(Boolean).join(' ') || null,
        phone: a.phone ?? null,
        company: a.company ?? null,
        contact_type: 'applicant',
        status: a.status ?? 'pending',
        source: 'application',
        lead_score: null,
        last_activity_at: null,
        created_at: a.created_at ?? null,
        source_table: 'business_applications',
      },
      'applicant',
    );
  }

  const { data: sv } = await supabase
    .from('sponsors_vendors')
    .select('id, email, contact_name, company_name, created_at, partnership_type, status')
    .limit(LIMIT);

  for (const s of sv ?? []) {
    if (!s.email) continue;
    const svType =
      s.partnership_type === 'partner'
        ? 'partner'
        : s.partnership_type === 'vendor'
          ? 'vendor'
          : 'sponsor';
    mergeContact(
      merged,
      {
        id: s.id,
        email: s.email,
        full_name: s.contact_name ?? null,
        phone: null,
        company: s.company_name ?? null,
        contact_type: svType,
        status: s.status ?? 'active',
        source: 'sponsors_vendors',
        lead_score: null,
        last_activity_at: null,
        created_at: s.created_at ?? null,
        source_table: 'sponsors_vendors',
      },
      svType,
    );
  }

  const { data: partners } = await supabase
    .from('partners')
    .select('id, email, full_name, phone, company, created_at, status')
    .limit(LIMIT);

  for (const p of partners ?? []) {
    if (!p.email) continue;
    mergeContact(
      merged,
      {
        id: p.id,
        email: p.email,
        full_name: (p as { full_name?: string | null; name?: string | null }).full_name
          ?? (p as { name?: string | null }).name
          ?? null,
        phone: (p as { phone?: string | null }).phone ?? null,
        company: (p as { company?: string | null }).company ?? null,
        contact_type: 'partner',
        status: (p as { status?: string | null }).status ?? 'active',
        source: 'partners',
        lead_score: null,
        last_activity_at: null,
        created_at: p.created_at ?? null,
        source_table: 'partners',
      },
      'partner',
    );
  }

  return Array.from(merged.values()).sort((a, b) => {
    const da = a.created_at ? new Date(a.created_at).getTime() : 0;
    const db = b.created_at ? new Date(b.created_at).getTime() : 0;
    return db - da;
  });
}

export function contactRouteId(c: UnifiedContact): string {
  const table = c.source_table ?? 'unknown';
  return encodeURIComponent(`${table}:${c.id}`);
}

export function parseContactRouteId(segment: string): { table: string; id: string } | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  const idx = decoded.indexOf(':');
  if (idx <= 0) return null;
  return { table: decoded.slice(0, idx), id: decoded.slice(idx + 1) };
}
