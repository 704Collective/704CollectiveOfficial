export const TRACKING_PLACEMENTS = [
  { value: 'instagram', label: 'Instagram', source: 'instagram', medium: 'social' },
  { value: 'tiktok', label: 'TikTok', source: 'tiktok', medium: 'social' },
  { value: 'facebook', label: 'Facebook', source: 'facebook', medium: 'social' },
  { value: 'cltbucketlist', label: 'CLTBucketlist', source: 'cltbucketlist', medium: 'partner' },
  { value: 'email', label: 'Email', source: 'email', medium: 'email' },
  { value: 'flyer', label: 'Flyer or QR', source: 'flyer', medium: 'offline' },
  { value: 'event', label: 'Event', source: 'event', medium: 'offline' },
  { value: 'other', label: 'Other', source: 'other', medium: 'other' },
] as const;

export type TrackingPlacement = (typeof TRACKING_PLACEMENTS)[number]['value'];

export const DEFAULT_TRACKING_DESTINATION = 'https://704collective.com/join';

/** Same rules as public.slugify_utm in the member-sources migration. */
export function slugifyUtm(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function destinationAllowed(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return host === '704collective.com' || host === 'www.704collective.com';
  } catch {
    return false;
  }
}

export function buildTrackingUrl(input: {
  postedOn: TrackingPlacement;
  campaign: string;
  spot: string;
  destination: string;
}): { url: string; utm_source: string; utm_medium: string; utm_campaign: string; utm_content: string | null } | null {
  const place = TRACKING_PLACEMENTS.find((p) => p.value === input.postedOn);
  const campaign = slugifyUtm(input.campaign);
  const destination = input.destination.trim();
  if (!place || !campaign || !destinationAllowed(destination)) return null;
  const content = slugifyUtm(input.spot);
  const joiner = destination.includes('?') ? '&' : '?';
  let url = `${destination}${joiner}utm_source=${place.source}&utm_medium=${place.medium}&utm_campaign=${campaign}`;
  if (content) url += `&utm_content=${content}`;
  return {
    url,
    utm_source: place.source,
    utm_medium: place.medium,
    utm_campaign: campaign,
    utm_content: content || null,
  };
}
