import sys

path = r'C:\Users\adamk\704collective\src\app\actions\ambassadorActions.ts'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# ── 1. Add email to the ambassador sub-select ──
OLD_SELECT = ".select('id, ambassador_id, reward_cents, status, paid_out_at, ambassador:ambassadors!ambassador_id (id, full_name, stripe_account_id, stripe_account_status)')"
NEW_SELECT = ".select('id, ambassador_id, reward_cents, status, paid_out_at, ambassador:ambassadors!ambassador_id (id, full_name, email, stripe_account_id, stripe_account_status)')"

if OLD_SELECT not in src:
    print("ERROR: old select not found")
    print(repr(src[src.find('ambassador:ambassadors!ambassador_id')-20:src.find('ambassador:ambassadors!ambassador_id')+120]))
    sys.exit(1)

src = src.replace(OLD_SELECT, NEW_SELECT, 1)
print("select updated")

# ── 2. Update the amb cast type to include email ──
OLD_AMB_TYPE = '''  const amb = (ref.ambassador as unknown) as {
    id: string;
    full_name: string;
    stripe_account_id: string | null;
    stripe_account_status: string | null;
  };'''

NEW_AMB_TYPE = '''  const amb = (ref.ambassador as unknown) as {
    id: string;
    full_name: string;
    email: string | null;
    stripe_account_id: string | null;
    stripe_account_status: string | null;
  };'''

if OLD_AMB_TYPE not in src:
    print("ERROR: old amb type not found")
    sys.exit(1)

src = src.replace(OLD_AMB_TYPE, NEW_AMB_TYPE, 1)
print("amb type updated")

# ── 3. Insert payout email block before the return statement ──
OLD_RETURN = "  return { payout_id: payoutRow?.id ?? '', transfer_id: transfer.id };\n}\n\nexport async function fireAllPendingPayouts"
NEW_RETURN = r"""  // ── Send payout email (non-blocking) ──
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const { data: totalPaidRows } = await supabase
      .from('ambassador_payouts')
      .select('amount_cents')
      .eq('ambassador_id', amb.id)
      .eq('status', 'sent');
    const totalPaidCents = (totalPaidRows ?? []).reduce(
      (sum: number, r: { amount_cents: number | null }) => sum + (r.amount_cents || 0),
      0
    );
    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        to: amb.email ?? '',
        template: 'ambassador-payout-sent',
        skipCc: true,
        data: {
          ambassadorName: amb.full_name,
          amountDollars: ((ref.reward_cents as number) / 100).toFixed(2),
          transferId: transfer.id,
          totalPaidDollars: (totalPaidCents / 100).toFixed(2),
        },
      }),
    });
  } catch (emailErr) {
    console.error('Payout email failed (non-blocking):', emailErr);
  }

  return { payout_id: payoutRow?.id ?? '', transfer_id: transfer.id };
}

export async function fireAllPendingPayouts"""

if OLD_RETURN not in src:
    print("ERROR: old return not found")
    sys.exit(1)

src = src.replace(OLD_RETURN, NEW_RETURN, 1)
print("payout email block inserted")

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(src)

print("Done:", path)