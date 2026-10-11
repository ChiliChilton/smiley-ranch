-- Back 40: push notifications
--
-- How it fits together
--   * Phones subscribe (Web Push) and store the subscription + their preferences in push_subscriptions.
--   * Postgres triggers call public.notify_push(kind, title, body, url, only, exclude), which POSTs to the
--     "push" Edge Function through pg_net. The function fans out to every subscription whose prefs[kind] is true.
--   * A scheduled job (pg_cron) sends the morning feeder digest.
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
--   stand_claims, harvests, todos_assigned, feeders_overdue, events

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
-- Scheduled: feeders due / running out digest
-- ---------------------------------------------------------------------------
create or replace function public.push_feeders_overdue() returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_list text;
begin
  -- A feeder is "due" when the bag estimate says it runs out within 2 days (or already has),
  -- or, with no bag info, when the fixed interval has passed.
  select string_agg(name || ' (' || note || ')', ', ' order by sort_key) into v_list
  from (
    select p.name,
           case
             when lf.bags is not null and p.days_per_bag is not null then
               case when lf.filled_at + make_interval(days => (lf.bags * p.days_per_bag)::int) < now()
                    then 'empty' else 'runs out ' || to_char(lf.filled_at + make_interval(days => (lf.bags * p.days_per_bag)::int), 'Dy') end
             when lf.filled_at is null then 'never filled'
             else extract(day from now() - lf.filled_at)::int || ' days'
           end as note,
           coalesce(lf.filled_at, 'epoch'::timestamptz) as sort_key,
           lf.filled_at, lf.bags, p.days_per_bag, p.fill_interval_days
    from public.pins p
    left join lateral (
      select f.filled_at, f.bags from public.feeder_fills f
      where f.feeder_id = p.id and f.deleted_at is null order by f.filled_at desc limit 1
    ) lf on true
    where p.type = 'feeder' and p.deleted_at is null
  ) d
  where (bags is not null and days_per_bag is not null and filled_at + make_interval(days => (bags * days_per_bag)::int) <= now() + interval '2 days')
     or (not (bags is not null and days_per_bag is not null) and fill_interval_days is not null
         and (filled_at is null or now() - filled_at >= make_interval(days => fill_interval_days)));
  if v_list is not null then
    perform public.notify_push('feeders_overdue', 'Feeders due', v_list, '/feeders');
  end if;
end;
$$;

revoke execute on function public.push_feeders_overdue() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('smiley-feeders-digest', '0 12 * * *', $job$select public.push_feeders_overdue()$job$);   -- 7am Central
  end if;
end;
$$;
