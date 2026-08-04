/** Branded comp-invite welcome email (sent via Resend from hello@). */

const BRAND = {
  accent: '#C6A664',
  text: '#FAF6F0',
  textSecondary: '#D8D8D8',
  textMuted: '#A0A0A0',
  color: '#1A1A1A',
  surface: '#2E2E2E',
  border: 'rgba(255,255,255,0.10)',
  fontStack:
    "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ctaButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
<tr><td align="center" style="background-color:#FAF6F0;border-radius:8px;">
<a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">${escapeHtml(text)}</a>
</td></tr></table>`;
}

function baseLayout(opts: { title: string; previewText: string; content: string }): string {
  const logoUrl = 'https://704collective.com/logo-email-dark.png';
  const preheader = `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:transparent;">${escapeHtml(opts.previewText)} ${'&nbsp;&#8203;'.repeat(30)}</div>`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(opts.title)}</title>
</head>
<body bgcolor="${BRAND.color}" style="margin:0;padding:0;background-color:${BRAND.color};font-family:${BRAND.fontStack};color:${BRAND.text};">
${preheader}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${BRAND.color}" style="background-color:${BRAND.color};">
<tr>
<td align="center" valign="top" style="padding:32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:${BRAND.surface};border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};">
<tr><td align="center" style="padding:32px 40px 24px;border-bottom:1px solid ${BRAND.border};">
<img src="${logoUrl}" alt="704 Collective" width="120" style="display:block;width:120px;height:auto;border:0;" />
</td></tr>
<tr><td style="padding:32px 40px;">
${opts.content}
</td></tr>
<tr><td style="padding:0;height:0;line-height:0;border-top:1px solid ${BRAND.border};font-size:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:24px 40px;">
<p style="margin:0;font-size:13px;color:rgba(255,255,255,0.4);text-align:center;">704 Collective &middot; Charlotte, NC</p>
</td></tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

export function buildCompInviteWelcomeEmail(data: {
  firstName: string;
  company?: string | null;
  memberType: 'business' | 'social';
  activateUrl: string;
}): { subject: string; html: string } {
  const name = escapeHtml((data.firstName || 'there').trim() || 'there');
  const company = data.company?.trim() ? escapeHtml(data.company.trim()) : null;
  const isBusiness = data.memberType === 'business';

  const subject = isBusiness
    ? "You're in - welcome to 704 Collective Business"
    : "You're in - welcome to 704 Collective";

  const companyLine = company
    ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Your membership for <strong style="color:${BRAND.text};">${company}</strong> is ready.</p>`
    : '';

  const includesBlock = isBusiness
    ? `<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:${BRAND.text};">Your Business membership includes:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">&rarr;&nbsp;Access to business networking events and workshops</td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">&rarr;&nbsp;The business member portal and directory</td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">&rarr;&nbsp;Introductions and full community access</td></tr>
</table>`
    : `<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:${BRAND.text};">Once you're in:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">&rarr;&nbsp;Browse upcoming events and grab your spot</td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">&rarr;&nbsp;Subscribe to the member calendar</td></tr>
<tr><td style="padding:8px 0;font-size:15px;color:${BRAND.textSecondary};">&rarr;&nbsp;Fill out your profile so people know who you are</td></tr>
</table>`;

  const html = baseLayout({
    title: subject,
    previewText: isBusiness
      ? 'Welcome to 704 Collective Business. Activate your membership to get started.'
      : 'Welcome to 704 Collective. Activate your membership to get started.',
    content: `
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Welcome to 704 Collective${isBusiness ? ' Business' : ''}. You just joined a room full of people who are actually worth knowing in Charlotte.</p>
${companyLine}
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">First thing - activate your membership so you can RSVP to events, get your member QR code, and see who else is in here.</p>
${ctaButton('Activate your membership', data.activateUrl)}
<p style="margin:0 0 28px;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">This link expires in 1 hour, so handle it now.</p>
${includesBlock}
<p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">If you need anything, reply to this email. A real person reads it.</p>
<p style="margin:0;font-size:14px;color:${BRAND.textMuted};">- The 704 Collective Team</p>`,
  });

  return { subject, html };
}
