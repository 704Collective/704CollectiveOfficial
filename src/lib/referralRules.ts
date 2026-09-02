/**
 * The referral rules for the locked business application flow, in one place so
 * the browser and the server can never disagree about them.
 *
 * The apply form asks exactly one referral question and the answer is mandatory.
 * A referral comes from exactly one source: an ambassador code, or a typed
 * member name. Never both.
 */

/** The question, worded exactly as approved. Rendered as the form label. */
export const REFERRAL_QUESTION =
  'Did someone refer you? If so, please type their full first and last name. If not, type N/A';

/** Shown when someone supplies an ambassador code and a name at the same time. */
export const ONE_SOURCE_MESSAGE =
  'A referral can only come from one source. You entered an ambassador referral code, ' +
  'so the referrer name must be N/A. Remove the code, or change the name to N/A.';

export const SELF_CODE_MESSAGE =
  'That referral code is your own. You cannot refer yourself.';

export const SELF_NAME_MESSAGE =
  'That is your own name. You cannot refer yourself. Type N/A if nobody referred you.';

export const REFERRAL_REQUIRED_MESSAGE =
  'Please answer the referral question. Type the full name of whoever referred you, or N/A.';

/** The reward a member earns for a converted business referral, in cents. */
export const MEMBER_REFERRAL_AMOUNT_CENTS = 25_000;

/** Every spelling of "nobody referred me" we accept as the N/A answer. */
const NO_REFERRER_FORMS = new Set(['', 'n/a', 'na', 'n.a.', 'n.a', 'n a', 'none', 'no', 'nobody', 'no one']);

/**
 * Collapse a human name to a comparable key: trimmed, lowercased, internal
 * whitespace squeezed, surrounding punctuation dropped. "  Dana   O'Neil " and
 * "dana o'neil" compare equal; "Dana Oneil" deliberately does not.
 */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[.,;:]+|[.,;:]+$/g, '');
}

/** True when the answer means "nobody referred me". */
export function isNoReferrerName(value: string | null | undefined): boolean {
  return NO_REFERRER_FORMS.has(normalizeName(value));
}

/** True when the answer names an actual person. */
export function hasReferrerName(value: string | null | undefined): boolean {
  return normalizeName(value).length > 0 && !isNoReferrerName(value);
}

/**
 * The one-source rule. Returns an error message, or null when the pair is legal.
 * Used by the form before submit and by the route before it writes anything.
 */
export function checkOneSource(
  referralCode: string | null | undefined,
  referrerName: string | null | undefined,
): string | null {
  const hasCode = (referralCode ?? '').trim().length > 0;
  if (hasCode && hasReferrerName(referrerName)) return ONE_SOURCE_MESSAGE;
  return null;
}
