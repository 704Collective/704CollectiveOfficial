import { describe, expect, it } from 'vitest';
import { CANCEL_NOTE_HINT, kindsGetDiscussionCta, showCancelDiscussionCta } from './cancelDiscussionCta';

describe('cancel discussion CTA', () => {
  it('gives the button only to member / member_rsvp kinds', () => {
    expect(kindsGetDiscussionCta(['member_rsvp'])).toBe(true);
    expect(kindsGetDiscussionCta(['member'])).toBe(true);
    expect(kindsGetDiscussionCta(['member_rsvp', 'waitlist'])).toBe(true);
  });

  it('does not give the button to waitlist-only or public recipients', () => {
    expect(kindsGetDiscussionCta(['waitlist'])).toBe(false);
    expect(kindsGetDiscussionCta(['public_rsvp'])).toBe(false);
    expect(kindsGetDiscussionCta(['ticket'])).toBe(false);
    expect(kindsGetDiscussionCta([])).toBe(false);
  });

  it('standard cancel never includes the discussion button (email stays byte-identical)', () => {
    expect(showCancelDiscussionCta('standard', ['member_rsvp'])).toBe(false);
    expect(showCancelDiscussionCta('standard', ['waitlist'])).toBe(false);
    expect(showCancelDiscussionCta(null, ['member'])).toBe(false);
  });

  it('not_hosting: member gets the button, waitlist-only does not', () => {
    expect(showCancelDiscussionCta('not_hosting', ['member_rsvp'])).toBe(true);
    expect(showCancelDiscussionCta('not_hosting', ['waitlist'])).toBe(false);
  });

  it('keeps the cancel-popup helper copy', () => {
    expect(CANCEL_NOTE_HINT).toBe(
      "Your note goes to everyone, including public RSVPs. Members who RSVP'd automatically get an 'Open the discussion' button.",
    );
  });
});
