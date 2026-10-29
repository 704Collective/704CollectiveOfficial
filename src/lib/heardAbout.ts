export const HEARD_ABOUT_OPTIONS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'friend', label: 'Friend or member' },
  { value: 'event', label: 'A 704 event' },
  { value: 'cltbucketlist', label: 'CLTBucketlist' },
  { value: 'google', label: 'Google' },
  { value: 'other', label: 'Other' },
] as const;

export type HeardAboutValue = (typeof HEARD_ABOUT_OPTIONS)[number]['value'];

export const HEARD_ABOUT_VALUES: readonly string[] = HEARD_ABOUT_OPTIONS.map((o) => o.value);

export function heardAboutLabel(value: string | null | undefined, other?: string | null): string {
  if (value === 'other') return (other ?? '').trim();
  return HEARD_ABOUT_OPTIONS.find((o) => o.value === value)?.label ?? '';
}
