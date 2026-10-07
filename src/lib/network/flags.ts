// Wave H3 launch flag. Every public Network route (hub pages, listing profiles,
// /get-listed, /how-we-vet, /intro/*, /out/*) returns notFound() unless this is
// exactly 'true'. Unset in prod/Vercel until launch; 'true' on develop.
export function hubPagesLive(): boolean {
  return process.env.HUB_PAGES_LIVE === 'true';
}
