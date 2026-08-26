<#
    exchange-member-blast-send.ps1

    Gated, hardened sender for the Aug 27 Exchange invite to unregistered active
    social members.

    Design rules this script enforces, not assumes:
      * The audience is recomputed live from prod at run time. Nothing is hardcoded.
      * HARD CAP of 70 recipients. Over the cap the script stops before sending.
      * One POST per recipient. The "to" field is asserted to be a single scalar
        address before every POST, and re-asserted from Resend after every POST.
      * Every send is journalled to disk, so a re-run can never double-send.

    Modes:
      Manifest   read-only, prints the audience and every assertion
      Preview    one email to the preview address, banner on top
      Canary     recipient #1 only
      Remainder  recipients #2..n, 600ms apart
#>

[CmdletBinding()]
param(
    [ValidateSet('Manifest', 'Render', 'Preview', 'Canary', 'Remainder')]
    [string]$Mode = 'Manifest',

    # Required for anything that actually sends.
    [switch]$Confirm,

    # Walks the full send path - guards, payload build, skip logic - but stops
    # short of the POST and writes nothing to the journal.
    [switch]$DryRun,

    [string]$PreviewTo = 'adam@cltbucketlist.com'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot   = Split-Path -Parent $PSScriptRoot
$EventId    = '02afde72-33c4-4c99-8dba-0ea5a8c0a723'
# Bumped whenever the creative changes. The journal is keyed on it, so a resume
# cannot re-send a preview (or anything else) that this version already sent.
$Version    = 'v2'
$HardCap    = 70
$FromHeader = '704 Collective <hello@704collective.com>'
$ReplyTo    = 'hello@704collective.com'
$Subject    = "Thursday's Beer Garden event"
$RsvpUrl    = 'https://704collective.com/exchange/rsvp'
$LogPath    = Join-Path $RepoRoot 'outputs\exchange-blast-log.json'
$SpacingMs  = 600

# Greeting overrides for this send only. Stored profile data is never touched:
# the profile still reads "Lucinda Ostrowski", she is simply greeted as she goes by.
$FirstNameOverrides = @{
    'lucyrowley7@gmail.com' = 'Lucy'
}

$ManualExclusions = @(
    'adam@cltbucketlist.com',
    'timi@cltbucketlist.com',
    'dtimi22@gmail.com',
    'baumanngabbi@gmail.com'
)

# ── environment ─────────────────────────────────────────────────────────────
function Get-DotEnv {
    param([string]$Path)
    $map = @{}
    foreach ($line in Get-Content -Path $Path) {
        if ($line -match '^\s*#') { continue }
        $i = $line.IndexOf('=')
        if ($i -lt 1) { continue }
        $k = $line.Substring(0, $i).Trim()
        $v = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
        $map[$k] = $v
    }
    return $map
}

$dotenv       = Get-DotEnv (Join-Path $RepoRoot '.env.local')
$SupabaseUrl  = $dotenv['NEXT_PUBLIC_SUPABASE_URL']
$ServiceKey   = $dotenv['SUPABASE_SERVICE_ROLE_KEY']
$ResendKey    = $dotenv['RESEND_API_KEY']

if (-not $SupabaseUrl -or -not $ServiceKey) { throw 'Supabase credentials missing from .env.local' }
if (-not $ResendKey)  { throw 'RESEND_API_KEY missing from .env.local' }

# This send is deliberately against production. Assert it rather than hope.
if ($SupabaseUrl -notmatch 'bnmtynevbuplqpuqvmna') {
    throw "REFUSING TO RUN: expected the production project, got $SupabaseUrl"
}

# ── guards ──────────────────────────────────────────────────────────────────

<#  A recipient address must be one scalar string holding exactly one mailbox.
    This is the guard that stops a comma-joined list, an array that got
    stringified, or a display-name form from ever reaching the "to" field. #>
function Assert-ScalarEmail {
    param($Value, [string]$Context)

    if ($null -eq $Value)                { throw "[$Context] address is null" }
    if ($Value -isnot [string])          { throw "[$Context] address is $($Value.GetType().Name), expected a scalar string" }
    if ([string]::IsNullOrWhiteSpace($Value)) { throw "[$Context] address is empty" }

    $at = $Value.Length - $Value.Replace('@', '').Length
    if ($at -ne 1)                       { throw "[$Context] address has $at '@' characters: '$Value'" }
    if ($Value -match '[\s,;<>"]')       { throw "[$Context] address contains a delimiter or whitespace: '$Value'" }
    if ($Value.Length -lt 6)             { throw "[$Context] address implausibly short: '$Value'" }

    return $Value
}

function Assert-ScalarName {
    param($Value, [string]$Context)
    if ($null -eq $Value)                { throw "[$Context] first name is null" }
    if ($Value -isnot [string])          { throw "[$Context] first name is $($Value.GetType().Name), expected a scalar string" }
    if ([string]::IsNullOrWhiteSpace($Value)) { throw "[$Context] first name is empty" }
    if ($Value -match '[<>{}]')          { throw "[$Context] first name contains markup: '$Value'" }
    return $Value
}

# ── prod reads (PostgREST, read-only) ───────────────────────────────────────
<#  Windows PowerShell 5.1's ConvertFrom-Json emits a JSON array as ONE object
    rather than enumerating it, so a naive @(...) yields a single element that
    is itself the whole list - which is precisely how a 64-address string ends
    up in a "to" field. Every read therefore returns an explicit flat array,
    and the unary comma stops PowerShell re-unrolling it on return. #>
function Invoke-Rest {
    param([string]$PathAndQuery)
    $headers = @{
        apikey        = $ServiceKey
        Authorization = "Bearer $ServiceKey"
        Accept        = 'application/json'
    }
    $resp   = Invoke-WebRequest -Method GET -Uri "$SupabaseUrl/rest/v1/$PathAndQuery" -Headers $headers -UseBasicParsing
    $parsed = $resp.Content | ConvertFrom-Json
    if ($null -eq $parsed)            { return , @() }
    if ($parsed -is [System.Array])   { return , $parsed }
    return , @($parsed)
}

<#  Option A audience, recomputed at send time.

    Include: live, non-internal, non-704-domain, non-admin profiles that are
    social members in an active or trialing subscription and are not marketing
    unsubscribed. Comped members are included by design - membership_override
    is deliberately not consulted here.

    Exclude: anyone already holding an active or used credential on the event,
    anyone unsubscribed on the contacts table, and the four named addresses. #>
function Get-Audience {
    $q = @(
        'deleted_at=is.null',
        'is_internal=is.false',
        'marketing_unsubscribed=is.false',
        'member_type=eq.social',
        'subscription_status=in.(active,trialing)',
        'role=not.in.(admin,super_admin)',
        'email=not.like.*@704collective.com',
        'select=id,email,full_name',
        'order=full_name.asc'
    ) -join '&'
    $profiles = Invoke-Rest "profiles?$q"
    Write-Host ("  base profiles (Option A include set)      : {0}" -f $profiles.Count)

    # Already registered for this event, by credential.
    $creds = Invoke-Rest "attendance_credentials?event_id=eq.$EventId&status=in.(active,used)&select=person_id"
    $personIds = @($creds | ForEach-Object { $_.person_id } | Where-Object { $_ } | Select-Object -Unique)

    $registeredAuthIds = New-Object System.Collections.Generic.HashSet[string]
    $registeredEmails  = New-Object System.Collections.Generic.HashSet[string]
    if ($personIds.Count -gt 0) {
        # Chunked so the URL cannot overflow on a big event.
        for ($i = 0; $i -lt $personIds.Count; $i += 50) {
            $chunk = $personIds[$i..([Math]::Min($i + 49, $personIds.Count - 1))]
            $inList = '(' + ($chunk -join ',') + ')'
            $people = Invoke-Rest "people?id=in.$inList&select=id,auth_user_id,email_lower"
            foreach ($p in $people) {
                if ($p.auth_user_id) { [void]$registeredAuthIds.Add([string]$p.auth_user_id) }
                if ($p.email_lower)  { [void]$registeredEmails.Add(([string]$p.email_lower).ToLower()) }
            }
        }
    }
    Write-Host ("  credentials on the event (active/used)    : {0}" -f $creds.Count)

    # Contact-level unsubscribes.
    $unsubRows = Invoke-Rest 'contacts?unsubscribed=is.true&select=email'
    $unsub = New-Object System.Collections.Generic.HashSet[string]
    foreach ($r in $unsubRows) {
        if ($r.email) { [void]$unsub.Add(([string]$r.email).Trim().ToLower()) }
    }
    Write-Host ("  contacts marked unsubscribed              : {0}" -f $unsub.Count)

    $manual = New-Object System.Collections.Generic.HashSet[string]
    foreach ($m in $ManualExclusions) { [void]$manual.Add($m.ToLower()) }

    $excludedRegistered = 0; $excludedUnsub = 0; $excludedManual = 0
    $out = New-Object System.Collections.Generic.List[object]
    $seen = New-Object System.Collections.Generic.HashSet[string]

    foreach ($p in $profiles) {
        $email = ([string]$p.email).Trim()
        $lower = $email.ToLower()

        if ($registeredAuthIds.Contains([string]$p.id) -or $registeredEmails.Contains($lower)) { $excludedRegistered++; continue }
        if ($unsub.Contains($lower))  { $excludedUnsub++;  continue }
        if ($manual.Contains($lower)) { $excludedManual++; continue }
        if (-not $seen.Add($lower))   { continue }   # de-dupe, belt and braces

        $full  = ([string]$p.full_name).Trim()
        $first = ($full -split '\s+')[0]

        $overridden = $false
        if ($FirstNameOverrides.ContainsKey($lower)) {
            $first = $FirstNameOverrides[$lower]
            $overridden = $true
        }

        $out.Add([pscustomobject]@{
            ProfileId  = [string]$p.id
            Email      = Assert-ScalarEmail -Value $email -Context "profile $($p.id)"
            FirstName  = Assert-ScalarName  -Value $first -Context "profile $($p.id)"
            FullName   = $full
            Overridden = $overridden
        })
    }

    Write-Host ("  excluded, already registered              : {0}" -f $excludedRegistered)
    Write-Host ("  excluded, contact unsubscribed            : {0}" -f $excludedUnsub)
    Write-Host ("  excluded, manual list                     : {0}" -f $excludedManual)
    return $out
}

# ── the email ───────────────────────────────────────────────────────────────
$BodyTemplate = @'
{{BANNER}}<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#FAF6F0;">Hey {{FIRST_NAME}},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#D8D8D8;">Tomorrow, Thursday (8/27) we've got the beer garden at The Village at Commonwealth. First drink's on us and there will be a food truck serving.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#D8D8D8;">There are two different ways to do the night, pick one when you RSVP:</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#D8D8D8;"><strong style="color:#FAF6F0;">The Exchange</strong>, 7 to 8. This part is business networking. Small groups, six minutes, rotate. We match you with other professionals based on what you do and who you're looking to meet. One hour, more real business conversations than a month of happy hours.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#D8D8D8;"><strong style="color:#FAF6F0;">Just the social</strong>. Skip the networking entirely. Post up in the beer garden, drink in hand, zero structure. Same night, none of the business mixer rounds, just a social vibe! If you do the exchange mixer, don't worry, you'll still have time before and after to socialize and meet new faces!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#D8D8D8;">Either way, you have to RSVP. No walk-ins for the exchange, and the list is what gets you in the door.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
<tr><td align="center" style="background-color:#FAF6F0;border-radius:8px;">
<a href="{{RSVP_URL}}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">RSVP here</a>
</td></tr>
</table>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#D8D8D8;">Heads up: sign in when you RSVP so you get the member options.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#D8D8D8;">Doors at 6:30 PM.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#D8D8D8;">Please let us know if you have any questions by replying to this email.</p>
<p style="margin:0;font-size:15px;line-height:1.6;color:#D8D8D8;">See you there!</p>
'@

$PreviewBanner = @'
<p style="margin:0 0 24px;padding:12px 16px;background-color:rgba(198,166,100,0.12);border:1px solid #C6A664;border-radius:8px;font-size:13px;font-weight:600;color:#C6A664;text-align:center;">PREVIEW - the real send personalizes per recipient</p>
'@

# The dark 704 shell, matching supabase/functions/send-email baseLayout(theme: dark).
#
# The unsubscribe line is deliberately absent: members cannot self-unsubscribe
# (locked policy), and send-email strips it for non-marketing sends anyway.
#
# The header uses the circular badge (logo.png), NOT logo-email-dark.png. Gmail's
# dark mode inverts background and text but leaves images alone, so the white
# wordmark ends up white-on-light and vanishes. The badge is fully opaque and
# carries its own white field, so it stays legible whether or not the client
# inverts around it.
$ShellTemplate = @'
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>{{TITLE}}</title>
<style type="text/css">
body{margin:0;padding:0;background-color:#1A1A1A;font-family:'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;}
table{border-collapse:collapse;}
.container{max-width:600px;}
img{display:block;border:0;max-width:100%;height:auto;}
a{color:#C6A664;text-decoration:none;}
</style>
</head>
<body bgcolor="#1A1A1A" style="margin:0;padding:0;background-color:#1A1A1A;font-family:'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;color:#FAF6F0;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:transparent;">{{PREHEADER}}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1A1A1A" style="background-color:#1A1A1A;">
<tr>
<td align="center" valign="top" style="padding:32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="max-width:600px;width:100%;background-color:#2E2E2E;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.10);">
<tr><td align="center" style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.10);">
<img src="https://704collective.com/logo.png" alt="704 Collective" width="120" height="120" style="display:block;width:120px;height:120px;border-radius:50%;border:0;" />
</td></tr>
<tr><td style="padding:32px 40px;">
{{CONTENT}}
</td></tr>
<tr><td style="padding:0;height:0;line-height:0;border-top:1px solid rgba(255,255,255,0.10);font-size:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:24px 40px;">
<p style="margin:0;font-size:13px;color:rgba(255,255,255,0.4);text-align:center;">704 Collective &middot; Charlotte, NC</p>
</td></tr>
</table>
</td>
</tr>
</table>
</body>
</html>
'@

function New-EmailHtml {
    param(
        [string]$FirstName,
        [switch]$Banner
    )
    $body = $BodyTemplate.
        Replace('{{FIRST_NAME}}', [System.Net.WebUtility]::HtmlEncode($FirstName)).
        Replace('{{RSVP_URL}}',   $RsvpUrl).
        Replace('{{BANNER}}',     $(if ($Banner)  { $PreviewBanner } else { '' }))

    return $ShellTemplate.
        Replace('{{TITLE}}',     "Thursday's Beer Garden event").
        Replace('{{PREHEADER}}', "Tomorrow, Thursday (8/27) we've got the beer garden at The Village at Commonwealth.").
        Replace('{{CONTENT}}',   $body)
}

function New-EmailText {
    param([string]$FirstName)
    $body = @"
Hey $FirstName,

Tomorrow, Thursday (8/27) we've got the beer garden at The Village at Commonwealth. First drink's on us and there will be a food truck serving.

There are two different ways to do the night, pick one when you RSVP:

The Exchange, 7 to 8. This part is business networking. Small groups, six minutes, rotate. We match you with other professionals based on what you do and who you're looking to meet. One hour, more real business conversations than a month of happy hours.

Just the social. Skip the networking entirely. Post up in the beer garden, drink in hand, zero structure. Same night, none of the business mixer rounds, just a social vibe! If you do the exchange mixer, don't worry, you'll still have time before and after to socialize and meet new faces!

Either way, you have to RSVP. No walk-ins for the exchange, and the list is what gets you in the door.

RSVP here: $RsvpUrl

Heads up: sign in when you RSVP so you get the member options.

Doors at 6:30 PM.

Please let us know if you have any questions by replying to this email.

See you there!

704 Collective - Charlotte, NC
"@
    return $body
}

<#  ── journal ────────────────────────────────────────────────────────────────

    Intent is recorded BEFORE the POST and confirmed after. If the process dies
    mid-flight the address is left marked "attempting", which blocks a resume
    from re-sending it. Only a POST that Resend itself rejected is marked
    "failed_prepost" and therefore safe to retry, because no mail was created.

    Note the same PS 5.1 trap as the REST reads: ConvertFrom-Json hands back a
    JSON array as one object, so a naive @() would make a 46-entry journal look
    like a single entry and defeat the duplicate guard entirely. #>

function Get-Journal {
    if (-not (Test-Path $LogPath)) { return , @() }
    $raw = Get-Content $LogPath -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) { return , @() }
    $parsed = $raw | ConvertFrom-Json
    if ($null -eq $parsed)          { return , @() }
    if ($parsed -is [System.Array]) { return , $parsed }
    return , @($parsed)
}

$script:Journal = New-Object System.Collections.Generic.List[object]
foreach ($e in (Get-Journal)) { $script:Journal.Add($e) }

function Save-Journal {
    $dir = Split-Path -Parent $LogPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    ConvertTo-Json -InputObject $script:Journal.ToArray() -Depth 5 | Set-Content -Path $LogPath -Encoding UTF8
}

# Addresses a resume must not touch again: sent, or attempted with an unknown outcome.
function Get-BlockedAddresses {
    $set = New-Object System.Collections.Generic.HashSet[string]
    foreach ($e in $script:Journal) {
        if (-not $e.email) { continue }
        if ($e.status -eq 'failed_prepost') { continue }
        [void]$set.Add(([string]$e.email).ToLower())
    }
    # Unary comma: without it PowerShell enumerates the set on return and the
    # caller ends up holding a bare string instead of the lookup.
    return , $set
}

function Test-PreviewAlreadySent {
    foreach ($e in $script:Journal) {
        if ($e.kind -eq 'preview' -and $e.version -eq $Version -and $e.status -ne 'failed_prepost') { return $true }
    }
    return $false
}

# ── the send ────────────────────────────────────────────────────────────────
function Send-One {
    param(
        [string]$Email,
        [string]$FirstName,
        [int]$Index,
        [string]$Kind,
        [switch]$Banner,
        [switch]$PrintPayload
    )

    # PRE-POST: the address must be one scalar mailbox.
    $to = Assert-ScalarEmail -Value $Email     -Context "send #$Index"
    $fn = Assert-ScalarName  -Value $FirstName -Context "send #$Index"

    $html = New-EmailHtml -FirstName $fn -Banner:$Banner
    $text = New-EmailText -FirstName $fn

    # Built as a one-element array so the count is assertable, from a value
    # already proven to be a single scalar mailbox.
    $recipients = @($to)
    if ($recipients.Count -ne 1) { throw "[send #$Index] recipient array holds $($recipients.Count) entries" }

    $payload = [ordered]@{
        from     = $FromHeader
        to       = $recipients
        reply_to = $ReplyTo
        subject  = $Subject
        html     = $html
        text     = $text
    }

    if ($PrintPayload) {
        $shown = [ordered]@{
            endpoint = 'POST https://api.resend.com/emails'
            headers  = [ordered]@{ 'Content-Type' = 'application/json'; Authorization = 'Bearer <redacted>' }
            from     = $payload.from
            to       = $payload.to
            to_count = $payload.to.Count
            reply_to = $payload.reply_to
            subject  = $payload.subject
            html_len = $html.Length
            text_len = $text.Length
        }
        Write-Host '  --- payload (key redacted) ---'
        ($shown | ConvertTo-Json -Depth 5) -split "`n" | ForEach-Object { Write-Host "  $_" }
    }

    if ($DryRun) {
        Write-Host ("  [{0,2}] {1,-42} DRY RUN, assertions passed, nothing posted" -f $Index, $to)
        return [pscustomobject]@{
            n = $Index; email = $to; firstName = $fn; kind = $Kind; version = $Version
            status = 'dryrun'; id = 'dry-run'; toCount = 1; sentAt = $null; attemptAt = $null
        }
    }

    # Record the intent before the wire call, so a crash cannot look like a no-send.
    $entry = [pscustomobject]@{
        n         = $Index
        email     = $to
        firstName = $fn
        kind      = $Kind
        version   = $Version
        status    = 'attempting'
        id        = $null
        toCount   = $null
        sentAt    = $null
        attemptAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    $script:Journal.Add($entry)
    Save-Journal

    try {
        $res = Invoke-RestMethod -Method POST -Uri 'https://api.resend.com/emails' `
            -Headers @{ Authorization = "Bearer $ResendKey"; 'Content-Type' = 'application/json' } `
            -Body ($payload | ConvertTo-Json -Depth 5 -Compress)
    }
    catch {
        # Resend refused the request: no mail exists, so this address is retryable.
        $entry.status = 'failed_prepost'
        Save-Journal
        throw "[send #$Index] POST rejected for $to : $($_.Exception.Message)"
    }

    if (-not $res.id) { throw "[send #$Index] Resend returned no id" }

    # Capture the id the moment we have it. If verification then fails, the
    # journal still names the message instead of leaving an anonymous
    # "attempting" row that has to be reconciled by hand.
    $entry.id     = $res.id
    $entry.status = 'posted'
    Save-Journal

    # POST-POST: ask Resend who it actually addressed. Reads lag writes, so a
    # 404 here means "not queryable yet", not "not sent" - retry before judging.
    $check = $null
    $delays = @(400, 900, 1800, 3000, 5000)
    for ($try = 0; $try -lt $delays.Count; $try++) {
        Start-Sleep -Milliseconds $delays[$try]
        try {
            $check = Invoke-RestMethod -Method GET -Uri "https://api.resend.com/emails/$($res.id)" `
                -Headers @{ Authorization = "Bearer $ResendKey" }
            break
        }
        catch {
            if ($try -eq $delays.Count - 1) {
                throw "[send #$Index] sent as $($res.id) but unverifiable after $($delays.Count) attempts: $($_.Exception.Message)"
            }
        }
    }

    $actual = @($check.to)
    if ($actual.Count -ne 1) { throw "[send #$Index] Resend reports $($actual.Count) recipients on $($res.id)" }
    if ($actual[0].ToLower() -ne $to.ToLower()) { throw "[send #$Index] Resend addressed $($actual[0]), expected $to" }

    $entry.status  = 'sent'
    $entry.toCount = $actual.Count
    $entry.sentAt  = (Get-Date).ToUniversalTime().ToString('o')
    Save-Journal

    Write-Host ("  [{0,2}] {1,-42} id={2}  to.Count=1  verified" -f $Index, $to, $res.id)
    return $entry
}

# ── main ────────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host "=== exchange member blast :: mode=$Mode version=$Version ==="
Write-Host ''
Write-Host 'AUDIENCE (recomputed live from production)'
$audience = @(Get-Audience)

Write-Host ''
Write-Host ("FINAL AUDIENCE: {0} recipients (hard cap {1})" -f $audience.Count, $HardCap)
if ($audience.Count -gt $HardCap) {
    throw "STOP: audience of $($audience.Count) exceeds the hard cap of $HardCap. Nothing was sent."
}
if ($audience.Count -eq 0) { throw 'STOP: audience is empty.' }

$distinct = @($audience | ForEach-Object { $_.Email.ToLower() } | Select-Object -Unique).Count
if ($distinct -ne $audience.Count) { throw "STOP: $($audience.Count) rows but only $distinct distinct addresses." }

Write-Host ''
Write-Host 'MANIFEST'
$i = 0
foreach ($r in $audience) {
    $i++
    $tag = if ($r.Overridden) { "  <- greeting override, profile reads '$($r.FullName)'" } else { '' }
    Write-Host ("  {0,2}. {1,-42} {2}{3}" -f $i, $r.Email, $r.FirstName, $tag)
}

$blocked = Get-BlockedAddresses
if ($script:Journal.Count -gt 0) {
    $sentCount    = @($script:Journal | Where-Object { $_.status -eq 'sent' }).Count
    $pendingCount = @($script:Journal | Where-Object { $_.status -eq 'attempting' -or $_.status -eq 'posted' }).Count
    Write-Host ''
    Write-Host ("JOURNAL: {0} entries ({1} sent, {2} unresolved). {3} address(es) are blocked from re-send." -f `
        $script:Journal.Count, $sentCount, $pendingCount, $blocked.Count)
    if ($pendingCount -gt 0) {
        Write-Host '  WARNING: unresolved attempts present. They are blocked, not retried. Resolve by hand.'
    }
    $inAudience = @($audience | Where-Object { $blocked.Contains($_.Email.ToLower()) }).Count
    Write-Host ("  of the current audience, {0} already handled and will be skipped." -f $inAudience)
}

if ($Mode -eq 'Manifest') {
    Write-Host ''
    Write-Host 'Manifest mode: read-only. Nothing was sent.'
    return
}

if ($Mode -eq 'Render') {
    $sample  = $audience[0].FirstName
    $outDir  = Join-Path $RepoRoot 'outputs'
    if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

    $plain = New-EmailHtml -FirstName $sample
    $path  = Join-Path $outDir "exchange-blast-render-$Version.html"
    Set-Content -Path $path -Value $plain -Encoding UTF8

    Write-Host ''
    Write-Host "RENDERED (recipient #1, first name '$sample')"
    Write-Host ("  subject   : {0}" -f $Subject)
    Write-Host ("  from      : {0}" -f $FromHeader)
    Write-Host ("  reply_to  : {0}" -f $ReplyTo)
    Write-Host ("  saved     : {0} ({1} bytes)" -f $path, $plain.Length)
    Write-Host ''
    Write-Host '  --- plain text part ---'
    (New-EmailText -FirstName $sample) -split "`n" | ForEach-Object { Write-Host "  $_" }
    Write-Host ''
    Write-Host 'Render mode: read-only. Nothing was sent.'
    return
}

if (-not $Confirm) { throw "STOP: $Mode requires -Confirm." }

$sent = New-Object System.Collections.Generic.List[object]

switch ($Mode) {

    'Preview' {
        Write-Host ''
        Write-Host "PREVIEW -> $PreviewTo"
        if (Test-PreviewAlreadySent) {
            throw "STOP: a $Version preview is already journalled. Bump `$Version or clear the journal entry deliberately."
        }
        $rec = Send-One -Email $PreviewTo -FirstName 'Adam' -Index 0 -Kind 'preview' -Banner -PrintPayload
        $sent.Add($rec)
    }

    'Canary' {
        $first = $audience[0]
        Write-Host ''
        Write-Host ("CANARY -> recipient #1 of {0}" -f $audience.Count)
        if ($blocked.Contains($first.Email.ToLower())) { throw "STOP: recipient #1 ($($first.Email)) is already in the journal." }
        $rec = Send-One -Email $first.Email -FirstName $first.FirstName -Index 1 -Kind 'canary' -PrintPayload
        $sent.Add($rec)
    }

    'Remainder' {
        Write-Host ''
        # Walks the whole list, not #2 onward: if the audience re-sorts between
        # the canary and the batch, a fixed start index would skip somebody.
        # The journal is what excludes the canary.
        Write-Host ("REMAINDER -> walking all {0} recipients, {1}ms apart, journal-skipping anyone already sent" -f $audience.Count, $SpacingMs)
        for ($n = 1; $n -le $audience.Count; $n++) {
            $r = $audience[$n - 1]
            if ($blocked.Contains($r.Email.ToLower())) {
                Write-Host ("  [{0,2}] {1,-42} SKIPPED (already in journal)" -f $n, $r.Email)
                continue
            }
            $rec = Send-One -Email $r.Email -FirstName $r.FirstName -Index $n -Kind 'remainder'
            $sent.Add($rec)
            if (-not $DryRun) { Start-Sleep -Milliseconds $SpacingMs }
        }

        # One random re-verify against Resend after the batch.
        if ($sent.Count -gt 0 -and -not $DryRun) {
            $pick = $sent | Get-Random
            $check = Invoke-RestMethod -Method GET -Uri "https://api.resend.com/emails/$($pick.id)" `
                -Headers @{ Authorization = "Bearer $ResendKey" }
            $ok = (@($check.to).Count -eq 1) -and (@($check.to)[0].ToLower() -eq $pick.email.ToLower())
            Write-Host ''
            Write-Host ("POST-BATCH RANDOM RE-VERIFY: #{0} {1} id={2} to.Count={3} subject='{4}' -> {5}" -f `
                $pick.n, $pick.email, $pick.id, @($check.to).Count, $check.subject, $(if ($ok) { 'PASS' } else { 'FAIL' }))
            if (-not $ok) { throw 'STOP: post-batch re-verify failed.' }
        }
    }
}

Write-Host ''
Write-Host ("SENT THIS RUN: {0}" -f $sent.Count)
foreach ($s in $sent) { Write-Host ("  #{0,-3} {1,-42} {2}" -f $s.n, $s.email, $s.id) }
Write-Host ''
