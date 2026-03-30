import { cn } from '@/lib/utils';
import type { SocialPlatform } from '@/lib/social/constants';

const iconClass = 'h-4 w-4 shrink-0';

export function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const c = cn(iconClass, 'text-foreground', className);
  switch (platform as SocialPlatform) {
    case 'instagram':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <rect x="2" y="2" width="20" height="20" rx="5" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'facebook':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM.5 8h4V23h-4V8zm7.5 0h3.8v2.05h.05c.53-1 1.84-2.05 3.79-2.05 4.05 0 4.8 2.68 4.8 6.16V23h-4v-6.93c0-1.65-.03-3.77-2.3-3.77-2.3 0-2.65 1.8-2.65 3.65V23h-4V8z" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.71a8.21 8.21 0 0 0 4.76 1.52V6.78a4.86 4.86 0 0 1-1-.09z" />
        </svg>
      );
    case 'youtube':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.7 31.7 0 0 0 0 12a31.7 31.7 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1 31.7 31.7 0 0 0 .5-5.8 31.7 31.7 0 0 0-.5-5.8zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
        </svg>
      );
    case 'pinterest':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
        </svg>
      );
    case 'snapchat':
      return (
        <svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12.206.793C9.67 1.063 8 3.288 8 6.28c0 1.186.28 2.212.784 3.036l-2.08.45c-.94.2-1.64 1-1.64 1.96 0 .5.2.96.52 1.32.4.44.96.68 1.56.68h.4c.2 1.2.96 2.2 2.08 2.68-.08.36-.28.68-.6.88-.36.24-.8.32-1.24.24-.44-.08-.84-.32-1.12-.68-.2-.24-.52-.36-.84-.32-.32.04-.6.24-.72.52-.12.28-.04.6.16.84.56.72 1.4 1.16 2.32 1.24.12.6.56 1.08 1.16 1.2.04 1.24 1.08 2.24 2.36 2.24s2.32-1 2.36-2.24c.6-.12 1.04-.6 1.16-1.2.92-.08 1.76-.52 2.32-1.24.2-.24.28-.56.16-.84-.12-.28-.4-.48-.72-.52-.32-.04-.64.08-.84.32-.28.36-.68.6-1.12.68-.44.08-.88 0-1.24-.24-.32-.2-.52-.52-.6-.88 1.12-.48 1.88-1.48 2.08-2.68h.4c.6 0 1.16-.24 1.56-.68.32-.36.52-.82.52-1.32 0-.96-.7-1.76-1.64-1.96l-2.08-.45c.504-.824.784-1.85.784-3.036 0-2.992-1.67-5.217-4.206-5.487-.132-.013-.264-.013-.394 0z" />
        </svg>
      );
    case 'twitter':
    default:
      return (
        <svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
  }
}

export function platformLabel(p: string): string {
  if (p === 'twitter') return 'X / Twitter';
  return p.charAt(0).toUpperCase() + p.slice(1);
}
