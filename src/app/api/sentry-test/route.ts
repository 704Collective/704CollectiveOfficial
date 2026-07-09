// TEMP route to prove Sentry server-side capture works end to end.
// Throws uncaught so instrumentation.ts onRequestError picks it up.
// Remove after the event is confirmed in Sentry.

export const runtime = "nodejs";

export async function GET() {
  throw new Error("Sentry smoke test - " + new Date().toISOString());
}
