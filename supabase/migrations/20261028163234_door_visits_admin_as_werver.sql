-- An admin may log doors under a werver's number, as they may book a sale on one. The app does so only on the test
-- deployment, to walk a werver's area as them; anyone else still logs only under their own number.
drop policy "Wervers log their own doors" on public.door_visits;

create policy "Wervers log their own doors, admins any werver's"
  on public.door_visits for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and (is_admin or wervernr = door_visits.wervernr)
    )
  );
