-- "Mijn verkopen": the sales submitted per day (by received), so recruiters can check what they sent in.
-- A recruiter reads their own rows (existing policy); the sales manager reads everyone's.
create policy "Admins read all submissions"
  on public.submissions for select
  to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin));

-- One day of one recruiter, and one day of the whole team.
create index submissions_user_received_idx on public.submissions (user_id, received);
create index submissions_received_idx on public.submissions (received);
