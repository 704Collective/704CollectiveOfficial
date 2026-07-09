import * as Sentry from "@sentry/nextjs";

export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return; // No DSN configured (e.g. CI) -> Sentry stays off.

  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      // Low sample rate to stay within free-tier transaction limits.
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
    });
  }
}

// Captures errors from React Server Components, route handlers, and server
// actions (Next 15+ onRequestError hook).
export const onRequestError = Sentry.captureRequestError;
