/** Client-only keys for dashboard onboarding checklist (calendar / wallet). */

const calendarKey = (userId: string) => `704_onboarding_calendar_${userId}`;
const walletKey = (userId: string) => `704_onboarding_wallet_${userId}`;

export function markOnboardingCalendarDone(userId: string) {
  try {
    localStorage.setItem(calendarKey(userId), '1');
  } catch {
    /* ignore */
  }
}

export function markOnboardingWalletDone(userId: string) {
  try {
    localStorage.setItem(walletKey(userId), '1');
  } catch {
    /* ignore */
  }
}

export { calendarKey, walletKey };
