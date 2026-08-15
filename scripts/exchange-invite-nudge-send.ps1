<#
    Exchange invite nudge sender.

    Sends one personalized nudge to each Exchange invitee who still has
    status='invited' (i.e. has not submitted their four intake questions), using the
    same template shell, from-address, venue block and footer as the original invite.

    Modes:
      -Mode manifest   Print the manifest and email #1 as text. Sends nothing.
      -Mode preview    Manifest, plus ONE preview to $PreviewTo with a dead token.
      -Mode canary     Manifest, plus recipient #1 only.
      -Mode remaining  Manifest, plus recipients #2..N.

    ============================================================================
    THE PS 5.1 PITFALL THIS SCRIPT GUARDS AGAINST
    ============================================================================
    On 2026-08-14 an earlier version of this send collapsed 7 personalized emails
    into ONE email addressed to all 7 recipients, exposing every address and invite
    token to the whole group. Root cause:

      $rows = @(Invoke-RestMethod -Uri $url -Headers $h)   # <-- DO NOT DO THIS

    In Windows PowerShell 5.1, Invoke-RestMethod writes a JSON array to the
    pipeline as a SINGLE object rather than enumerating it. Wrapping the call in
    @(...) therefore produces a one-element array whose single element is the whole
    collection. $rows.Count reports 1, every count-based guard passes, and

      foreach ($r in $rows) { ... $r.email ... }

    runs exactly once with $r bound to all rows at once. PowerShell's member
    enumeration then flattens $r.email into an array of every address, and the
    Resend API happily accepts an array for "to" -- so one email goes to everyone.

    Two independent defenses below, because a count check alone did not catch it:
      1. Enumerate explicitly into an ArrayList. Never wrap the call in @().
      2. Per-row scalar guards: email, first_name and invite_token must each be a
         single [string] matching an expected shape. A collection fails the type
         test and aborts before any POST.
      3. Pre-POST payload assertion: the "to" field must be exactly one address.
      4. Post-send readback: GET the message from Resend and assert to.Count -eq 1.
#>

[CmdletBinding()]
param(
    [ValidateSet('manifest', 'preview', 'canary', 'remaining')]
    [string]$Mode = 'manifest',

    [string]$EventId = '02afde72-33c4-4c99-8dba-0ea5a8c0a723',
    [string]$PreviewTo = 'adam@cltbucketlist.com',
    [int]$HardCap = 12,

    # Tokens leaked by the 2026-08-14 mangled send. These were rotated; if any of
    # them still resolves to a live invitee the rotation did not take, and sending
    # would re-expose a compromised link.
    [string[]]$ForbiddenTokens = @(
        'EX-0CFA42F4DD6C', 'EX-6AA446959262', 'EX-8FDCFD2A4DAD', 'EX-4AAFD86254B4',
        'EX-096ED84D1002', 'EX-6170DB0787D7', 'EX-254F0AF098A0'
    )
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$SUBJECT = 'Your Exchange spot - quick 30 seconds'
$FROM = '704 Collective <hello@704collective.com>'
$REPLY_TO = 'hello@704collective.com'
$SUPA_URL = 'https://bnmtynevbuplqpuqvmna.supabase.co'
$PREVIEW_TOKEN = 'EX-PREVIEW0000'

function Fail([string]$msg) {
    Write-Host ""
    Write-Host "ABORT: $msg" -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------- credentials
$envFile = Get-Content .env.local
$RESEND = (($envFile | Where-Object { $_ -match '^RESEND_API_KEY=' }) -replace '^RESEND_API_KEY=', '').Trim().Trim('"')
$SRK = (($envFile | Where-Object { $_ -match '^SUPABASE_SERVICE_ROLE_KEY=' }) -replace '^SUPABASE_SERVICE_ROLE_KEY=', '').Trim().Trim('"')
if (-not $RESEND) { Fail 'RESEND_API_KEY not found in .env.local' }
if (-not $SRK) { Fail 'SUPABASE_SERVICE_ROLE_KEY not found in .env.local' }

# ------------------------------------------------------------------- template
# Identical shell to the original Aug 12 invite: same logo, same venue block,
# same footer, same ivory CTA. Only the body copy differs.
$TEMPLATE = @'
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Your Exchange spot</title>
<style type="text/css">
body{margin:0;padding:0;background-color:#1A1A1A;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}
table{border-collapse:collapse;}
.container{max-width:600px;}
img{display:block;border:0;max-width:100%;height:auto;}
a{color:#C6A664;text-decoration:none;}
</style>
</head>
<body bgcolor="#1A1A1A" style="margin:0;padding:0;background-color:#1A1A1A;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#FAF6F0;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:transparent;">We fixed the phone glitch. Your spot is still held. &nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1A1A1A" style="background-color:#1A1A1A;">
<tr>
<td align="center" valign="top" style="padding:32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="max-width:600px;width:100%;background-color:#2E2E2E;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.10);">
<tr><td align="center" style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.10);">
<img src="https://704collective.com/logo-email-dark.png" alt="704 Collective" width="120" style="display:block;width:120px;height:auto;border:0;" />
</td></tr>
<tr><td style="padding:32px 40px;">
__PREVIEWBANNER__
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#FAF6F0;">Hey __FIRSTNAME__,</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#D8D8D8;">First, apologies for the garbled email that landed in your inbox from us earlier, that was a technical hiccup on our end and safe to ignore. This is the real one.</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#D8D8D8;">Quick heads up: we also found and fixed a glitch that made the Exchange form a pain to fill out on phones. If you tried and gave up, that was us, not you, and it is sorted now.</p>
<p style="margin:0 0 4px;font-size:15px;line-height:1.6;color:#D8D8D8;">Your spot at the Exchange Mixer on Thursday, August 27 at 6:30 PM is still held. We just need your four quick questions so we can build your groups:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
<tr><td align="center" style="background-color:#FAF6F0;border-radius:8px;">
<a href="__LINK__" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">Answer the four questions</a>
</td></tr>
</table>
<p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#A0A0A0;">That link is just for you, so there is no need to sign in.</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#D8D8D8;">Takes about 30 seconds. See you there.</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#D8D8D8;">Thursday, August 27 &middot; 6:30 to 8:30 PM<br />Beer Garden at The Village at Commonwealth<br />1308 Lorna St, Charlotte, NC</p>
<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#A0A0A0;">Questions? Just reply here.</p>
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

$PREVIEW_BANNER = '<p style="margin:0 0 20px;padding:12px 14px;background-color:rgba(198,166,100,0.12);border:1px solid #C6A664;border-radius:8px;font-size:13px;line-height:1.5;color:#C6A664;">PREVIEW - the real send personalizes per recipient</p>'

function Build-Body([string]$firstName, [string]$link, [string]$banner) {
    return $TEMPLATE.Replace('__PREVIEWBANNER__', $banner).Replace('__FIRSTNAME__', $firstName).Replace('__LINK__', $link)
}

function ConvertTo-PlainText([string]$html) {
    $t = $html
    $t = [regex]::Replace($t, '(?s)<head.*?</head>', '')
    $t = [regex]::Replace($t, '(?s)<div style="display:none.*?</div>', '')
    $t = [regex]::Replace($t, '(?i)<br\s*/?>', "`n")
    $t = [regex]::Replace($t, '(?i)</p>', "`n`n")
    $t = [regex]::Replace($t, '(?is)<a [^>]*href="([^"]*)"[^>]*>(.*?)</a>', '[$2 -> $1]')
    $t = [regex]::Replace($t, '(?s)<[^>]+>', '')
    # [char] rather than a `u{} escape: those are PowerShell 6+ only.
    $t = $t.Replace('&middot;', [string][char]0x00B7).Replace('&rsquo;', "'").Replace('&nbsp;', ' ').Replace('&#8203;', '').Replace('&amp;', '&')
    $t = [regex]::Replace($t, '[ \t]+', ' ')
    $t = [regex]::Replace($t, '(?m)^\s+', '')
    $t = [regex]::Replace($t, "`n{3,}", "`n`n")
    return $t.Trim()
}

# ------------------------------------------------------------------ live list
# NEVER wrap this call in @(). See the header comment. Enumerate explicitly.
$select = 'first_name,last_name,email,invite_token,status'
$url = "$SUPA_URL/rest/v1/exchange_intake?event_id=eq.$EventId&form_variant=eq.invited&status=eq.invited&select=$select&order=email.asc"
$response = Invoke-RestMethod -Method Get -Uri $url -Headers @{
    'apikey' = $SRK; 'Authorization' = "Bearer $SRK"; 'Content-Type' = 'application/json'
}

$rows = [System.Collections.ArrayList]::new()
foreach ($item in $response) { [void]$rows.Add($item) }

Write-Host "=== LIVE LIST ==="
Write-Host "  rows fetched: $($rows.Count)"
if ($rows.Count -eq 0) { Fail 'no invited rows to nudge' }
if ($rows.Count -gt $HardCap) { Fail "$($rows.Count) rows exceeds hard cap of $HardCap" }

# ------------------------------------------------------------- per-row guards
foreach ($r in $rows) {
    if ($r.email -isnot [string]) { Fail "email is $($r.email.GetType().Name), not a single string. This is the array-flattening bug." }
    if ($r.first_name -isnot [string]) { Fail "first_name is not a single string. This is the array-flattening bug." }
    if ($r.invite_token -isnot [string]) { Fail "invite_token is not a single string. This is the array-flattening bug." }
    if ($r.email -notmatch '^[^@\s,]+@[^@\s,]+\.[^@\s,]+$') { Fail "email '$($r.email)' is not a single valid address" }
    if ($r.invite_token -notmatch '^EX-[0-9A-F]{12}$') { Fail "invite_token '$($r.invite_token)' fails ^EX-[0-9A-F]{12}$" }
    if ([string]::IsNullOrWhiteSpace($r.first_name)) { Fail "first_name is blank for $($r.email)" }
    if ($ForbiddenTokens -contains $r.invite_token) { Fail "token $($r.invite_token) was leaked on 2026-08-14 and is still live. ROTATION FAILED." }
}
Write-Host "  scalar guards:     PASS (one address, one name, one token per row)"
Write-Host "  token shape:       PASS (all match ^EX-[0-9A-F]{12}$)"
Write-Host "  rotation check:    PASS (no leaked token is live)"
Write-Host "  distinct addresses: $(($rows | ForEach-Object { $_.email.ToLower() } | Sort-Object -Unique).Count) of $($rows.Count)"
Write-Host ""

# -------------------------------------------------------------------- manifest
Write-Host "=== MANIFEST ($($rows.Count) recipients) ==="
$manifest = [System.Collections.ArrayList]::new()
for ($i = 0; $i -lt $rows.Count; $i++) {
    $r = $rows[$i]
    $name = (("$($r.first_name) $($r.last_name)").Trim())
    $link = "https://704collective.com/exchange/i/$($r.invite_token)"
    [void]$manifest.Add([pscustomobject]@{ n = $i + 1; name = $name; email = $r.email; token = $r.invite_token; link = $link; first = $r.first_name })
    Write-Host ("  {0}. {1} <{2}> -> {3}" -f ($i + 1), $name, $r.email, $link)
}
Write-Host ""

Write-Host "=== EMAIL #1 AS TEXT (subject: $SUBJECT) ==="
Write-Host (ConvertTo-PlainText (Build-Body $manifest[0].first $manifest[0].link ''))
Write-Host ""

# ----------------------------------------------------------------- the sender
$hdrResend = @{ 'Authorization' = "Bearer $RESEND"; 'Content-Type' = 'application/json' }

function Send-One([string]$toAddress, [string]$firstName, [string]$link, [string]$banner, [string]$label) {
    $payload = @{
        from     = $FROM
        to       = $toAddress
        subject  = $SUBJECT
        html     = (Build-Body $firstName $link $banner)
        reply_to = $REPLY_TO
    }

    # Pre-POST assertion: "to" must be exactly one address, never a collection.
    if ($payload.to -isnot [string]) { Fail "payload 'to' is not a single string for $label" }
    if ($payload.to -notmatch '^[^@\s,]+@[^@\s,]+\.[^@\s,]+$') { Fail "payload 'to' is not one valid address for $label" }
    if ($payload.html -notlike "*$link*") { Fail "payload html does not contain the expected link for $label" }

    $json = $payload | ConvertTo-Json -Depth 5
    Write-Host "  --- payload for $label (html truncated, no API key present) ---"
    $printable = $payload.Clone()
    $printable.html = "<{0} chars of HTML, CTA href = {1}>" -f $payload.html.Length, $link
    Write-Host ("  " + (($printable | ConvertTo-Json -Depth 5 -Compress)))

    try {
        $resp = Invoke-RestMethod -Method Post -Uri 'https://api.resend.com/emails' -Headers $hdrResend -Body $json
    } catch {
        $e = $_.Exception.Response
        $txt = ''
        if ($e) { $sr = New-Object System.IO.StreamReader($e.GetResponseStream()); $txt = $sr.ReadToEnd() }
        Fail "POST failed for $label : $txt"
    }
    Write-Host "  SENT -> $toAddress  id=$($resp.id)"

    # Post-send readback: confirm Resend recorded exactly one recipient.
    Start-Sleep -Milliseconds 700
    $msg = Invoke-RestMethod -Method Get -Uri "https://api.resend.com/emails/$($resp.id)" -Headers @{ 'Authorization' = "Bearer $RESEND" }
    $toList = @($msg.to)
    if ($toList.Count -ne 1) { Fail "Resend recorded $($toList.Count) recipients for $label (id $($resp.id))" }
    if ($toList[0].ToLower() -ne $toAddress.ToLower()) { Fail "Resend recorded '$($toList[0])' but expected '$toAddress' (id $($resp.id))" }
    Write-Host "  readback: to.Count=1, to[0]=$($toList[0]), last_event=$($msg.last_event)  ASSERTIONS PASS"
    return $resp.id
}

switch ($Mode) {
    'manifest' {
        Write-Host "=== MODE: manifest. Nothing sent. ==="
    }
    'preview' {
        Write-Host "=== MODE: preview -> $PreviewTo (dead token $PREVIEW_TOKEN) ==="
        $id = Send-One $PreviewTo $manifest[0].first "https://704collective.com/exchange/i/$PREVIEW_TOKEN" $PREVIEW_BANNER 'PREVIEW'
        Write-Host ""
        Write-Host "PREVIEW SENT id=$id. Exactly one email left. No live recipient was contacted."
    }
    'canary' {
        $m = $manifest[0]
        Write-Host "=== MODE: canary -> recipient #1 ONLY ($($m.email)) ==="
        $id = Send-One $m.email $m.first $m.link '' "#1 $($m.name)"
        Write-Host ""
        Write-Host "CANARY COMPLETE. 1 sent. id=$id"
    }
    'remaining' {
        Write-Host "=== MODE: remaining -> recipients #2..$($manifest.Count) ==="
        $ids = [System.Collections.ArrayList]::new()
        for ($i = 1; $i -lt $manifest.Count; $i++) {
            $m = $manifest[$i]
            $id = Send-One $m.email $m.first $m.link '' "#$($m.n) $($m.name)"
            [void]$ids.Add([pscustomobject]@{ n = $m.n; email = $m.email; id = $id })
            Start-Sleep -Milliseconds 600
        }
        Write-Host ""
        Write-Host "=== SENT IDS ==="
        foreach ($x in $ids) { Write-Host ("  {0}. {1}  id={2}" -f $x.n, $x.email, $x.id) }

        # Independent spot-check on a random id from this batch.
        $spot = $ids | Get-Random
        $msg = Invoke-RestMethod -Method Get -Uri "https://api.resend.com/emails/$($spot.id)" -Headers @{ 'Authorization' = "Bearer $RESEND" }
        $toList = @($msg.to)
        Write-Host ""
        Write-Host "=== RANDOM SPOT-CHECK (id $($spot.id)) ==="
        Write-Host "  to.Count=$($toList.Count)  to=$($toList -join ', ')  last_event=$($msg.last_event)"
        if ($toList.Count -ne 1) { Fail "spot-check found $($toList.Count) recipients" }
        Write-Host "  ASSERTION PASS: single recipient"
    }
}
