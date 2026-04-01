/** HTTPS iCal feed URL (used by Google, Outlook, and as copy target). */
export function getCalendarHttpsFeedUrl(baseUrl: string, token: string): string {
  const b = baseUrl.replace(/\/$/, '');
  return `${b}/functions/v1/calendar-feed?token=${encodeURIComponent(token)}`;
}

/** Apple Calendar / macOS subscription URL. */
export function getCalendarWebcalFeedUrl(baseUrl: string, token: string): string {
  return getCalendarHttpsFeedUrl(baseUrl, token).replace(/^https?:\/\//i, 'webcal://');
}

export function getGoogleCalendarSubscribeUrl(baseUrl: string, token: string): string {
  const feed = getCalendarHttpsFeedUrl(baseUrl, token);
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed)}`;
}

export function getOutlookCalendarSubscribeUrl(baseUrl: string, token: string): string {
  const feed = getCalendarHttpsFeedUrl(baseUrl, token);
  return `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed)}`;
}
