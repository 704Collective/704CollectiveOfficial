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
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ to, template, data }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[partnerPortalActions] send-email failed', res.status, err);
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function staffIds(admin: ReturnType<typeof serviceClient>, roles: ('admin' | 'super_admin')[]) {
  const { data } = await admin
    .from('profiles')
    .select('id')
    .in('role', roles)
    .is('deleted_at', null);
  return (data ?? []).map((r: { id: string }) => r.id);
}

export type PartnerInquiryType = 'vendor' | 'venue' | 'sponsor' | 'new_event';

export async function submitPartnerEventInquiry(payload: {
  inquiryType: PartnerInquiryType;
  eventId: string | null;
  message: string;
  vendorSetupSpace?: string;
  vendorSells?: string;
  vendorOther?: string;
  venueAddress?: string;
  venueCapacity?: number | null;
  venueHours?: string;
  venueOther?: string;
  amountOffering?: number | null;
  sponsorReturns?: string[];
  sponsorCustom?: string;
  newEventConcept?: string;
  newEventDateRange?: string;
  newEventAttendance?: string;
  newEventBudget?: string;
  newEventOther?: string;
}): Promise<{ ok: true; inquiryId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };

  const admin = serviceClient();
  const { data: prof } = await admin
    .from('profiles')
    .select('partner_status, member_type, full_name, email')
    .eq('id', user.id)
    .maybeSingle();

  if (prof?.member_type !== 'partner' || prof?.partner_status !== 'approved') {
    return { ok: false, error: 'Only approved partners can submit inquiries' };
  }

  const msg = payload.message?.trim();
  if (!msg) return { ok: false, error: 'Message is required' };

  if (payload.eventId) {
    const { data: ev } = await admin.from('events').select('id').eq('id', payload.eventId).maybeSingle();
    if (!ev) return { ok: false, error: 'Event not found' };
  }

  let amountOffering: number | null = null;
  let desiredReturn: string | null = null;
  let customDetails: string | null = null;
  let venueAddress: string | null = null;
  let venueCapacity: number | null = null;
  let venueHours: string | null = null;
  let venueOtherInfo: string | null = null;

  if (payload.inquiryType === 'vendor') {
    customDetails = JSON.stringify({
      setupSpace: payload.vendorSetupSpace ?? '',
      sells: payload.vendorSells ?? '',
      other: payload.vendorOther ?? '',
    });
  } else if (payload.inquiryType === 'venue') {
    venueAddress = payload.venueAddress?.trim() || null;
    venueCapacity = payload.venueCapacity ?? null;
    venueHours = payload.venueHours?.trim() || null;
    venueOtherInfo = payload.venueOther?.trim() || null;
  } else if (payload.inquiryType === 'sponsor') {
    amountOffering = payload.amountOffering ?? null;
    desiredReturn = (payload.sponsorReturns ?? []).filter(Boolean).join(', ') || null;
    customDetails = payload.sponsorCustom?.trim() || null;
  } else if (payload.inquiryType === 'new_event') {
    customDetails = JSON.stringify({
      concept: payload.newEventConcept ?? '',
      dateRange: payload.newEventDateRange ?? '',
      attendance: payload.newEventAttendance ?? '',
      budget: payload.newEventBudget ?? '',
      other: payload.newEventOther ?? '',
    });
  }

  const { data: inserted, error: insErr } = await admin
    .from('event_inquiries')
    .insert({
      partner_id: user.id,
      event_id: payload.eventId,
      inquiry_type: payload.inquiryType,
      status: 'pending',
      message: msg,
      amount_offering: amountOffering,
      desired_return: desiredReturn,
      custom_details: customDetails,
      venue_address: venueAddress,
      venue_capacity: venueCapacity,
      venue_hours: venueHours,
      venue_other_info: venueOtherInfo,
    })
    .select('id')
    .single();

  if (insErr || !inserted?.id) {
    return { ok: false, error: insErr?.message ?? 'Could not create inquiry' };
  }

  const inquiryId = inserted.id as string;

  const { error: openErr } = await admin.from('event_inquiry_messages').insert({
    inquiry_id: inquiryId,
    sender_id: user.id,
    content: msg,
  });

  if (openErr) {
    return { ok: false, error: openErr.message };
  }

  const { data: listing } = await admin
    .from('partner_listings')
    .select('company_name')
    .eq('user_id', user.id)
    .maybeSingle();
  const { data: application } = await admin
    .from('partner_applications')
    .select('company_name')
    .eq('user_id', user.id)
    .order('applied_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const companyName =
    listing?.company_name?.trim() || application?.company_name?.trim() || 'Partner';

  let eventLabel = 'New Event Suggestion';
  if (payload.eventId) {
    const { data: ev } = await admin.from('events').select('title').eq('id', payload.eventId).maybeSingle();
    eventLabel = ev?.title?.trim() || 'Event';
  }

  const detailLines: string[] = [
    `<p><strong>Message</strong></p><p>${escapeHtml(msg).replace(/\n/g, '<br/>')}</p>`,
  ];
  if (payload.inquiryType === 'vendor' && customDetails) {
    detailLines.push(`<p><strong>Vendor details</strong></p><pre style="white-space:pre-wrap;font-size:13px;">${escapeHtml(customDetails)}</pre>`);
  }
  if (payload.inquiryType === 'venue') {
    detailLines.push(
      `<p><strong>Venue</strong><br/>${escapeHtml(venueAddress ?? '')}<br/>Capacity: ${venueCapacity ?? '—'}<br/>Hours: ${escapeHtml(venueHours ?? '')}<br/>Other: ${escapeHtml(venueOtherInfo ?? '')}</p>`
    );
  }
  if (payload.inquiryType === 'sponsor') {
    detailLines.push(
      `<p><strong>Sponsor</strong><br/>Amount: ${amountOffering ?? '—'}<br/>Desired return: ${escapeHtml(desiredReturn ?? '')}<br/>Details: ${escapeHtml(customDetails ?? '')}</p>`
    );
  }
  if (payload.inquiryType === 'new_event' && customDetails) {
    detailLines.push(`<p><strong>New event</strong></p><pre style="white-space:pre-wrap;font-size:13px;">${escapeHtml(customDetails)}</pre>`);
  }

  await sendServiceEmail('hello@704collective.com', 'partner-event-inquiry-admin', {
    partnerEmail: prof.email ?? '',
    partnerName: prof.full_name?.trim() || 'Partner',
    companyName,
    inquiryType: payload.inquiryType,
    eventLabel,
    bodyHtml: detailLines.join(''),
  });

  const ids = await staffIds(admin, ['admin', 'super_admin']);
  if (ids.length) {
    const rows = ids.map((uid) => ({
      user_id: uid,
      notification_type: 'new_inquiry',
      action_url: '/admin',
      message: `${companyName} submitted a ${payload.inquiryType} inquiry (${eventLabel})`,
    }));
    await admin.from('notifications').insert(rows);
  }

  return { ok: true, inquiryId };
}

export async function postEventInquiryMessage(
  inquiryId: string,
  content: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = content?.trim();
  if (!text) return { ok: false, error: 'Message is required' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };

  const admin = serviceClient();
  const { data: inq } = await admin
    .from('event_inquiries')
    .select('partner_id')
    .eq('id', inquiryId)
    .maybeSingle();
  if (!inq) return { ok: false, error: 'Inquiry not found' };

  const { data: me } = await admin.from('profiles').select('role, email, full_name').eq('id', user.id).maybeSingle();
  const isStaff = me?.role === 'admin' || me?.role === 'super_admin';
  const isOwner = inq.partner_id === user.id;
  if (!isStaff && !isOwner) return { ok: false, error: 'Forbidden' };

  const { error: msgErr } = await admin.from('event_inquiry_messages').insert({
    inquiry_id: inquiryId,
    sender_id: user.id,
    content: text,
  });
  if (msgErr) return { ok: false, error: msgErr.message };

  if (isOwner) {
    const ids = await staffIds(admin, ['admin', 'super_admin']);
    if (ids.length) {
      await admin.from('notifications').insert(
        ids.map((uid) => ({
          user_id: uid,
          notification_type: 'inquiry_message',
          action_url: '/admin',
          message: 'A partner replied on an event inquiry thread',
        }))
      );
    }
  } else {
    const { data: partnerProf } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('id', inq.partner_id)
      .maybeSingle();
    await admin.from('notifications').insert({
      user_id: inq.partner_id,
      notification_type: 'inquiry_reply',
      action_url: '/partner-portal/inquiries',
      message: '704 Collective replied to your event inquiry',
    });
    if (partnerProf?.email) {
      await sendServiceEmail(partnerProf.email, 'partner-inquiry-admin-reply-partner', {
        name: partnerProf.full_name?.trim() || 'Partner',
        inquiriesUrl: `${SITE_ORIGIN}/partner-portal/inquiries`,
        preview: escapeHtml(text).replace(/\n/g, '<br/>'),
        origin: SITE_ORIGIN,
      });
    }
  }

  return { ok: true };
}

export async function ensurePartnerTeamConversation(): Promise<
  { ok: true; conversationId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };

  const admin = serviceClient();
  const { data: prof } = await admin
    .from('profiles')
    .select('partner_status, member_type')
    .eq('id', user.id)
    .maybeSingle();
  if (prof?.member_type !== 'partner' || prof?.partner_status !== 'approved') {
    return { ok: false, error: 'Only approved partners can start this conversation' };
  }

  const { data: existing } = await admin
    .from('admin_conversations')
    .select('id')
    .eq('type', 'partner_inquiry')
    .eq('partner_id', user.id)
    .maybeSingle();

  if (existing?.id) return { ok: true, conversationId: existing.id };

  const { data: conv, error: cErr } = await admin
    .from('admin_conversations')
    .insert({
      type: 'partner_inquiry',
      title: '704 Collective team',
      created_by: user.id,
      partner_id: user.id,
    })
    .select('id')
    .single();

  if (cErr || !conv?.id) {
    if (cErr?.code === '23505') {
      const { data: again } = await admin
        .from('admin_conversations')
        .select('id')
        .eq('type', 'partner_inquiry')
        .eq('partner_id', user.id)
        .maybeSingle();
      if (again?.id) return { ok: true, conversationId: again.id };
    }
    return { ok: false, error: cErr?.message ?? 'Could not create conversation' };
  }

  const conversationId = conv.id as string;

  const { data: supers } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'super_admin')
    .is('deleted_at', null);

  const partRows = [
    ...(supers ?? []).map((s: { id: string }) => ({
      conversation_id: conversationId,
      user_id: s.id,
    })),
    { conversation_id: conversationId, user_id: user.id },
  ];

  const { error: pErr } = await admin.from('admin_conversation_participants').insert(partRows);
  if (pErr) return { ok: false, error: pErr.message };

  return { ok: true, conversationId };
}

export async function postPartnerTeamThreadMessage(
  conversationId: string,
  content: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = content?.trim();
  if (!text) return { ok: false, error: 'Message is required' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };

  const admin = serviceClient();
  const { data: conv } = await admin
    .from('admin_conversations')
    .select('partner_id, type')
    .eq('id', conversationId)
    .maybeSingle();

  if (!conv || conv.type !== 'partner_inquiry' || !conv.partner_id) {
    return { ok: false, error: 'Conversation not found' };
  }

  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isSuper = me?.role === 'super_admin';
  const isPartnerSender = conv.partner_id === user.id;
  if (!isSuper && !isPartnerSender) return { ok: false, error: 'Forbidden' };

  const { data: part } = await admin
    .from('admin_conversation_participants')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!part) return { ok: false, error: 'Not a participant' };

  const { count: priorPartnerCount } = await admin
    .from('admin_messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('sender_id', conv.partner_id)
    .is('deleted_at', null);

  const { error: insErr } = await supabase.from('admin_messages').insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: text,
  });
  if (insErr) return { ok: false, error: insErr.message };

  if (isPartnerSender) {
    const bellIds = await staffIds(admin, ['admin', 'super_admin']);
    if (bellIds.length) {
      await admin.from('notifications').insert(
        bellIds.map((uid) => ({
          user_id: uid,
          notification_type: 'partner_team_message',
          action_url: '/admin',
          message: 'A partner sent a message on the team thread',
        }))
      );
    }

    const isFirst = (priorPartnerCount ?? 0) === 0;
    if (isFirst) {
      const { data: listing } = await admin
        .from('partner_listings')
        .select('company_name')
        .eq('user_id', conv.partner_id)
        .maybeSingle();
      const { data: application } = await admin
        .from('partner_applications')
        .select('company_name')
        .eq('user_id', conv.partner_id)
        .order('applied_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: partnerProf } = await admin
        .from('profiles')
        .select('email, full_name')
        .eq('id', conv.partner_id)
        .maybeSingle();

      const companyName =
        listing?.company_name?.trim() || application?.company_name?.trim() || 'Partner';

      const { data: superProfiles } = await admin
        .from('profiles')
        .select('email, full_name')
        .eq('role', 'super_admin')
        .is('deleted_at', null);

      for (const sp of superProfiles ?? []) {
        if (!sp.email) continue;
        await sendServiceEmail(sp.email, 'partner-team-first-superadmin', {
          superAdminName: sp.full_name?.trim() || 'there',
          partnerCompany: companyName,
          partnerName: partnerProf?.full_name?.trim() || 'Partner',
          partnerEmail: partnerProf?.email ?? '',
          preview: escapeHtml(text).replace(/\n/g, '<br/>'),
          adminUrl: `${SITE_ORIGIN}/admin`,
        });
      }
    }
  } else if (isSuper) {
    const { data: partnerProf } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('id', conv.partner_id)
      .maybeSingle();

    await admin.from('notifications').insert({
      user_id: conv.partner_id,
      notification_type: 'partner_team_reply',
      action_url: '/partner-portal/messages',
      message: '704 Collective replied on your team thread',
    });

    if (partnerProf?.email) {
      await sendServiceEmail(partnerProf.email, 'partner-team-reply-partner', {
        name: partnerProf.full_name?.trim() || 'Partner',
        preview: escapeHtml(text).replace(/\n/g, '<br/>'),
        messagesUrl: `${SITE_ORIGIN}/partner-portal/messages`,
        origin: SITE_ORIGIN,
      });
    }
  }

  return { ok: true };
}

export async function markPartnerTeamThreadRead(conversationId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from('admin_conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id);
}

async function uploadPartnerAsset(userId: string, file: File, subfolder: string): Promise<string> {
  const admin = serviceClient();
  const ext = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'jpg';
  const path = `${userId}/${subfolder}/${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from('partner-assets').upload(path, buf, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (upErr) throw new Error(upErr.message);
  const { data: pub } = admin.storage.from('partner-assets').getPublicUrl(path);
  return pub.publicUrl;
}

export async function savePartnerListingForm(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };

  const admin = serviceClient();
  const { data: prof } = await admin
    .from('profiles')
    .select('partner_status, member_type')
    .eq('id', user.id)
    .maybeSingle();
  if (prof?.member_type !== 'partner' || prof?.partner_status !== 'approved') {
    return { ok: false, error: 'Only approved partners can edit listings' };
  }

  const companyName = String(formData.get('companyName') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const websiteRaw = String(formData.get('website') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const website = websiteRaw || null;

  let partnerTypes: string[] = [];
  try {
    partnerTypes = JSON.parse(String(formData.get('partnerTypes') ?? '[]')) as string[];
  } catch {
    return { ok: false, error: 'Invalid partner types' };
  }
  if (!Array.isArray(partnerTypes) || !partnerTypes.includes('partner')) {
    return { ok: false, error: 'Partner type cannot be removed' };
  }

  if (!companyName || !description) {
    return { ok: false, error: 'Company name and description are required' };
  }

  const userId = user.id;

  let existingPhotos: string[] = [];
  try {
    existingPhotos = JSON.parse(String(formData.get('existingPhotos') ?? '[]')) as string[];
  } catch {
    existingPhotos = [];
  }

  const logo = formData.get('logo');
  let logoUrl: string | null = String(formData.get('logoUrlExisting') ?? '').trim() || null;

  try {
    if (logo && typeof logo === 'object' && (logo as File).size > 0) {
      logoUrl = await uploadPartnerAsset(userId, logo as File, 'listing-logo');
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Logo upload failed' };
  }

  if (!logoUrl) {
    return { ok: false, error: 'Logo is required' };
  }

  const newPhotoFiles = formData.getAll('newPhotos') as File[];
  const photoUrls: string[] = [...existingPhotos].filter(Boolean).slice(0, 9);
  try {
    for (const f of newPhotoFiles) {
      if (!(f instanceof File) || f.size === 0) continue;
      if (photoUrls.length >= 9) break;
      photoUrls.push(await uploadPartnerAsset(userId, f, 'listing-photos'));
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Photo upload failed' };
  }

  const { data: existing } = await admin
    .from('partner_listings')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  const row = {
    user_id: userId,
    company_name: companyName,
    description,
    website,
    phone: phone || null,
    logo_url: logoUrl,
    photo_urls: photoUrls,
    partner_types: partnerTypes,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase.from('partner_listings').update(row).eq('user_id', userId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from('partner_listings').insert(row);
    if (error) return { ok: false, error: error.message };
  }

  const { error: pErr } = await supabase
    .from('profiles')
    .update({
      partner_types: partnerTypes,
      phone: phone || null,
    })
    .eq('id', userId);

  if (pErr) return { ok: false, error: pErr.message };

  return { ok: true };
}

export async function updatePartnerPortalSettings(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };

  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const companyName = String(formData.get('companyName') ?? '').trim();
  const websiteRaw = String(formData.get('website') ?? '').trim();
  const newPassword = String(formData.get('newPassword') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (!firstName || !lastName) {
    return { ok: false, error: 'First and last name are required' };
  }

  const fullName = `${firstName} ${lastName}`.trim();

  const admin = serviceClient();
  const { data: prof } = await admin
    .from('profiles')
    .select('member_type')
    .eq('id', user.id)
    .maybeSingle();
  if (prof?.member_type !== 'partner') {
    return { ok: false, error: 'Invalid account' };
  }

  const { error: uErr } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      phone: phone || null,
    })
    .eq('id', user.id);
  if (uErr) return { ok: false, error: uErr.message };

  if (companyName || websiteRaw) {
    const { data: listing } = await admin.from('partner_listings').select('id').eq('user_id', user.id).maybeSingle();
    if (listing?.id) {
      await supabase
        .from('partner_listings')
        .update({
          ...(companyName ? { company_name: companyName } : {}),
          ...(websiteRaw !== undefined ? { website: websiteRaw || null } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
    } else {
      const { data: app } = await admin
        .from('partner_applications')
        .select('id')
        .eq('user_id', user.id)
        .order('applied_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (app?.id) {
        await admin
          .from('partner_applications')
          .update({
            ...(companyName ? { company_name: companyName } : {}),
            ...(websiteRaw !== undefined ? { website: websiteRaw || null } : {}),
          })
          .eq('id', app.id);
      }
    }
  }

  if (newPassword || confirmPassword) {
    if (newPassword.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters' };
    }
    if (newPassword !== confirmPassword) {
      return { ok: false, error: 'Passwords do not match' };
    }
    const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword });
    if (pwErr) return { ok: false, error: pwErr.message };
  }

  return { ok: true };
}

export async function requestPartnerAccountDeletion(
  companyConfirm: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = companyConfirm?.trim();
  if (!trimmed) return { ok: false, error: 'Company name is required' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };

  const admin = serviceClient();
  const { data: prof } = await admin
    .from('profiles')
    .select('member_type, email, full_name')
    .eq('id', user.id)
    .maybeSingle();
  if (prof?.member_type !== 'partner') {
    return { ok: false, error: 'Invalid account' };
  }

  const { data: listing } = await admin
    .from('partner_listings')
    .select('company_name')
    .eq('user_id', user.id)
    .maybeSingle();
  const { data: application } = await admin
    .from('partner_applications')
    .select('company_name')
    .eq('user_id', user.id)
    .order('applied_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const expected =
    listing?.company_name?.trim() || application?.company_name?.trim() || '';
  if (!expected || expected.toLowerCase() !== trimmed.toLowerCase()) {
    return { ok: false, error: 'Company name does not match' };
  }

  await sendServiceEmail('hello@704collective.com', 'partner-account-deletion-request', {
    userId: user.id,
    email: prof.email ?? '',
    companyName: expected,
    fullName: prof.full_name?.trim() || '',
  });

  return { ok: true };
}
