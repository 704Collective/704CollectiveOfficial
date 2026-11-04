-- SQL33 tm-tick cron for production. Run after SQL32 and after deploying tm-tick.
-- Every 15 minutes. Same Vault + net.http_post pattern as the other prod crons.

begin;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'SUPABASE_URL') then
    raise exception 'TRIPWIRE: Vault secret SUPABASE_URL is missing.';
  end if;
  if not exists (select 1 from vault.secrets where name = 'SUPABASE_SERVICE_ROLE_KEY') then
    raise exception 'TRIPWIRE: Vault secret SUPABASE_SERVICE_ROLE_KEY is missing.';
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'tm-tick-15m') then
    perform cron.schedule(
      'tm-tick-15m',
      '*/15 * * * *',
      $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL') || '/functions/v1/tm-tick',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY')),
          body := '{"source":"cron"}'::jsonb
        )
      $job$
    );
  end if;
end $$;

commit;
