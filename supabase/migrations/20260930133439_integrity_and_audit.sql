-- Data integrity and audit trail.

-- Only the values the form offers may be stored (mirrors the options in form-schema.ts).
alter table public.submissions
  add constraint submissions_geslacht_check check (geslacht in ('Man', 'Vrouw')),
  add constraint submissions_contract_type_check check (contract_type in ('Service', 'Zakelijk')),
  add constraint submissions_betaalperiode_check check (
    betaalperiode in ('Maand Machtiging', 'Jaar Machtiging', 'Kwartaal Machtiging', 'Jaar Acceptgiro', 'Zakelijk Acceptgiro')
  );

-- A recruiter number identifies exactly one recruiter.
alter table public.profiles add constraint profiles_wervernr_key unique (wervernr);

-- Submitted sales are immutable, also for the service role: only the back-office status and the sheet
-- bookkeeping may change. (A legal erasure request needs a deliberate migration that bypasses this.)
create function public.protect_submission()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  mutable_columns constant text[] := array['completed', 'completed_by', 'completed_at', 'sheet_synced_at'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Submitted sales cannot be deleted';
  end if;
  if (to_jsonb(new) - mutable_columns) is distinct from (to_jsonb(old) - mutable_columns) then
    raise exception 'Submitted sales cannot be changed';
  end if;
  return new;
end;
$$;

create trigger submissions_immutable
  before update or delete on public.submissions
  for each row execute function public.protect_submission();

-- Every change to a recruiter profile is recorded, including who made it.
create table public.profile_changes (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  old_values jsonb not null,
  new_values jsonb not null
);

-- No policies: readable only with the service role.
alter table public.profile_changes enable row level security;

create function public.log_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profile_changes (profile_id, changed_by, old_values, new_values)
  values (
    new.id,
    -- auth.uid() for direct changes; app.actor is set by update_profile_as_admin for service-role changes.
    coalesce(auth.uid(), nullif(current_setting('app.actor', true), '')::uuid),
    to_jsonb(old) - 'created_at',
    to_jsonb(new) - 'created_at'
  );
  return new;
end;
$$;

create trigger profiles_audit
  after update on public.profiles
  for each row
  when (old is distinct from new)
  execute function public.log_profile_change();

-- Used by the admin-users edge function so the audit log knows which admin made the change.
create function public.update_profile_as_admin(
  p_actor uuid,
  p_profile_id uuid,
  p_wervernaam text,
  p_wervernr text,
  p_is_admin boolean
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('app.actor', p_actor::text, true);
  update public.profiles
     set wervernaam = p_wervernaam, wervernr = p_wervernr, is_admin = p_is_admin
   where id = p_profile_id;
  if not found then
    raise exception 'Profile % not found', p_profile_id;
  end if;
end;
$$;

-- Number of submissions per recruiter, for the admin overview.
create function public.submission_counts()
returns table (user_id uuid, submissions bigint)
language sql
stable
set search_path = ''
as $$
  select user_id, count(*) from public.submissions group by user_id;
$$;

-- Trigger and backend-only functions must not be callable through the REST API.
revoke execute on function public.protect_submission() from public, anon, authenticated;
revoke execute on function public.log_profile_change() from public, anon, authenticated;
revoke execute on function public.update_profile_as_admin(uuid, uuid, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.submission_counts() from public, anon, authenticated;
