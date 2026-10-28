-- Every door a werver rang while walking an area, with how it went: the proof of where they went, and what the
-- next visit skips or comes back to. A sale also shows up as a submission; "sold" here only marks the door.
create table public.door_visits (
  id uuid primary key default gen_random_uuid(),
  -- The area it was walked for; kept when the area is taken back, so the doors still count.
  assignment_id uuid references public.area_assignments (id) on delete set null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  wervernr text not null,
  postcode text not null check (postcode ~ '^[0-9]{4}[A-Z]{2}$'),
  huisnummer integer not null check (huisnummer > 0),
  -- Letter and addition as one, e.g. "A" or "-2"; empty for none.
  toevoeging text not null default '' check (char_length(toevoeging) <= 10),
  straat text not null default '' check (char_length(straat) <= 120),
  outcome text not null check (outcome in ('not_home', 'no_interest', 'later', 'sold', 'skip')),
  visited_at timestamptz not null default now()
);

create index door_visits_assignment_idx on public.door_visits (assignment_id);
create index door_visits_address_idx on public.door_visits (postcode, huisnummer);
create index door_visits_user_idx on public.door_visits (user_id, visited_at);

alter table public.door_visits enable row level security;

-- Wervers see their own doors and those of whoever walks the same area; admins see all.
create policy "Wervers read the doors of their areas"
  on public.door_visits for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.profiles p
      left join public.area_assignments a on a.id = door_visits.assignment_id
      where p.id = (select auth.uid()) and (p.is_admin or p.wervernr = any(a.wervernrs))
    )
  );

-- A werver logs only their own doors, under their own number.
create policy "Wervers log their own doors"
  on public.door_visits for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.profiles where id = (select auth.uid()) and wervernr = door_visits.wervernr)
  );

-- "Ongedaan" takes back a tap on the same day.
create policy "Wervers take back their own doors of today"
  on public.door_visits for delete
  to authenticated
  using (user_id = (select auth.uid()) and visited_at > now() - interval '1 day');

-- The list of areas also says how many doors were rung in each.
drop function public.list_area_assignments(date, date);

create function public.list_area_assignments(p_from date, p_to date)
returns table (
  id uuid,
  postcodes text[],
  wervernrs text[],
  starts_on date,
  ends_on date,
  label text,
  note text,
  bbox double precision[],
  households integer,
  open integer,
  members jsonb,
  sold integer,
  visited integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select p.is_admin, p.wervernr from public.profiles p where p.id = (select auth.uid())
  )
  select
    a.id, a.postcodes, a.wervernrs, a.starts_on, a.ends_on, a.label, a.note, a.bbox, a.households, a.open,
    coalesce((
      select jsonb_agg(jsonb_build_object('wervernr', w.nr, 'name', coalesce(p.wervernaam, w.nr)) order by w.ord)
      from unnest(a.wervernrs) with ordinality as w(nr, ord)
      left join lateral (
        select pr.wervernaam from public.profiles pr where pr.wervernr = w.nr limit 1
      ) p on true
    ), '[]'::jsonb) as members,
    (
      select count(*)::integer
      from public.submissions s
      where s.wervernr = any(a.wervernrs)
        and s.datum between a.starts_on and a.ends_on
        and exists (
          select 1 from unnest(a.postcodes) c
          where upper(replace(s.postcode, ' ', '')) like c || '%'
        )
    ) as sold,
    (
      select count(distinct (v.postcode, v.huisnummer, v.toevoeging))::integer
      from public.door_visits v
      where v.assignment_id = a.id and v.outcome <> 'skip'
    ) as visited
  from public.area_assignments a, caller
  where a.ends_on >= p_from
    and a.starts_on <= p_to
    and (caller.is_admin or caller.wervernr = any(a.wervernrs))
  order by a.starts_on, a.created_at;
$$;

revoke execute on function public.list_area_assignments(date, date) from public, anon;
grant execute on function public.list_area_assignments(date, date) to authenticated;
