begin;
alter table public.regrid_operator_sheets
  add column guest_digest text unique,
  add column guest_expires timestamptz;

create function public.regrid_operator_guest_change(
  plant_id text, operating_day date, plant_label text, blocks jsonb, digest text
) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare expiration timestamptz := now() + interval '24 hours';
begin
  if not public.regrid_admin() then
    raise exception 'Administrator required' using errcode='42501';
  end if;
  if digest is null then
    update public.regrid_operator_sheets set guest_digest=null,guest_expires=null
      where owner=auth.uid() and plant=plant_id and day=operating_day;
    return null;
  end if;
  if digest !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid link digest';
  end if;
  insert into public.regrid_operator_sheets as s
    (owner,plant,day,label,recipients,schedule,guest_digest,guest_expires)
    values (auth.uid(),plant_id,operating_day,plant_label,array[]::text[],blocks,digest,expiration)
    on conflict (owner,plant,day) do update set label=excluded.label,schedule=excluded.schedule,
      guest_digest=excluded.guest_digest,guest_expires=excluded.guest_expires,updated_at=now();
  return expiration;
end $$;

create function public.regrid_operator_guest_read(digest text)
returns table(owner uuid,plant text,day date,label text,schedule jsonb,updated_at timestamptz)
language sql stable security definer set search_path='' as $$
  select s.owner,s.plant,s.day,s.label,s.schedule,s.updated_at
  from public.regrid_operator_sheets s join auth.users u on u.id=s.owner
  where s.guest_digest=digest and s.guest_expires>now()
    and u.email_confirmed_at is not null and lower(u.email)='learningaiapps@gmail.com'
$$;
revoke all on function public.regrid_operator_guest_change(text,date,text,jsonb,text) from public,anon;
grant execute on function public.regrid_operator_guest_change(text,date,text,jsonb,text) to authenticated;
revoke all on function public.regrid_operator_guest_read(text) from public;
grant execute on function public.regrid_operator_guest_read(text) to anon,authenticated;
commit;
