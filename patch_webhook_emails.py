import sys

path = r'C:\Users\adamk\704collective\supabase\functions\stripe-webhook\index.ts'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# Find the exact anchor to insert after - the "Ambassador referral created" log call and its closing braces
# The structure is:
#   log("Ambassador referral created", { ... });
# followed by closing } and } for the if/else-if blocks.
# We want to insert the email code right after the log call, still INSIDE the else-if block.

ANCHOR = '''            log("Ambassador referral created", {
              referral_id: refRow.id,
              status: initialStatus,
              ambassador_id: ambRow.id,
              code: referralCodeFromMeta,
            });'''

if ANCHOR not in src:
    print("ERROR: anchor not found")
    print(repr(src[src.find('Ambassador referral created')-50:src.find('Ambassador referral created')+300]))
    sys.exit(1)

EMAIL_BLOCK = r'''            log("Ambassador referral created", {
              referral_id: refRow.id,
              status: initialStatus,
              ambassador_id: ambRow.id,
              code: referralCodeFromMeta,
            });

            // ── Fire ambassador emails (non-blocking) ──
            // 1. Notify the ambassador that a new member signed up via their code.
            // 2. Notify hello@ for admin oversight.
            try {
              const supabaseUrl2 = Deno.env.get("SUPABASE_URL") ?? "";
              const sendEmailUrl = `${supabaseUrl2}/functions/v1/send-email`;
              const authHeader2 = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
              const productionUrl = "https://704collective.com";

              const { data: ambFull } = await supabase
                .from("ambassadors")
                .select("full_name, email, referral_code")
                .eq("id", ambRow.id)
                .single();

              if (ambFull) {
                const rewardDollarsStr = (rewardCents / 100).toFixed(2);

                // Email 1 — ambassador notification
                fetch(sendEmailUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: authHeader2 },
                  body: JSON.stringify({
                    to: ambFull.email,
                    template: "ambassador-referral-received",
                    skipCc: true,
                    data: {
                      ambassadorName: ambFull.full_name,
                      referredName: customerName || customerEmail,
                      tier: ambassadorTierFromMeta,
                      code: ambFull.referral_code,
                      rewardDollars: rewardDollarsStr,
                      status: initialStatus,
                      leaderboardUrl: `${productionUrl}/ambassadors/leaderboard`,
                    },
                  }),
                }).catch((e: unknown) =>
                  log("ambassador-referral-received email failed", { error: String(e) })
                );

                // Email 2 — hello@ admin notification
                fetch(sendEmailUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: authHeader2 },
                  body: JSON.stringify({
                    to: "hello@704collective.com",
                    template: "ambassador-admin-notification",
                    skipCc: true,
                    data: {
                      ambassadorName: ambFull.full_name,
                      code: ambFull.referral_code,
                      referredName: customerName || customerEmail,
                      referredEmail: customerEmail,
                      tier: ambassadorTierFromMeta,
                      rewardDollars: rewardDollarsStr,
                      status: initialStatus,
                      adminQueueUrl: `${productionUrl}/admin/ambassadors`,
                    },
                  }),
                }).catch((e: unknown) =>
                  log("ambassador-admin-notification email failed", { error: String(e) })
                );
              }
            } catch (emailErr) {
              log("Ambassador email dispatch failed (non-blocking)", { error: String(emailErr) });
            }'''

src = src.replace(ANCHOR, EMAIL_BLOCK, 1)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(src)

print("Done:", path)