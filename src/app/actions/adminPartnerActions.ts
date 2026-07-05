'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://704collective.com';

async function sendServiceEmail(to: string, template: string, data: Record<string, unknown>) {
  await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ to, template, data }),
  });
}

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Unauthorized' };
  const admin = serviceClient();
  const { data: prof } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (prof?.role !== 'admin' && prof?.role !== 'super_admin') {
    return { ok: false as const, error: 'Forbidden' };
  }
  return { ok: true as const, userId: user.id, supabase, admin };
}

async function assertSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Unauthorized' };
  const admin = serviceClient();
  const { data: prof } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (prof?.role !== 'super_admin') {
    return { ok: false as const, error: 'Forbidden: super_admin required' };
  }
  return { ok: true as const, userId: user.id, supabase, admin };
}

export async function approvePartnerApplication(applicationId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const { admin } = gate;
  const { data: app } = await admin
    .from('partner_applications')
    .select('user_id, company_name')
    .eq('id', applicationId)
    .maybeSingle();
  if (!app?.user_id) return { ok: false, error: 'Application not found' };

  const { error: aErr } = await admin
    .from('partner_applications')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: gate.userId,
    })
    .eq('id', applicationId);
  if (aErr) return { ok: false, error: aErr.message };

  const { error: pErr } = await admin
    .from('profiles')
    .update({ partner_status: 'approved' })
    .eq('id', app.user_id);
  if (pErr) return { ok: false, error: pErr.message };

  const { data: userProf } = await admin.from('profiles').select('email, full_name').eq('id', app.user_id).maybeSingle();
  const firstName = userProf?.full_name?.split(/\s+/)[0] ?? 'there';
  if (userProf?.email) {
    await sendServiceEmail(userProf.email, 'partner-welcome-invite', {
      name: firstName,
      dashboardUrl: `${SITE_ORIGIN}/partner-portal`,
      origin: SITE_ORIGIN,
    });
  }

  return { ok: true };
}

export async function denyPartnerApplication(
  applicationId: string,
  denialReason: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = denialReason?.trim();
  if (!reason) return { ok: false, error: 'Denial reason is required' };

  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const { admin } = gate;
  const { data: app } = await admin
    .from('partner_applications')
    .select('user_id')
    .eq('id', applicationId)
    .maybeSingle();
  if (!app?.user_id) return { ok: false, error: 'Application not found' };

  const { error: aErr } = await admin
    .from('partner_applications')
    .update({
      status: 'denied',
      denial_reason: reason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: gate.userId,
    })
    .eq('id', applicationId);
  if (aErr) return { ok: false, error: aErr.message };

  const { data: userProf } = await admin.from('profiles').select('email, full_name').eq('id', app.user_id).maybeSingle();
  if (userProf?.email) {
    await sendServiceEmail(userProf.email, 'partner-application-denied', {
      name: userProf.full_name?.split(/\s+/)[0] ?? 'there',
      reason,
      origin: SITE_ORIGIN,
    });
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(app.user_id);
  if (delErr) return { ok: false, error: delErr.message };

  return { ok: true };
}

export async function markPartnerApplicationReviewing(
  applicationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  const { data: app } = await gate.admin
    .from('partner_applications')
    .select('user_id')
    .eq('id', applicationId)
    .maybeSingle();
  if (!app?.user_id) return { ok: false, error: 'Application not found' };

  const { error } = await gate.admin
    .from('partner_applications')
    .update({ status: 'reviewing', reviewed_by: gate.userId, reviewed_at: new Date().toISOString() })
    .eq('id', applicationId);
  if (error) return { ok: false, error: error.message };

  await gate.admin.from('profiles').update({ partner_status: 'reviewing' }).eq('id', app.user_id);
  return { ok: true };
}

export async function togglePartnerFeatured(
  partnerUserId: string,
  featured: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const { error: e1 } = await gate.admin
    .from('profiles')
    .update({ is_featured_partner: featured })
    .eq('id', partnerUserId);
  if (e1) return { ok: false, error: e1.message };

  const { error: e2 } = await gate.admin
    .from('partner_listings')
    .update(
      featured ? { is_featured: true } : { is_featured: false, featured_order: null }
    )
    .eq('user_id', partnerUserId);
  if (e2) return { ok: false, error: e2.message };

  return { ok: true };
}

export async function setPartnerFeaturedSettings(
  partnerUserId: string,
  featured: boolean,
  featuredOrder: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  if (featuredOrder < 0 || !Number.isFinite(featuredOrder)) {
    return { ok: false, error: 'Invalid order' };
  }

  const { error: e1 } = await gate.admin
    .from('profiles')
    .update({ is_featured_partner: featured })
    .eq('id', partnerUserId);
  if (e1) return { ok: false, error: e1.message };

  const { error: e2 } = await gate.admin
    .from('partner_listings')
    .update({
      is_featured: featured,
      featured_order: featured ? Math.floor(featuredOrder) : null,
    })
    .eq('user_id', partnerUserId);
  if (e2) return { ok: false, error: e2.message };

  return { ok: true };
}

export async function saveFeaturedPartnersDisplayOrder(
  orderedPartnerUserIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  const ids = [...new Set(orderedPartnerUserIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i++) {
    const { error } = await gate.admin
      .from('partner_listings')
      .update({ featured_order: i })
      .eq('user_id', ids[i])
      .eq('is_featured', true);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removePartner(partnerUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const { error: e1 } = await gate.admin
    .from('profiles')
    .update({
      partner_status: 'removed',
      is_featured_partner: false,
    })
    .eq('id', partnerUserId);
  if (e1) return { ok: false, error: e1.message };

  await gate.admin
    .from('partner_listings')
    .update({ is_featured: false })
    .eq('user_id', partnerUserId);

  return { ok: true };
}

export async function revokePartnerInvite(inviteId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.admin
    .from('partner_invites')
    .update({
      revoked: true,
      revoked_by: gate.userId,
      revoked_at: new Date().toISOString(),
    })
    .eq('id', inviteId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function createPartnerInvite(email: string | null): Promise<
  { ok: true; token: string; url: string } | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const token = randomBytes(24).toString('base64url');
  const { data: row, error } = await gate.admin
    .from('partner_invites')
    .insert({
      created_by: gate.userId,
      email: email?.trim() || null,
      unique_token: token,
    })
    .select('unique_token')
    .single();
  if (error || !row?.unique_token) return { ok: false, error: error?.message ?? 'Insert failed' };

  const url = `${SITE_ORIGIN}/partners/apply?invite=${encodeURIComponent(row.unique_token)}`;
  return { ok: true, token: row.unique_token, url };
}

export async function ensureAdminDirectConversation(
  otherUserId: string
): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  if (otherUserId === gate.userId) return { ok: false, error: 'Invalid recipient' };

  const { admin } = gate;

  const { data: existingParts } = await admin
    .from('admin_conversation_participants')
    .select('conversation_id')
    .eq('user_id', gate.userId);

  const myConvIds = (existingParts ?? []).map((r) => r.conversation_id);
  if (myConvIds.length) {
    const { data: others } = await admin
      .from('admin_conversation_participants')
      .select('conversation_id')
      .eq('user_id', otherUserId)
      .in('conversation_id', myConvIds);

    if (others?.length) {
      for (const o of others) {
        const { data: c } = await admin
          .from('admin_conversations')
          .select('id, type')
          .eq('id', o.conversation_id)
          .maybeSingle();
        if (c?.type === 'direct') {
          return { ok: true, conversationId: c.id };
        }
      }
    }
  }

  const { data: conv, error: cErr } = await admin
    .from('admin_conversations')
    .insert({
      type: 'direct',
      title: null,
      created_by: gate.userId,
      partner_id: null,
    })
    .select('id')
    .single();
  if (cErr || !conv?.id) return { ok: false, error: cErr?.message ?? 'Could not create conversation' };

  const { error: pErr } = await gate.admin.from('admin_conversation_participants').insert([
    { conversation_id: conv.id, user_id: gate.userId },
    { conversation_id: conv.id, user_id: otherUserId },
  ]);
  if (pErr) return { ok: false, error: pErr.message };

  return { ok: true, conversationId: conv.id };
}

export async function createAdminGroupConversation(
  participantIds: string[],
  title: string
): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  const ids = [...new Set([gate.userId, ...participantIds])].filter(Boolean);
  if (ids.length < 2) return { ok: false, error: 'Select at least one other person' };
  const t = title?.trim();
  if (!t) return { ok: false, error: 'Group title is required' };

  const { data: conv, error: cErr } = await gate.admin
    .from('admin_conversations')
    .insert({
      type: 'group',
      title: t,
      created_by: gate.userId,
      partner_id: null,
    })
    .select('id')
    .single();
  if (cErr || !conv?.id) return { ok: false, error: cErr?.message ?? 'Could not create conversation' };

  const rows = ids.map((uid) => ({ conversation_id: conv.id, user_id: uid }));
  const { error: pErr } = await gate.admin.from('admin_conversation_participants').insert(rows);
  if (pErr) return { ok: false, error: pErr.message };

  return { ok: true, conversationId: conv.id };
}

export async function postAdminInboxMessage(
  conversationId: string,
  content: string,
  imageUrls: string[],
  fileUrls: string[],
  fileNames: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = content?.trim();
  if (!text && !imageUrls.length && !fileUrls.length) {
    return { ok: false, error: 'Message is empty' };
  }

  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const { data: part } = await gate.admin
    .from('admin_conversation_participants')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', gate.userId)
    .maybeSingle();
  if (!part) return { ok: false, error: 'Not a participant' };

  const { error } = await gate.supabase.from('admin_messages').insert({
    conversation_id: conversationId,
    sender_id: gate.userId,
    content: text || '(attachment)',
    image_urls: imageUrls,
    file_urls: fileUrls,
    file_names: fileNames,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

export async function postAdminInquiryReply(inquiryId: string, content: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  const { data: inq } = await gate.admin.from('event_inquiries').select('partner_id').eq('id', inquiryId).maybeSingle();
  if (!inq) return { ok: false, error: 'Inquiry not found' };

  const { error } = await gate.supabase.from('event_inquiry_messages').insert({
    inquiry_id: inquiryId,
    sender_id: gate.userId,
    content: content.trim(),
  });
  if (error) return { ok: false, error: error.message };

  const { data: partnerProf } = await gate.admin
    .from('profiles')
    .select('email, full_name')
    .eq('id', inq.partner_id)
    .maybeSingle();

  await gate.admin.from('notifications').insert({
    user_id: inq.partner_id,
    type: 'inquiry_reply',
    title: 'Reply to your inquiry',
    notification_type: 'inquiry_reply',
    action_url: '/partner-portal/inquiries',
    message: '704 Collective replied to your event inquiry',
  });

  function escapeHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  if (partnerProf?.email) {
    await sendServiceEmail(partnerProf.email, 'partner-inquiry-admin-reply-partner', {
      name: partnerProf.full_name?.trim() || 'Partner',
      inquiriesUrl: `${SITE_ORIGIN}/partner-portal/inquiries`,
      preview: escapeHtml(content.trim()).replace(/\n/g, '<br/>'),
      origin: SITE_ORIGIN,
    });
  }

  return { ok: true };
}

export async function updateAdamUniversalInbox(enabled: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const { data: me } = await gate.admin.from('profiles').select('email').eq('id', gate.userId).maybeSingle();
  if (me?.email?.toLowerCase() !== 'adam@cltbucketlist.com') {
    return { ok: false, error: 'Forbidden' };
  }

  const { error } = await gate.admin
    .from('profiles')
    .update({ see_all_cross_conversations: enabled })
    .eq('id', gate.userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
