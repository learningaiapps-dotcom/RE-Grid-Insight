begin;
create table public.regrid_access (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  site text not null check (site in ('dsm','maps','forecast','bess')),
  status text not null default 'pending' check (status in ('pending','approved','revoked')),
  primary key(user_id,site)
);
create function public.regrid_admin() returns boolean language sql stable security definer
set search_path = '' as $$
  select exists(select 1 from auth.users where id=auth.uid() and lower(email)='learningaiapps@gmail.com'
    and email_confirmed_at is not null and is_anonymous is false)
$$;
create function public.regrid_requests() returns table(uid uuid, email text, site text, status text)
language sql stable security definer set search_path='' as $$
 select a.user_id,u.email::text,a.site,a.status from public.regrid_access a join auth.users u on u.id=a.user_id
 where public.regrid_admin() order by u.email,a.site
$$;
revoke all on function public.regrid_admin(), public.regrid_requests() from public,anon;
grant execute on function public.regrid_admin(), public.regrid_requests() to authenticated;
alter table public.regrid_access enable row level security;
revoke all on public.regrid_access from public,anon,authenticated;
grant select,insert(site),update(status) on public.regrid_access to authenticated;
create policy own_read on public.regrid_access for select to authenticated using(user_id=auth.uid() or public.regrid_admin());
create policy own_request on public.regrid_access for insert to authenticated with check(user_id=auth.uid() and status='pending');
create policy admin_change on public.regrid_access for update to authenticated using(public.regrid_admin()) with check(public.regrid_admin());
commit;
