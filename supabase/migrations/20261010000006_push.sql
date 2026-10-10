-- Back 40: push notifications
--
-- How it fits together
--   * Phones subscribe (Web Push) and store the subscription + their preferences in push_subscriptions.
--   * Postgres triggers call public.notify_push(kind, title, body, url, only, exclude), which POSTs to the
--     "push" Edge Function through pg_net. The function fans out to every subscription whose prefs[kind] is true.
--   * Two scheduled jobs (pg_cron) handle the feeder digest and "not back by" alerts.
--   * Nothing here fails if pg_net / pg_cron / the function URL aren't set up: notify_push just does nothing.
--
-- One-time setup (README): deploy the function, then in the SQL editor
--   insert into private.config (key, value) values
--     ('push_url', 'https://<project-ref>.supabase.co/functions/v1/push'),
--     ('push_secret', '<the same PUSH_SECRET you gave the function>');

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then create extension if not exists pg_net; end if;
end $$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.config (
  key    text primary key,
  value  text not null
);

-- Notification kinds (keys of push_subscriptions.prefs):
--   stand_claims, harvests, todos_assigned, feeders_overdue, events, overdue_checkin

create or replace function public.notify_push(
  p_kind text, p_title text, p_body text, p_url text default '/',
  p_only uuid[] default null, p_exclude uuid default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from private.config where key = 'push_url';
  select value into v_secret from private.config where key = 'push_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
      body := jsonb_build_object('kind', p_kind, 'title', p_title, 'body', p_body, 'url', p_url,
                                 'only', to_jsonb(p_only), 'exclude', p_exclude)
    );
  exception when others then
    null; -- never let a notification problem block the write that caused it
  end;
end;
$$;

revoke execute on function public.notify_push(text, text, text, text, uuid[], uuid) from public, anon, authenticated;

create or replace function public.member_name(p_id uuid) returns text
language sql stable security definer set search_path = public
as $$ select coalesce((select name from public.members where id = p_id), 'Someone') $$;

-- ---------------------------------------------------------------------------
-- Stand claims for this coming weekend (through the next Sunday)
-- ---------------------------------------------------------------------------
create or replace function public.trg_push_stand_claim() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_stand text;
  v_sunday date := current_date + ((7 - extract(dow from current_date)::int) % 7);
  v_when text;
begin
  if tg_op = 'UPDATE' and (old.released_at is not null or new.released_at is null) then
    return new; -- only care about a release happening now
  end if;
  if new.date < current_date or new.date > v_sunday then
    return new;
  end if;
  select name into v_stand from public.pins where id = new.stand_id;
  v_when := to_char(new.date, 'Dy') || ' ' || upper(new.sit::text);
  if tg_op = 'INSERT' then
    perform public.notify_push('stand_claims', 'Stand claimed',
      public.member_name(new.member_id) || ' claimed ' || coalesce(v_stand, 'a stand') || ' for ' || v_when,
      '/stands', null, new.member_id);
  else
    perform public.notify_push('stand_claims', 'Stand opened up',
      coalesce(v_stand, 'A stand') || ' is open again for ' || v_when,
      '/stands', null, coalesce(new.released_by, new.member_id));
  end if;
  return new;
end;
$$;

create trigger stand_claims_push after insert or update on public.stand_claims
  for each row execute function public.trg_push_stand_claim();

-- ---------------------------------------------------------------------------
-- New harvest
-- ---------------------------------------------------------------------------
create or replace function public.trg_push_harvest() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.notify_push('harvests', 'New harvest',
    public.member_name(new.member_id) || ' took a ' ||
      case when new.sex in ('buck', 'doe') then new.sex || ' ' else '' end || lower(new.species) ||
      coalesce(' (' || new.description || ')', ''),
    '/harvests', null, new.created_by);
  return new;
end;
$$;

create trigger harvests_push after insert on public.harvests
  for each row execute function public.trg_push_harvest();

-- ---------------------------------------------------------------------------
-- To-do assigned to me
-- ---------------------------------------------------------------------------
create or replace function public.trg_push_todo() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.assignee_id is null or new.status <> 'open' then return new; end if;
  if tg_op = 'UPDATE' and old.assignee_id is not distinct from new.assignee_id then return new; end if;
  if new.assignee_id = new.created_by and tg_op = 'INSERT' then return new; end if;
  perform public.notify_push('todos_assigned', 'To-do for you',
    public.member_name(coalesce(new.created_by, new.assignee_id)) || ': ' || new.title,
    '/todos', array[new.assignee_id], null);
  return new;
end;
$$;

create trigger todos_push after insert or update on public.todos
  for each row execute function public.trg_push_todo();

-- ---------------------------------------------------------------------------
-- New calendar entry
-- ---------------------------------------------------------------------------
create or replace function public.trg_push_event() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.notify_push('events', 'Added to the calendar',
    public.member_name(new.created_by) || ': ' || new.title || ' · ' ||
      to_char(new.starts_on, 'Mon DD') || case when new.ends_on <> new.starts_on then '–' || to_char(new.ends_on, 'DD') else '' end ||
      case new.kind when 'exclusive' then ' (just them)' when 'inclusive' then ' (come join)' else '' end,
    '/calendar/' || new.id, null, new.created_by);
  return new;
end;
$$;

create trigger events_push after insert on public.events
  for each row execute function public.trg_push_event();

-- ---------------------------------------------------------------------------
-- Scheduled: feeders overdue digest, and people past their "back by" time
-- ---------------------------------------------------------------------------
alter table public.checkins add column if not exists overdue_notified_at timestamptz;

create or replace function public.push_feeders_overdue() returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_list text;
begin
  select string_agg(name || ' (' || days || 'd)', ', ' order by days desc) into v_list
  from (
    select p.name,
           extract(day from now() - max(f.filled_at))::int as days,
           p.fill_interval_days
    from public.pins p
    left join public.feeder_fills f on f.feeder_id = p.id and f.deleted_at is null
    where p.type = 'feeder' and p.deleted_at is null and p.fill_interval_days is not null
    group by p.id, p.name, p.fill_interval_days
    having max(f.filled_at) is null or now() - max(f.filled_at) >= make_interval(days => p.fill_interval_days)
  ) d;
  if v_list is not null then
    perform public.notify_push('feeders_overdue', 'Feeders due', v_list, '/feeders');
  end if;
end;
$$;

create or replace function public.push_overdue_checkins() returns void
language plpgsql security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    select c.id, c.member_id, c.expected_back
    from public.checkins c
    where c.left_at is null and c.overdue_notified_at is null
      and c.expected_back is not null and c.expected_back < now() - interval '15 minutes'
  loop
    perform public.notify_push('overdue_checkin', 'Not back yet',
      public.member_name(r.member_id) || ' said back by ' || to_char(r.expected_back at time zone 'America/Chicago', 'HH12:MI AM') || ' and hasn''t checked out',
      '/', null, r.member_id);
    update public.checkins set overdue_notified_at = now() where id = r.id;
  end loop;
end;
$$;

revoke execute on function public.push_feeders_overdue() from public, anon, authenticated;
revoke execute on function public.push_overdue_checkins() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('back40-feeders-digest', '0 12 * * *', $job$select public.push_feeders_overdue()$job$);   -- 7am Central
    perform cron.schedule('back40-overdue-checkins', '*/15 * * * *', $job$select public.push_overdue_checkins()$job$);
  end if;
end;
$$;
