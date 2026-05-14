export type CalendarScope = 'social' | 'business' | 'all' | 'rsvp_only';

/** HTTPS iCal feed URL (used by Google, Outlook, and as copy target). */
export function getCalendarHttpsFeedUrl(baseUrl: string, token: string, scope?: CalendarScope): string {
  const b = baseUrl.replace(/\/$/, '');
  const scopeParam = scope ? `&scope=${encodeURIComponent(scope)}` : '';
  return `${b}/functions/v1/calendar-feed?token=${encodeURIComponent(token)}${scopeParam}`;
}

/** Apple Calendar / macOS subscription URL. */
export function getCalendarWebcalFeedUrl(baseUrl: string, token: string, scope?: CalendarScope): string {
  return getCalendarHttpsFeedUrl(baseUrl, token, scope).replace(/^https?:\/\//i, 'webcal://');
}

export function getGoogleCalendarSubscribeUrl(baseUrl: string, token: string, scope?: CalendarScope): string {
  const feed = getCalendarHttpsFeedUrl(baseUrl, token, scope);
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed)}`;
}

export function getOutlookCalendarSubscribeUrl(baseUrl: string, token: string, scope?: CalendarScope): string {
  const feed = getCalendarHttpsFeedUrl(baseUrl, token, scope);
  return `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed)}`;
}
