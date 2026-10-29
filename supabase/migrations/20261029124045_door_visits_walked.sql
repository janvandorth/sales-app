-- A sales manager ticks off the doors a werver walked without logging them, from what the werver tells: each is a
-- door visit with outcome "walked", logged by the manager under the werver's number. It counts like a rung door,
-- and the walk shows it as done.
alter table public.door_visits drop constraint door_visits_outcome_check;
alter table public.door_visits add constraint door_visits_outcome_check
  check (outcome in ('not_home', 'no_interest', 'later', 'sold', 'skip', 'walked'));

-- Ticking off is undone whenever the manager sees a mistake, not only on the day; wervers keep taking back only
-- their own taps of the day.
create policy "Admins take back ticked-off doors"
  on public.door_visits for delete
  to authenticated
  using (
    outcome = 'walked'
    and exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin)
  );
