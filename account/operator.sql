begin;
create table public.regrid_operator_sheets (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  plant text not null check (length(plant) between 1 and 120),
  day date not null,
  label text not null check (length(label) between 1 and 160),
  recipients text[] not null check (cardinality(recipients) <= 30),
  schedule jsonb not null check (jsonb_typeof(schedule)='array' and jsonb_array_length(schedule)=96),
  updated_at timestamptz not null default now(),
  primary key(owner,plant,day)
);
alter table public.regrid_operator_sheets enable row level security;
revoke all on public.regrid_operator_sheets from public,anon,authenticated;
grant select,insert(plant,day,label,recipients,schedule),update(label,recipients,schedule,updated_at) on public.regrid_operator_sheets to authenticated;
create policy own_operator_sheets on public.regrid_operator_sheets for all to authenticated
using(owner=(select auth.uid())) with check(owner=(select auth.uid()) and (
  (select public.regrid_admin()) or exists(select 1 from public.regrid_access a where a.user_id=auth.uid() and a.site='bess' and a.status='approved')
));
create function public.regrid_operator_schedule() returns table(owner uuid,plant text,day date,label text,schedule jsonb,updated_at timestamptz)
language sql stable security definer set search_path='' as $$
  select s.owner,s.plant,s.day,s.label,s.schedule,s.updated_at
  from public.regrid_operator_sheets s join auth.users u on u.id=auth.uid()
  where u.email_confirmed_at is not null and lower(u.email)=any(s.recipients)
  and (exists(select 1 from public.regrid_access a where a.user_id=s.owner and a.site='bess' and a.status='approved')
    or exists(select 1 from auth.users publisher where publisher.id=s.owner and publisher.email_confirmed_at is not null and lower(publisher.email)='learningaiapps@gmail.com'))
  order by s.day desc,s.label,s.owner,s.plant
$$;
revoke all on function public.regrid_operator_schedule() from public,anon;
grant execute on function public.regrid_operator_schedule() to authenticated;
commit;
