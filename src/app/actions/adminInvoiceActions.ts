'use server';

import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Unauthorized' };
  const admin = serviceClient();
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (prof?.role !== 'admin' && prof?.role !== 'super_admin') {
    return { ok: false as const, error: 'Forbidden' };
  }
  return { ok: true as const, userId: user.id, admin };
}

export async function createPartnerInvoiceDraft(payload: {
  partnerId: string;
  eventId: string | null;
  amount: number;
  description: string;
  dueDate: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  if (!payload.description?.trim()) return { ok: false, error: 'Description required' };
  if (payload.amount <= 0) return { ok: false, error: 'Invalid amount' };

  const { data: row, error } = await gate.admin
    .from('partner_invoices')
    .insert({
      partner_id: payload.partnerId,
      event_id: payload.eventId,
      amount: payload.amount,
      description: payload.description.trim(),
      status: 'draft',
      due_date: payload.dueDate || null,
      created_by: gate.userId,
    })
    .select('id')
    .single();
  if (error || !row?.id) return { ok: false, error: error?.message ?? 'Insert failed' };
  return { ok: true, id: row.id as string };
}

export async function waivePartnerInvoice(invoiceId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.admin
    .from('partner_invoices')
    .update({
      status: 'waived',
      waived_by: gate.userId,
      waived_at: new Date().toISOString(),
    })
    .eq('id', invoiceId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function sendPartnerStripeInvoice(
  invoiceId: string
): Promise<{ ok: true; url?: string } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, error: 'STRIPE_SECRET_KEY is not configured' };

  const { data: inv } = await gate.admin
    .from('partner_invoices')
    .select('id, partner_id, amount, description, status, stripe_invoice_id')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!inv) return { ok: false, error: 'Invoice not found' };
  if (inv.status !== 'draft') return { ok: false, error: 'Only draft invoices can be sent' };
  if (inv.stripe_invoice_id) return { ok: false, error: 'Already sent to Stripe' };

  const { data: partnerProf } = await gate.admin
    .from('profiles')
    .select('email, full_name')
    .eq('id', inv.partner_id)
    .maybeSingle();
  if (!partnerProf?.email) return { ok: false, error: 'Partner email missing' };

  const stripe = new Stripe(key, { apiVersion: '2026-02-25.clover' });
  const amountCents = Math.round(Number(inv.amount) * 100);
  if (amountCents < 50) return { ok: false, error: 'Amount too small for Stripe' };

  let customerId: string;
  const existing = await stripe.customers.list({ email: partnerProf.email, limit: 1 });
  if (existing.data[0]) {
    customerId = existing.data[0].id;
  } else {
    const c = await stripe.customers.create({
      email: partnerProf.email,
      name: partnerProf.full_name ?? undefined,
    });
    customerId = c.id;
  }

  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due: 14,
    auto_advance: false,
    description: inv.description,
  });

  await stripe.invoiceItems.create({
    customer: customerId,
    invoice: invoice.id,
    amount: amountCents,
    currency: 'usd',
    description: inv.description,
  });

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  await stripe.invoices.sendInvoice(invoice.id);

  const hostedUrl = finalized.hosted_invoice_url ?? finalized.invoice_pdf ?? undefined;

  const { error: uErr } = await gate.admin
    .from('partner_invoices')
    .update({
      status: 'sent',
      stripe_invoice_id: finalized.id,
      stripe_invoice_url: hostedUrl ?? null,
    })
    .eq('id', invoiceId);
  if (uErr) return { ok: false, error: uErr.message };

  return { ok: true, url: hostedUrl };
}
