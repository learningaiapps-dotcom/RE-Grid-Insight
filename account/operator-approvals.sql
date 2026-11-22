begin;
create table public.regrid_operator_approvals (
  owner uuid not null references auth.users on delete cascade,
  plant text not null,
  email text not null check(length(email) between 3 and 254),
  digest text not null unique check(digest ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  primary key(owner,plant,email)
);
alter table public.regrid_operator_approvals enable row level security;
revoke all on public.regrid_operator_approvals from public,anon,authenticated;
grant select on public.regrid_operator_approvals to authenticated;
create policy admin_operator_approvals on public.regrid_operator_approvals for select to authenticated
  using(owner=(select auth.uid()) and (select public.regrid_admin()));

create function public.regrid_operator_approval(plant_id text, operator_email text, months integer, link_digest text)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare expiry timestamptz;
begin
  if not public.regrid_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if months=0 then
    update public.regrid_operator_approvals set revoked_at=now()
      where owner=auth.uid() and plant=plant_id and email=operator_email;
    return null;
  end if;
  if months is null or months not in (1,12) or operator_email is null
    or operator_email !~ '^[^[:space:]@,;]+@[^[:space:]@,;]+\.[^[:space:]@,;]+$'
    or operator_email<>lower(operator_email) or length(operator_email)>254
    or not exists(select 1 from public.regrid_operator_sheets where owner=auth.uid() and plant=plant_id)
  then raise exception 'Invalid approval'; end if;
  expiry:=((now() at time zone 'Asia/Kolkata')+make_interval(months=>months)) at time zone 'Asia/Kolkata';
  insert into public.regrid_operator_approvals (owner,plant,email,digest,expires_at)
    values(auth.uid(),plant_id,operator_email,link_digest,expiry)
    on conflict(owner,plant,email) do update set digest=excluded.digest,expires_at=excluded.expires_at,revoked_at=null;
  return expiry;
end $$;
revoke all on function public.regrid_operator_approval(text,text,integer,text) from public,anon;
grant execute on function public.regrid_operator_approval(text,text,integer,text) to authenticated;

revoke execute on function public.regrid_operator_guest_change(text,date,text,jsonb,text) from authenticated;

create or replace function public.regrid_operator_guest_read(digest text)
returns table(owner uuid,plant text,day date,label text,schedule jsonb,updated_at timestamptz)
language sql stable security definer set search_path='' as $$
  select s.owner,s.plant,s.day,s.label,s.schedule,s.updated_at
  from public.regrid_operator_sheets s join auth.users u on u.id=s.owner
  where u.email_confirmed_at is not null and lower(u.email)='learningaiapps@gmail.com'
    and ((s.guest_digest=digest and s.guest_expires>now())
    or exists(select 1 from public.regrid_operator_approvals a where a.owner=s.owner and a.plant=s.plant
      and a.digest=$1 and a.revoked_at is null and a.expires_at>now()))
  order by (s.day=(now() at time zone 'Asia/Kolkata')::date) desc,s.day desc
  limit 7
$$;
commit;
