import sys

path = r'C:\Users\adamk\704collective\supabase\functions\send-email\index.ts'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# ── 1. Add the 3 template functions right before the template router comment ──
NEW_FUNCS = r'''
// ─── Ambassador Program Templates ────────────────────────────────────────────

function ambassadorReferralReceivedTemplate(data: {
  ambassadorName: string;
  referredName: string;
  tier: string;
  code: string;
  rewardDollars: string;
  status: string;
  leaderboardUrl: string;
  origin?: string;
}): { subject: string; html: string } {
  const name = escapeHtml(data.ambassadorName || "Ambassador");
  const referred = escapeHtml(data.referredName || "Someone");
  const tier = escapeHtml(data.tier || "social");
  const code = escapeHtml(data.code || "");
  const reward = escapeHtml(data.rewardDollars || "0.00");
  const isAutoApproved = data.status === "auto_approved";
  const leaderboardUrl = data.leaderboardUrl || "https://704collective.com/ambassadors/leaderboard";

  return {
    subject: `New referral! ${data.referredName} just joined 704 Collective`,
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">
  Great news! <strong style="color:${BRAND.text};">${referred}</strong> just signed up for 
  <strong>${tier}</strong> membership using your referral code 
  <strong style="color:${BRAND.accent};font-family:ui-monospace,SFMono-Regular,monospace;">${code}</strong>.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background:rgba(255,255,255,0.05);border-radius:10px;border:1px solid rgba(255,255,255,0.10);">
<tr><td style="padding:20px 24px;">
  <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:0.08em;">Reward Earned</p>
  <p style="margin:0;font-size:30px;font-weight:700;color:${BRAND.accent};">$${reward}</p>
</td></tr>
</table>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  ${isAutoApproved
    ? "&#10003; This referral has been automatically approved and your payout is being processed."
    : "&#8987; This referral is being reviewed by our team. We&#39;ll notify you when it&#39;s approved — typically within 24 hours."}
</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  Track all your referrals at any time on the leaderboard:
</p>
${ctaButton("View Leaderboard", leaderboardUrl)}
<p style="margin:24px 0 0;font-size:14px;color:${BRAND.textMuted};">Thanks for being a 704 Collective ambassador!</p>
`),
  };
}

function ambassadorPayoutSentTemplate(data: {
  ambassadorName: string;
  amountDollars: string;
  transferId: string;
  totalPaidDollars: string;
}): { subject: string; html: string } {
  const name = escapeHtml(data.ambassadorName || "Ambassador");
  const amount = escapeHtml(data.amountDollars || "0.00");
  const transferId = escapeHtml(data.transferId || "");
  const totalPaid = escapeHtml(data.totalPaidDollars || "0.00");

  return {
    subject: `Payout sent: $${data.amountDollars} from 704 Collective`,
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">
  Your referral reward has been sent to your bank account.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background:rgba(255,255,255,0.05);border-radius:10px;border:1px solid rgba(255,255,255,0.10);">
<tr><td style="padding:20px 24px;">
  <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:0.08em;">Amount Sent</p>
  <p style="margin:0 0 18px;font-size:30px;font-weight:700;color:${BRAND.accent};">$${amount}</p>
  <p style="margin:0 0 6px;font-size:13px;color:${BRAND.textMuted};">Transfer ID: <span style="font-family:ui-monospace,SFMono-Regular,monospace;">${transferId}</span></p>
  <p style="margin:0;font-size:13px;color:${BRAND.textMuted};">Total paid out to date: <strong style="color:${BRAND.textSecondary};">$${totalPaid}</strong></p>
</td></tr>
</table>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">
  Stripe ACH transfers typically process in 2 business days.
</p>
<p style="margin:0;font-size:14px;color:${BRAND.textMuted};">Thanks for spreading the word!</p>
`),
  };
}

function ambassadorAdminNotificationTemplate(data: {
  ambassadorName: string;
  code: string;
  referredName: string;
  referredEmail: string;
  tier: string;
  rewardDollars: string;
  status: string;
  adminQueueUrl: string;
}): { subject: string; html: string } {
  const ambName = escapeHtml(data.ambassadorName || "");
  const code = escapeHtml(data.code || "");
  const refName = escapeHtml(data.referredName || "");
  const refEmail = escapeHtml(data.referredEmail || "");
  const tier = escapeHtml(data.tier || "social");
  const reward = escapeHtml(data.rewardDollars || "0.00");
  const status = escapeHtml(data.status || "pending");
  const needsAction = data.status === "pending" || data.status.startsWith("flagged_");
  const adminUrl = data.adminQueueUrl || "https://704collective.com/admin/ambassadors";

  return {
    subject: `Ambassador referral: ${data.ambassadorName} \u2192 ${data.referredName}`,
    html: baseLayout(`
<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">
  <strong style="color:${BRAND.text};">${ambName}</strong>
  (<span style="font-family:ui-monospace,SFMono-Regular,monospace;color:${BRAND.accent};">${code}</span>)
  just referred <strong style="color:${BRAND.text};">${refName}</strong>
  (${refEmail}) for <strong>${tier}</strong> membership.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background:rgba(255,255,255,0.05);border-radius:10px;border:1px solid rgba(255,255,255,0.10);">
<tr><td style="padding:16px 24px;">
  <p style="margin:0 0 8px;font-size:14px;color:${BRAND.textSecondary};">Reward: <strong style="color:${BRAND.accent};">$${reward}</strong></p>
  <p style="margin:0;font-size:14px;color:${BRAND.textSecondary};">Status: <strong>${status}</strong></p>
</td></tr>
</table>
${needsAction
  ? `<p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#f87171;">ACTION REQUIRED &#8212; This referral needs review before payout.</p>${ctaButton("Review in Admin", adminUrl)}`
  : `<p style="margin:0 0 16px;font-size:15px;color:${BRAND.textSecondary};">&#10003; No action required &#8212; auto-approved.</p>`}
<p style="margin:24px 0 0;font-size:12px;color:${BRAND.textMuted};">Sent automatically by the ambassador system.</p>
`),
  };
}

'''

ROUTER_COMMENT = "// \U0001f4e7 template router"
if ROUTER_COMMENT not in src:
    # fallback
    ROUTER_COMMENT = "function getTemplate"

idx = src.find(ROUTER_COMMENT)
if idx == -1:
    print("ERROR: router comment not found")
    sys.exit(1)

src = src[:idx] + NEW_FUNCS + src[idx:]
print("functions inserted at idx:", idx)

# ── 2. Add 3 switch cases before the default case ──
NEW_CASES = '''    case "ambassador-referral-received":
      return ambassadorReferralReceivedTemplate(data as {
        ambassadorName: string;
        referredName: string;
        tier: string;
        code: string;
        rewardDollars: string;
        status: string;
        leaderboardUrl: string;
        origin?: string;
      });
    case "ambassador-payout-sent":
      return ambassadorPayoutSentTemplate(data as {
        ambassadorName: string;
        amountDollars: string;
        transferId: string;
        totalPaidDollars: string;
      });
    case "ambassador-admin-notification":
      return ambassadorAdminNotificationTemplate(data as {
        ambassadorName: string;
        code: string;
        referredName: string;
        referredEmail: string;
        tier: string;
        rewardDollars: string;
        status: string;
        adminQueueUrl: string;
      });
    '''

DEFAULT_CASE = '    default:\n      throw new Error(`Unknown email template: ${template}`);'
if DEFAULT_CASE not in src:
    print("ERROR: default case not found")
    sys.exit(1)

src = src.replace(DEFAULT_CASE, NEW_CASES + DEFAULT_CASE, 1)
print("cases inserted before default")

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(src)

print("Done:", path)