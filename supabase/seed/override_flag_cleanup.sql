-- OVERRIDE FLAG CLEANUP - clears membership_override from 25 active payers (Group A)
-- and 10 canceled ex-members (Group C). Group B true comps are NOT in the lists and untouched.
-- SAFETY: aborts unless the exact expected pre-state is found. Rerun after success = safe abort.

do $$
declare
  a_count int;
  c_count int;
begin
  select count(*) into a_count from profiles
  where membership_override = true
    and subscription_status = 'active'
    and subscription_id is not null
    and email = any(array[
      'aaronaugustine85@gmail.com','albond@davidson.edu','antonio@acr-coaching.com',
      'ashuangrish@gmail.com','catwether@gmail.com','cbiggs264@gmail.com',
      'dak344+other@gmail.com','descobar867@yahoo.com','emma.sewell@barmetrix.com',
      'es62886@gmail.com','fgalassousa@gmail.com','h.l.williams@live.com',
      'jonathan.sewell@barmetrix.com','jtfrench1989@gmail.com','kayla.goff19@gmail.com',
      'lyx573@gmail.com','maxluttinger@gmail.com','megkma89@gmail.com',
      'pinklauren93@yahoo.com','pitzer7@gmail.com','rblavner@gmail.com',
      'shanroy71@gmail.com','soldatenko.e@gmail.com','tylerclaryusa@gmail.com',
      'xueyongliu98@gmail.com'
    ]);

  select count(*) into c_count from profiles
  where membership_override = true
    and subscription_status = 'canceled'
    and subscription_id is null
    and email = any(array[
      'alexisp0805@gmail.com','caitlinbecker@parkerpoe.com','catiemjones@gmail.com',
      'christine.rossini@gmail.com','ebetz0014@gmail.com','haley.prakke@gmail.com',
      'krwells@maine.rr.com','lnrabb@gmail.com','nicholemarkham75@gmail.com',
      'sonia28205@gmail.com'
    ]);

  if a_count <> 25 or c_count <> 10 then
    raise exception 'SAFETY ABORT: expected 25 Group A + 10 Group C, found % + %. No changes made.', a_count, c_count;
  end if;

  update profiles
  set membership_override = false
  where membership_override = true
    and email = any(array[
      'aaronaugustine85@gmail.com','albond@davidson.edu','antonio@acr-coaching.com',
      'ashuangrish@gmail.com','catwether@gmail.com','cbiggs264@gmail.com',
      'dak344+other@gmail.com','descobar867@yahoo.com','emma.sewell@barmetrix.com',
      'es62886@gmail.com','fgalassousa@gmail.com','h.l.williams@live.com',
      'jonathan.sewell@barmetrix.com','jtfrench1989@gmail.com','kayla.goff19@gmail.com',
      'lyx573@gmail.com','maxluttinger@gmail.com','megkma89@gmail.com',
      'pinklauren93@yahoo.com','pitzer7@gmail.com','rblavner@gmail.com',
      'shanroy71@gmail.com','soldatenko.e@gmail.com','tylerclaryusa@gmail.com',
      'xueyongliu98@gmail.com',
      'alexisp0805@gmail.com','caitlinbecker@parkerpoe.com','catiemjones@gmail.com',
      'christine.rossini@gmail.com','ebetz0014@gmail.com','haley.prakke@gmail.com',
      'krwells@maine.rr.com','lnrabb@gmail.com','nicholemarkham75@gmail.com',
      'sonia28205@gmail.com'
    ]);

  raise notice 'SUCCESS: cleared override flag on % rows.', a_count + c_count;
end $$;

-- Receipt (run as its own statement after):
-- select count(*) filter (where membership_override = true) as remaining_flagged from profiles;
-- Expected: 16 (Group B true comps only)
