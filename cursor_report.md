# Exchange member blast — Aug 27 Beer Garden invite

**Status: complete.** 47 of 47 recipients sent and independently verified, one message per recipient, zero duplicates, zero database mutations.

| | |
|---|---|
| Subject | `Thursday's Beer Garden event` |
| From / reply-to | `704 Collective <hello@704collective.com>` / `hello@704collective.com` |
| Sent | 2026-08-26, 09:42–09:52 ET |
| Recipients | 47 (hard cap 70) |
| Preview | `68432d18-e44f-423d-8aee-0965f3abc4c5` → adam@cltbucketlist.com |
| Canary | `ab9716bb-d718-44d5-8862-471ef835f7e8` → alexavilla12345@gmail.com |
| Script | `scripts/exchange-member-blast-send.ps1` |
| Journal | `outputs/exchange-blast-log.json` (48 entries: 1 preview + 47 sends, all `sent`) |

---

## 1. Audience — Option A funnel, recomputed live at send time

Nothing was hardcoded; the script recomputes the funnel from production on every run.

| Stage | Last night (01:50) | This morning (09:41) |
|---|---|---|
| Active social members, not internal, not 704 domain, not admin, `active`/`trialing`, not marketing-unsubscribed | 64 | 65 |
| − already holding an `active`/`used` credential on event `02afde72` | −18 | −18 |
| − `contacts.unsubscribed = true` | −0 | −0 |
| − four named exclusions | −0 | −0 |
| **Final audience** | **46** | **47** |

### Overnight delta: +1, none dropped

**Added — `rblavner@gmail.com` (Rich Lavner).** His profile was updated 2026-08-26 11:37:37 UTC (07:37 ET), flipping `subscription_status` to `active` with `member_type = 'social'`, which qualifies him under the rule as written. This was flagged before the send and sent with no objection raised.

Two open items on his record, neither affecting this send but both worth carrying forward:
- The tracker flags his subscription as `send_invoice` mode, never dunned, $65 open, awaiting a human decision.
- His `tier` is `null` while `subscription_status` is `active` — an instance of the `member_tier` invariant hole already logged in the tracker.

**Dropped — none.** Nobody in last night's 46 registered for the event overnight, so no one aged out of the audience.

The zeros on the unsubscribe and manual-exclusion rows are genuine, not a broken filter: there are 4 unsubscribed contacts and 73 credentials on the event, so both lookups returned live data. No unsubscribed contact is an active social member, and none of the four named addresses is an active social member, so all four were already excluded by the include filter.

---

## 2. Final manifest with Resend ids

Every row: one POST, one recipient, `to.Count = 1` asserted before the POST and re-asserted against Resend afterwards.

| # | Email | Greeting | Resend id | to.Count |
|---|---|---|---|---|
| 1 | alexavilla12345@gmail.com | Alexa | `ab9716bb-d718-44d5-8862-471ef835f7e8` | 1 |
| 2 | allisonmharllee@gmail.com | Allison | `6b53e86e-f3ac-46ca-bf7d-f22896982dd0` | 1 |
| 3 | andreamblosser@gmail.com | Andrea | `e97f6db5-848f-4c23-8d32-d1ec52a1f30c` | 1 |
| 4 | annsleebottoms@gmail.com | Annslee | `d135b082-1fac-4b21-b40e-afaeb2d75706` | 1 |
| 5 | adbridg@gmail.com | Austin | `b677ce18-ed6a-441c-a400-3ea4b4ea9f1f` | 1 |
| 6 | cbiggs264@gmail.com | Caitlin | `fe0ef697-a5c9-4e10-95d6-3f7e3105f229` | 1 |
| 7 | camerondevitt98@gmail.com | Cameron | `f7d288ef-dd82-41c0-9723-faf6b5298a02` | 1 |
| 8 | clecklin@gmail.com | Caroline | `dff130a7-56ca-46d2-b828-ea4b2b4c98d5` | 1 |
| 9 | catwether@gmail.com | Catherine | `afcef788-8b82-42d3-9f69-af4fb7872bf8` | 1 |
| 10 | cs128209@gmail.com | Corey | `dee391af-7638-4576-b273-eee6bd466a41` | 1 |
| 11 | dak344+other@gmail.com | Damian | `8d4685e6-a855-4a97-8774-0d0d90bacbfb` | 1 |
| 12 | epetruz711@gmail.com | Elizabeth | `c4d75244-c576-4ed8-95ca-9b0f71804bbf` | 1 |
| 13 | es62886@gmail.com | Emily | `c2045787-b418-4602-89ef-e25422325755` | 1 |
| 14 | soldatenko.e@gmail.com | Evelina | `58b89949-3fec-4220-bcda-4d34b3f4b0f3` | 1 |
| 15 | hkillianc@gmail.com | Hannah | `cc49a2de-2d65-4227-be39-412f53400f62` | 1 |
| 16 | h.l.williams@live.com | Heather | `125dd935-ee34-4a2f-a67b-f16717bca159` | 1 |
| 17 | jdavis757x@yahoo.com | James | `7424617c-2d0e-4376-a533-e4d9d14f3dac` | 1 |
| 18 | nhi.jennhi@gmail.com | Jennie | `b36d2d42-2313-4d0b-8ebd-c744b88e17fe` | 1 |
| 19 | jstraw4663@gmail.com | Jeremy | `a67c3680-18a9-44fc-9ce7-e8e821351bbf` | 1 |
| 20 | jebrennan311@gmail.com | Jess | `f854ac0b-6147-4428-a638-e5e11428d9ec` | 1 |
| 21 | jlesliec25@gmail.com | Justin | `3c982400-eb09-4df4-aeb5-52d68c7ad4f1` | 1 |
| 22 | kayla.goff19@gmail.com | Kayla | `2d452de9-74a7-421c-a5e3-0a2fb581dea0` | 1 |
| 23 | kiyanathomas07@gmail.com | Kiyana | `a8233e0f-dc66-4708-b4c1-ec2f2d14386b` | 1 |
| 24 | krism2132@gmail.com | Kristina | `e519d986-b48e-4504-a28d-cb42bcd713d8` | 1 |
| 25 | lanceleonardoclementi@gmail.com | Lance | `dad9e071-8420-4be1-aa9d-156ff11b970f` | 1 |
| 26 | pinklauren93@yahoo.com | Lauren | `eae2a1f0-c0a6-4ef9-b0b3-8a31d775a327` | 1 |
| 27 | lbjork9@gmail.com | Lauren | `d2114a09-d652-4915-aacf-4ef31b71dd4f` | 1 |
| 28 | lafrey1434@gmail.com | Lauren | `082420c7-9605-47f4-b5e2-77c880351f8f` | 1 |
| 29 | leilamcelroy92@gmail.com | Leila | `1775bca2-0cbb-4709-8857-9802397eecba` | 1 |
| 30 | xlinhphan@icloud.com | Linh | `98d11328-289c-438a-bf24-d69915c3d34c` | 1 |
| 31 | lucyrowley7@gmail.com | Lucy | `5fa2cafd-49de-4571-83de-717da0727463` | 1 |
| 32 | madisongallien@gmail.com | Madison | `fe74b1ec-25d3-4fd3-b7e7-a8d4cb4a5a36` | 1 |
| 33 | maxluttinger@gmail.com | Max | `a855bb54-e36b-4df0-bdbf-3aa885c51807` | 1 |
| 34 | megkma89@gmail.com | Megan | `b97757f7-4a70-406a-a4f7-4f2630374896` | 1 |
| 35 | meganroche81@gmail.com | Megan | `0cc91f0d-6e81-463e-8d4f-6aeac3d0db98` | 1 |
| 36 | michael.e.roberts130@outlook.com | Michael | `87c7b639-37aa-4afc-8f9f-6036afc620c3` | 1 |
| 37 | miles656@gmail.com | Miles | `1f1aea7f-6a09-43a5-90d6-e48ce63d295c` | 1 |
| 38 | 90.nate.09@gmail.com | Nathan | `2795c291-b92c-49a2-8a16-5dcdb983f2d3` | 1 |
| 39 | nekayla.mckinney@parachutehealth.com | Nekayla | `420c1260-1dc8-4a8a-bd84-676b4db7e1d9` | 1 |
| 40 | oliviavassalotti@gmail.com | Olivia | `14ad3faf-110c-4bb6-8000-f776627ec936` | 1 |
| 41 | rebeccamgrant1@gmail.com | Rebecca | `15b37d67-2e7f-4244-9a18-bf208c62a7e9` | 1 |
| 42 | rblavner@gmail.com | Rich | `aa5d3294-d215-4004-b856-7fe394242ad4` | 1 |
| 43 | pitzer7@gmail.com | Shannon | `4adaff8f-42d6-4cd4-b395-5529ee7b7355` | 1 |
| 44 | trinityfrench@housematcher.net | Trinity | `27fb30b8-1119-4b98-9bd6-eca3fe7b5ac2` | 1 |
| 45 | jtfrench1989@gmail.com | Tyler | `384ea57b-e63f-44d4-9ced-40667297dd28` | 1 |
| 46 | vaishaliwillis@gmail.com | Vaishali | `db3da79a-e610-4a59-9265-e8fb7a83880f` | 1 |
| 47 | xueyongliu98@gmail.com | Xueyong | `e533458a-5bbc-4a3c-bd8e-4e88aabd3f3c` | 1 |

---

## 3. Creative fixes shipped this morning

**Logo.** The header now uses the circular badge at `https://704collective.com/logo.png` (byte-identical to `public/logo.png`, 38,013 bytes), rendered at 120px with `border-radius:50%`. The previous asset, `logo-email-dark.png`, is a white wordmark on transparency; Gmail's dark mode inverts backgrounds and text but leaves images alone, so the mark stayed white while the card beneath it turned light, and it disappeared.

The badge's alpha channel was checked before adoption, because a transparent disc would have been worse — black ink on a transparent field vanishes on the dark card. It is fully opaque: 0% transparent pixels, 89.2% opaque white field, 9.2% opaque black ink.

Legibility was measured, not eyeballed, by rendering the saved HTML in a normal view and in a Gmail-style dark view (document inverted, `<img>` re-inverted), with the old asset kept as a control. Contrast is WCAG relative luminance:

| Asset | View | ink : field | badge : card | Result |
|---|---|---|---|---|
| New badge | light | 18.88 | 13.58 | PASS |
| New badge | dark-emulated | 18.88 | 1.53 | PASS |
| Old wordmark | light | 13.58 | 13.58 | PASS |
| Old wordmark | dark-emulated | **1.53** | 1.53 | **FAIL** |

The control reproduces the reported defect exactly. Screenshots: `outputs/logo-verify/`.

**Time line.** Exactly one line added after the sign-in heads-up: "Doors at 6:30 PM." No address, no venue repeat, no 21+. The optional event-details block and its `-WithDetails` switch were deleted from the script outright so the superseded copy cannot be appended by accident.

**Lucy.** `lucyrowley7@gmail.com` was greeted "Hey Lucy" via a send-only override map. Her stored profile still reads "Lucinda Ostrowski", confirmed by re-query after the send (`updated_at` unchanged at 2026-07-28). The manifest prints the override inline so it is visible rather than silent.

Copy is otherwise byte-for-byte as written, with "The Exchange" and "Just the social" bold at the head of their paragraphs. Render: `outputs/exchange-blast-render-v2.html`.

---

## 4. Incident: batch halted at #13, no mail lost, no duplicate sent

**What happened.** At 09:42:26 the batch stopped after 13 sends. Recipient #13 (`es62886@gmail.com`) was accepted by Resend, but the verification `GET /emails/{id}` fired 400ms later returned `404 Email not found`. Resend's reads lag its writes; the message existed, it simply was not queryable yet. The script treated an unverifiable send as a hard failure and stopped, which is the correct bias.

**Why nothing was lost or doubled.** The journal records intent *before* the POST and confirms *after*, so #13 was left marked `attempting` — blocked from re-send rather than silently retried. Resend's own list endpoint confirmed the message went out at 13:42:26 UTC as `c2045787-b418-4602-89ef-e25422325755` to exactly one recipient. The entry was reconciled to `sent` against that record, and the batch resumed and skipped all 13 completed addresses.

**Two defects it exposed, both fixed:**

1. The Resend id was only written to the journal *after* verification, so a verification failure left an anonymous `attempting` row that had to be reconciled by hand against Resend's list. The id is now journalled the instant the POST returns, with an intermediate `posted` status.
2. Verification had a single 400ms attempt. It now retries with backoff (400ms, 900ms, 1.8s, 3s, 5s) and only fails after all five, so normal-path timing is unchanged while read-after-write lag is absorbed.

Both fixes were in place before the batch resumed; the remaining 34 sends verified first try.

---

## 5. Verification

**Journal integrity** — 48 entries, all `sent`, none unresolved. 47 audience sends across 47 distinct addresses and 47 distinct ids; zero rows with `toCount ≠ 1`.

**Independent Resend re-verify** — every one of the 47 ids was re-fetched fresh after the batch and checked for exactly one recipient, the correct recipient, and the correct subject. 47 verified, 0 mismatches or errors. This is in addition to the per-send verification and the post-batch random spot-check (#18, `nhi.jennhi@gmail.com`, PASS).

**The send mutated nothing** — funnel re-queried after completion:

| Check | Value |
|---|---|
| Base include set | 65 (unchanged) |
| Final audience | 47 (unchanged) |
| Credentials on event `02afde72` | 73 (unchanged) |
| Contacts marked unsubscribed | 4 (unchanged) |
| Profiles modified during the send window | **0** |
| Latest profile update in the set | 11:37:37 UTC — Rich Lavner, *before* the send |
| Credentials created during the send window | **0** |

---

## 6. Hardening in the sender

- **Hard cap 70.** Over the cap the script stops before sending anything.
- **Scalar recipient guard.** Every address must be a single string with exactly one `@`, no whitespace or delimiters. This guard earned its keep during the dry run: Windows PowerShell 5.1 collapses a JSON array into one object, and the guard caught a 64-address string arriving where one mailbox belonged and refused to send. The same trap was then fixed in the REST reads and in the journal reader, where it would otherwise have made a 47-entry journal look like one entry and defeated the duplicate guard.
- **One POST per recipient**, `to` built as a one-element array from a proven scalar, count asserted before the POST and re-asserted from Resend after.
- **Production assertion.** The script refuses to run unless the Supabase URL is the production project.
- **`-Confirm` required** for anything that sends; `-DryRun` walks the full path — guards, payload build, skip logic — without posting or journalling.
- **Journal-backed resume.** Addresses that are `sent`, `posted`, or `attempting` are blocked; only a POST that Resend itself rejected is marked retryable, since no mail was created.
- **Preview lock.** A preview of the current template version cannot be sent twice; re-running refuses with a clean stop.
- **Full-list walk.** The remainder iterates all 47 rather than starting at index 2, so a re-sort between canary and batch cannot skip anyone; the journal excludes the canary.

---

## 7. Files

| Path | Role |
|---|---|
| `scripts/exchange-member-blast-send.ps1` | The sender (committed) |
| `outputs/exchange-blast-log.json` | Send journal, 48 entries |
| `outputs/exchange-blast-render-v2.html` | Final rendered email |
| `outputs/logo-verify/` | Light and dark-emulated screenshots, plus the old-asset control |
| `w11-logo-probe.mjs` | Badge alpha-channel probe |
| `w11-render-verify.mjs` | Contrast verification harness |

## 8. Carried forward

- **Rich Lavner** received the invite as an active social member. His `send_invoice` subscription, $65 open, still awaits a human decision, and his `tier` is `null` while active.
- The **`member_tier` invariant hole** has another live instance in Rich's record.
