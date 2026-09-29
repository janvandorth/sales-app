-- Admins can manage recruiters through the admin-users edge function.
alter table public.profiles add column is_admin boolean not null default false;
