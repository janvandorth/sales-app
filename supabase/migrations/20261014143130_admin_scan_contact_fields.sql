-- Admins set scan_contact_fields through update_profile_as_admin, like the other profile fields. The new
-- parameter is optional (null = leave unchanged), so an admin-users function deployed before it keeps working.
drop function public.update_profile_as_admin(uuid, uuid, text, text, boolean);

create function public.update_profile_as_admin(
  p_actor uuid,
  p_profile_id uuid,
  p_wervernaam text,
  p_wervernr text,
  p_is_admin boolean,
  p_scan_contact_fields boolean default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('app.actor', p_actor::text, true);
  update public.profiles
     set wervernaam = p_wervernaam,
         wervernr = p_wervernr,
         is_admin = p_is_admin,
         scan_contact_fields = coalesce(p_scan_contact_fields, scan_contact_fields)
   where id = p_profile_id;
  if not found then
    raise exception 'Profile % not found', p_profile_id;
  end if;
end;
$$;

revoke execute on function public.update_profile_as_admin(uuid, uuid, text, text, boolean, boolean)
  from public, anon, authenticated;
