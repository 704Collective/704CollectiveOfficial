import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function csvEscape(v: unknown) {
  const s = v == null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return 'empty\n';
  const keys = Object.keys(rows[0]);
  return [keys.join(','), ...rows.map((r) => keys.map((k) => csvEscape(r[k])).join(','))].join('\n');
}

export async function GET() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: 'forbidden' }, { status: 401 });
  const { data, error } = await supabase.rpc('tm_export_bundle');
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  const tasks = (data?.tasks ?? []) as Record<string, unknown>[];
  const goals = (data?.goals ?? []) as Record<string, unknown>[];
  const history = (data?.history ?? []) as Record<string, unknown>[];
  const body = [
    '# tasks',
    rowsToCsv(tasks),
    '',
    '# goals',
    rowsToCsv(goals),
    '',
    '# history',
    rowsToCsv(history),
  ].join('\n');
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="704-tasks-export.csv"',
    },
  });
}
