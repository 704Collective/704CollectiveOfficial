/** Keep in sync with supabase/functions/cancel-event isMemberKind. */
export const CANCEL_NOTE_HINT =
  "Your note goes to everyone, including public RSVPs. Members who RSVP'd automatically get an 'Open the discussion' button.";

export function kindsGetDiscussionCta(kinds: string[]): boolean {
  return kinds.some((k) => k === 'member' || k === 'member_rsvp');
}

export function showCancelDiscussionCta(
  cancelMode: string | null | undefined,
  kinds: string[],
): boolean {
  return cancelMode === 'not_hosting' && kindsGetDiscussionCta(kinds);
}
