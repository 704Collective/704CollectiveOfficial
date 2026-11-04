/** Time machine is develop-only. Production env never shows or honors it. */
export function tmTimeMachineVisible(opts: {
  vercelEnv?: string | null;
  honorFlag?: boolean | null;
}): boolean {
  if ((opts.vercelEnv ?? '') === 'production') return false;
  return opts.honorFlag === true;
}
