// Probe module: exists to answer one question — can a Supabase Edge Function
// import a sibling file outside its own directory? If yes, this folder becomes
// the home of the shared person resolver.

export function probeGreeting(caller: string): string {
  return `shared module reached from ${caller}`;
}
