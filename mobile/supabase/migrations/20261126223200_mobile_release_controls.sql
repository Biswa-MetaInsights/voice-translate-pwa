-- Additive, mobile-only objects. Apply to an isolated test database first.
begin;
create table public.vt_mobile_limits (
  bucket text primary key check (length(bucket) <= 100),
  requests integer not null check (requests > 0),
  expires_at timestamptz not null
);
create index vt_mobile_limits_expiry on public.vt_mobile_limits(expires_at);
alter table public.vt_mobile_limits enable row level security;
revoke all on public.vt_mobile_limits from public, anon, authenticated;
grant select, insert, update, delete on public.vt_mobile_limits to service_role;

create table public.vt_mobile_reports (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('offensive','unsafe','incorrect','privacy','other')),
  feature text not null check (feature in ('speak','conversation','voice-note')),
  details text not null default '' check (length(details) <= 1000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);
create index vt_mobile_reports_expiry on public.vt_mobile_reports(expires_at);
alter table public.vt_mobile_reports enable row level security;
revoke all on public.vt_mobile_reports from public, anon, authenticated;
grant select, insert, delete on public.vt_mobile_reports to service_role;

create function public.vt_mobile_admit(p_fingerprint text, p_minute_limit integer, p_daily_limit integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer; daily text := 'day:' || to_char(now() at time zone 'UTC','YYYYMMDD');
begin
  if p_fingerprint !~ '^[a-f0-9]{64}$' or p_minute_limit not between 1 and 600 or p_daily_limit not between 1 and 100000 then
    raise exception 'invalid admission configuration';
  end if;
  delete from public.vt_mobile_limits where expires_at < now();
  insert into public.vt_mobile_limits as l values (daily,1,now()+interval '48 hours')
    on conflict (bucket) do update set requests=l.requests+1 where l.requests < p_daily_limit returning requests into n;
  if n is null then return false; end if;
  -- One short global row lock serializes reservations, including concurrent instances.
  n := null;
  insert into public.vt_mobile_limits as l values ('minute:'||p_fingerprint,1,now()+interval '2 minutes')
    on conflict (bucket) do update set requests=l.requests+1 where l.requests < p_minute_limit returning requests into n;
  return n is not null;
end;
$$;

create function public.vt_mobile_report(p_category text, p_feature text, p_details text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare reference uuid;
begin
  insert into public.vt_mobile_reports(category,feature,details) values(p_category,p_feature,p_details) returning id into reference;
  return reference;
end;
$$;

create function public.vt_mobile_purge()
returns void language sql security invoker set search_path = '' as $$
  delete from public.vt_mobile_limits where expires_at < now();
  delete from public.vt_mobile_reports where expires_at < now();
$$;
revoke all on function public.vt_mobile_admit(text,integer,integer) from public,anon,authenticated;
revoke all on function public.vt_mobile_report(text,text,text) from public,anon,authenticated;
revoke all on function public.vt_mobile_purge() from public,anon,authenticated;
grant execute on function public.vt_mobile_admit(text,integer,integer) to service_role;
grant execute on function public.vt_mobile_report(text,text,text) to service_role;
grant execute on function public.vt_mobile_purge() to service_role;
commit;
-- REQUIRED before enabling mobile traffic: schedule vt_mobile_purge() hourly in
-- Supabase Cron using a restricted administrative job; verify actual job history.
-- Reports have 30-day expiry; hourly cleanup gives at most one-hour deletion lag.
