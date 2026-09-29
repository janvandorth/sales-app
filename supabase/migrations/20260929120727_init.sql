-- Recruiter profiles. Wervernaam/wervernr are prefilled into every submission.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  wervernaam text not null,
  wervernr text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- Create a profile for every new user. Values come from user metadata when an admin
-- invites the user with {"wervernaam": ..., "wervernr": ...}; otherwise placeholders.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, wervernaam, wervernr)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'wervernaam', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'wervernr', 'W' || lpad((floor(random() * 10000))::int::text, 4, '0'))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Submitted sales forms. Columns mirror the Google Sheet.
create table public.submissions (
  row_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  started timestamptz not null,
  received timestamptz not null default now(),
  completed boolean not null default false,
  completed_by text,
  completed_at timestamptz,
  datum date not null,
  wervernaam text not null,
  wervernr text not null,
  klantnummer text not null,
  geslacht text not null,
  naam text not null,
  postcode text not null,
  huisnummer text not null,
  toevoeging text not null default '',
  straat text not null,
  plaats text not null,
  telefoon text not null,
  email text not null,
  iban text not null,
  contract_type text not null,
  betaalperiode text not null,
  opmerkingen text not null default '',
  sheet_synced_at timestamptz
);

create index submissions_user_id_idx on public.submissions (user_id);
create index submissions_unsynced_idx on public.submissions (received) where sheet_synced_at is null;

alter table public.submissions enable row level security;

-- Inserts go through the submit-form edge function (service role); users can only read their own rows.
create policy "Users read their own submissions"
  on public.submissions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Photos for AI extraction, stored under <user id>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scans', 'scans', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Users upload scans to their own folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'scans' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users read their own scans"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'scans' and (storage.foldername(name))[1] = (select auth.uid())::text);
