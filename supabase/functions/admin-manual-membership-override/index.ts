import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// E.164 normalization for US numbers. Returns null if input can't be normalized.
function normalizeE164(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (phone.startsWith('+') && digits.length >= 10) return `+${digits}`
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // --- Step 1: Verify the caller is a super_admin ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !requestingUser) {
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: requesterProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', requestingUser.id)
      .maybeSingle()

    if (!requesterProfile || requesterProfile.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Super admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // --- Step 2: Parse and validate input ---
    const body = await req.json()
    const {
      email,
      full_name,
      member_tier,
      member_status,
      override_paying,
      phone,
      send_setup_email
    } = body

    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'email is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const validTiers = ['social', 'business', 'founder']
    const validStatuses = ['active', 'inactive', 'canceled']

    if (member_tier !== null && member_tier !== undefined && !validTiers.includes(member_tier)) {
      return new Response(JSON.stringify({ error: `Invalid member_tier: ${member_tier}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (member_status !== null && member_status !== undefined && !validStatuses.includes(member_status)) {
      return new Response(JSON.stringify({ error: `Invalid member_status: ${member_status}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const changes: string[] = []

    // --- Step 3: Find or create the people row by email ---
    let { data: peopleRow } = await supabaseAdmin
      .from('people')
      .select('id, member_tier, member_status, full_name, override_paying, phone, phone_e164, roles')
      .ilike('email', normalizedEmail)
      .maybeSingle()

    const priorTier = peopleRow?.member_tier ?? null

    if (!peopleRow) {
      // No people row exists — create one
      const { data: newPerson, error: createPersonErr } = await supabaseAdmin
        .from('people')
        .insert({
          // email_lower is GENERATED ALWAYS from email. Never write it.
          email: normalizedEmail,
          full_name: full_name ?? null,
          member_tier: member_tier ?? null,
          member_status: member_status ?? null,
          override_paying: override_paying ?? false,
          phone: phone ?? null,
          phone_e164: normalizeE164(phone),
          roles: member_status === 'active' ? ['member'] : [],
          joined_at: member_status === 'active' ? new Date().toISOString() : null,
        })
        .select('id, member_tier, member_status')
        .single()

      if (createPersonErr) {
        console.error('Create people row failed:', createPersonErr)
        return new Response(JSON.stringify({ error: `Failed to create people row: ${createPersonErr.message}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      peopleRow = { ...newPerson, full_name: full_name ?? null, override_paying: override_paying ?? false, phone: phone ?? null, phone_e164: normalizeE164(phone), roles: member_status === 'active' ? ['member'] : [] } as any
      changes.push('created people row')
    } else {
      // Update existing people row
      const peopleUpdate: Record<string, unknown> = {}
      if (member_tier !== null && member_tier !== undefined && member_tier !== peopleRow.member_tier) {
        peopleUpdate.member_tier = member_tier
        changes.push(`tier: ${peopleRow.member_tier ?? 'null'} 胢↙ ${member_tier}`)
      }
      if (member_status !== null && member_status !== undefined && member_status !== peopleRow.member_status) {
        peopleUpdate.member_status = member_status
        changes.push(`status: ${peopleRow.member_status ?? 'null'} 胢↙ ${member_status}`)
        if (member_status === 'active' && !peopleRow.roles?.includes('member')) {
          peopleUpdate.roles = [...(peopleRow.roles ?? []), 'member']
        }
        if (member_status === 'active') {
          peopleUpdate.joined_at = new Date().toISOString()
        }
      }
      if (override_paying !== null && override_paying !== undefined && override_paying !== peopleRow.override_paying) {
        peopleUpdate.override_paying = override_paying
        changes.push(`override_paying: ${peopleRow.override_paying} 胢↙ ${override_paying}`)
      }
      if (phone !== null && phone !== undefined && phone !== peopleRow.phone) {
        peopleUpdate.phone = phone
        peopleUpdate.phone_e164 = normalizeE164(phone)
        changes.push('phone updated')
      }
      if (full_name && full_name !== peopleRow.full_name) {
        peopleUpdate.full_name = full_name
      }

      if (Object.keys(peopleUpdate).length > 0) {
        const { error: updatePersonErr } = await supabaseAdmin
          .from('people')
          .update(peopleUpdate)
          .eq('id', peopleRow.id)
        if (updatePersonErr) {
          console.error('Update people failed:', updatePersonErr)
          return new Response(JSON.stringify({ error: `Failed to update people row: ${updatePersonErr.message}` }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      }
    }

    // --- Step 4: Find or create the auth.users + profiles rows ---
    let { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, member_type, subscription_status, membership_override, phone')
      .ilike('email', normalizedEmail)
      .maybeSingle()

    let authUserId: string | null = existingProfile?.id ?? null
    let createdAuth = false

    // If no profile exists AND we're activating, create the auth account
    const shouldCreateAuth = !existingProfile && member_status === 'active'

    if (shouldCreateAuth) {
      // Generate a strong random password — the user will reset it via email
      const tempPassword = crypto.randomUUID() + 'Aa1!'
      const { data: newAuth, error: createAuthErr } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: full_name ?? null }
      })

      if (createAuthErr) {
        console.error('Create auth user failed:', createAuthErr)
        return new Response(JSON.stringify({ error: `Failed to create auth user: ${createAuthErr.message}`, partial_success: { people_updated: true, changes } }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      authUserId = newAuth.user.id
      createdAuth = true
      changes.push('created auth.users + profiles via trigger')

      // The handle_new_user trigger should auto-create the profile row.
      // Re-fetch it.
      const { data: newProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, email, member_type, subscription_status, membership_override, phone')
        .eq('id', authUserId)
        .maybeSingle()
      existingProfile = newProfile
    }

    // --- Step 5: Mirror tier/status to profiles ---
    if (existingProfile && authUserId) {
      const profileUpdate: Record<string, unknown> = {}
      // Map new schema 胢↙ old profiles columns
      if (member_tier !== null && member_tier !== undefined) {
        profileUpdate.member_type = member_tier
      }
      if (member_status !== null && member_status !== undefined) {
        profileUpdate.subscription_status = member_status === 'active' ? 'active' : member_status
      }
      if (override_paying !== null && override_paying !== undefined) {
        profileUpdate.membership_override = override_paying
      }
      if (phone !== null && phone !== undefined) {
        profileUpdate.phone = phone
      }
      if (full_name) {
        profileUpdate.full_name = full_name
      }
      if (member_status === 'active' && !existingProfile.subscription_status) {
        profileUpdate.member_since = new Date().toISOString()
      }
      profileUpdate.updated_at = new Date().toISOString()

      if (Object.keys(profileUpdate).length > 0) {
        const { error: updateProfileErr } = await supabaseAdmin
          .from('profiles')
          .update(profileUpdate)
          .eq('id', authUserId)
        if (updateProfileErr) {
          console.error('Update profile failed:', updateProfileErr)
          // Don't fail the whole request — profile mirror is secondary
        } else {
          changes.push('profile mirrored')
        }
      }
    }

    // --- Step 6: Cancel business-only event credentials on demotion ---
    const wasDemoted = priorTier === 'business' && member_tier === 'social'
    if (wasDemoted && peopleRow) {
      const { data: businessEvents } = await supabaseAdmin
        .from('events')
        .select('id')
        .eq('access_level_deprecated', 'business_only')

      const businessEventIds = (businessEvents ?? []).map(e => e.id)

      if (businessEventIds.length > 0) {
        const { error: cancelErr, count } = await supabaseAdmin
          .from('attendance_credentials')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
          .eq('person_id', peopleRow.id)
          .in('event_id', businessEventIds)
          .in('status', ['active', 'used'])
        if (cancelErr) {
          console.error('Cancel business-only credentials failed:', cancelErr)
        } else {
          changes.push(`canceled ${count ?? 0} business-only event credential(s)`)
        }
      }
    }

    // --- Step 7: Send password setup email if requested and we created auth ---
    if (send_setup_email && createdAuth && authUserId) {
      try {
        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email: normalizedEmail,
        })

        if (linkErr || !linkData) {
          console.error('Generate recovery link failed:', linkErr)
          changes.push('WARNING: account created but setup email failed')
        } else {
          const setupLink = linkData.properties?.action_link
          // Fire the send-email function using the existing 'welcome-setup' template
          const { error: emailErr } = await supabaseAdmin.functions.invoke('send-email', {
            body: {
              template: 'welcome-setup',
              to: normalizedEmail,
              data: {
                name: full_name ?? normalizedEmail,
                setupLink,
              }
            }
          })
          if (emailErr) {
            console.error('Send setup email failed:', emailErr)
            changes.push('WARNING: account created but setup email failed to send')
          } else {
            changes.push('setup email sent')
          }
        }
      } catch (e) {
        console.error('Setup email block error:', e)
        changes.push('WARNING: setup email block failed')
      }
    }

    return new Response(JSON.stringify({
      success: true,
      people_id: peopleRow?.id,
      auth_user_id: authUserId,
      created_auth: createdAuth,
      changes,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
