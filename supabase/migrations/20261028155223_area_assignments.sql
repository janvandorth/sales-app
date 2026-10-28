-- Areas the sales manager gives wervers to work: a set of postcodes (PC4, PC5 or PC6, mixed) for one or more
-- wervers over a few days. Wervers are named by wervernr, like the sales they book, so sales in the area count
-- for them however they were booked.
create table public.area_assignments (
  id uuid primary key default gen_random_uuid(),
  -- "3561", "3561A" or "3561AC"; a code covers every postcode it starts.
  postcodes text[] not null
    check (cardinality(postcodes) between 1 and 500
      and array_to_string(postcodes, ',') ~ '^[0-9]{4}[A-Z]{0,2}(,[0-9]{4}[A-Z]{0,2})*$'),
  wervernrs text[] not null check (cardinality(wervernrs) between 1 and 10),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on and ends_on - starts_on <= 31),
  -- Neighbourhood and town at the area's centre, e.g. "Overvecht, Utrecht".
  label text not null default '' check (char_length(label) <= 120),
  note text not null default '' check (char_length(note) <= 500),
  -- minLon, minLat, maxLon, maxLat: where the map opens.
  bbox double precision[] check (bbox is null or cardinality(bbox) = 4),
  -- The area's size when it was given out, from the "kansen" numbers then on the map.
  households integer,
  open integer,
  created_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index area_assignments_dates_idx on public.area_assignments (starts_on, ends_on);
create index area_assignments_wervernrs_idx on public.area_assignments using gin (wervernrs);

alter table public.area_assignments enable row level security;

create policy "Admins and the wervers in it read an assignment"
  on public.area_assignments for select
  to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and (p.is_admin or p.wervernr = any(area_assignments.wervernrs))
  ));

create policy "Admins give out areas"
  on public.area_assignments for insert
  to authenticated
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin));

create policy "Admins change areas"
  on public.area_assignments for update
  to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin));

create policy "Admins take areas back"
  on public.area_assignments for delete
  to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin));

-- The assignments that overlap from..to which the caller may see, with the names of the wervers in each and the
-- sales they booked in the area while it was theirs. Security definer because a werver may read only their own
-- profile and sales, yet sees who they work with and what the pair sold.
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
  sold integer
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
    ) as sold
  from public.area_assignments a, caller
  where a.ends_on >= p_from
    and a.starts_on <= p_to
    and (caller.is_admin or caller.wervernr = any(a.wervernrs))
  order by a.starts_on, a.created_at;
$$;

revoke execute on function public.list_area_assignments(date, date) from public, anon;
grant execute on function public.list_area_assignments(date, date) to authenticated;
