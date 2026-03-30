/** Default Atlas CRM workspace seeded in migration `022_social_media.sql`. */
export const DEFAULT_WORKSPACE_ID =
  process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID ?? 'a0000000-0000-4000-8000-000000000001';

export const SOCIAL_PLATFORMS = [
  'instagram',
  'facebook',
  'linkedin',
  'tiktok',
  'youtube',
  'pinterest',
  'snapchat',
  'twitter',
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
