import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Low sample rate to stay within free-tier transaction limits.
  tracesSampleRate: 0.1,
  // Session Replay disabled for now (keep the plan lean).
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  environment: process.env.NODE_ENV,
  ignoreErrors: [
    "Object Not Found Matching Id",
    "window.webkit.messageHandlers",
    "Lock broken by another request",
  ],
});

// Required for App Router navigation instrumentation.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
