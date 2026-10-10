-- Back 40: identity, members, settings
--
-- Identity model
--   * Every device signs in with Supabase Anonymous Auth, so it has an auth.users row.
--   * join_with_code(code, member_id) checks the family code and links that auth user
--     to a members row via member_devices.
--   * unlock_admin(pin) flips member_devices.is_admin for the calling device.
--   * The family code and admin PIN live hashed in settings (bcrypt via pgcrypto).
--   * Row Level Security everywhere. Only auth users linked to an active member
--     can read or write anything.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 40),
  is_active   boolean not null default true,
  created_by  uuid references public.members(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.members is 'People who use the app. Deactivated members keep their history.';

create table public.settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

comment on table public.settings is 'App-wide settings. family_code_hash and admin_pin_hash are bcrypt hashes and never leave the database.';

create table public.member_devices (
  auth_user_id  uuid primary key references auth.users(id) on delete cascade,
  member_id     uuid not null references public.members(id),
  is_admin      boolean not null default false,
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

comment on table public.member_devices is 'Links an anonymous auth user (one per device) to the member who picked their name on it.';

create index member_devices_member_id_idx on public.member_devices(member_id);

-- ---------------------------------------------------------------------------
-- Helper functions used by RLS policies
-- ---------------------------------------------------------------------------

create or replace function public.current_member_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select d.member_id
  from public.member_devices d
  join public.members m on m.id = d.member_id
  where d.auth_user_id = auth.uid()
    and m.is_active;
$$;

create or replace function public.is_active_member()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.current_member_id() is not null;
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select d.is_admin
    from public.member_devices d
    join public.members m on m.id = d.member_id
    where d.auth_user_id = auth.uid()
      and m.is_active
  ), false);
$$;

-- Generic triggers -----------------------------------------------------------

create or replace function public.set_created_by()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    new.created_by := public.current_member_id();
  end if;
  return new;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger members_set_created_by before insert on public.members
  for each row execute function public.set_created_by();
create trigger members_set_updated_at before update on public.members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Secrets (family code, admin PIN)
-- ---------------------------------------------------------------------------

create or replace function public.check_secret(p_key text, p_value text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.settings
    where key = p_key
      and value = crypt(p_value, value)
  );
$$;

-- Not callable from the API. Run from the SQL editor to set the first code and PIN:
--   select public.bootstrap_secrets('your-family-code', '1234');
create or replace function public.bootstrap_secrets(p_family_code text, p_admin_pin text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if length(btrim(p_family_code)) < 4 then
    raise exception 'Family code must be at least 4 characters';
  end if;
  if length(btrim(p_admin_pin)) < 4 then
    raise exception 'Admin PIN must be at least 4 characters';
  end if;
  insert into public.settings (key, value)
  values ('family_code_hash', crypt(btrim(p_family_code), gen_salt('bf'))),
         ('admin_pin_hash',   crypt(btrim(p_admin_pin),   gen_salt('bf')))
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

revoke execute on function public.bootstrap_secrets(text, text) from public, anon, authenticated;
revoke execute on function public.check_secret(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs called by the app
-- ---------------------------------------------------------------------------

-- Who is this device? Safe to call before joining.
create or replace function public.whoami()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'member_id', m.id,
      'name',      m.name,
      'is_active', m.is_active,
      'is_admin',  d.is_admin and m.is_active
    )
    from public.member_devices d
    join public.members m on m.id = d.member_id
    where d.auth_user_id = auth.uid()
  ), jsonb_build_object('member_id', null, 'name', null, 'is_active', false, 'is_admin', false));
$$;

-- Step 1 of onboarding: show the names once the code is right.
create or replace function public.list_members_with_code(code text)
returns table (id uuid, name text)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not public.check_secret('family_code_hash', btrim(code)) then
    raise exception 'That family code is not right' using errcode = '28P01';
  end if;
  return query
    select m.id, m.name from public.members m
    where m.is_active
    order by m.name;
end;
$$;

-- Step 2 of onboarding: link this device to a member.
create or replace function public.join_with_code(code text, member_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := member_id;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not public.check_secret('family_code_hash', btrim(code)) then
    raise exception 'That family code is not right' using errcode = '28P01';
  end if;
  if not exists (select 1 from public.members m where m.id = v_member and m.is_active) then
    raise exception 'That person is not on the list' using errcode = 'P0002';
  end if;

  insert into public.member_devices (auth_user_id, member_id)
  values (auth.uid(), v_member)
  on conflict (auth_user_id) do update
    set member_id = excluded.member_id,
        is_admin = false,
        last_seen_at = now();

  return public.whoami();
end;
$$;

-- Settings > Switch person (shared devices). The device must already be linked.
create or replace function public.switch_member(member_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := member_id;
begin
  if not public.is_active_member() then
    raise exception 'Join with the family code first' using errcode = '28000';
  end if;
  if not exists (select 1 from public.members m where m.id = v_member and m.is_active) then
    raise exception 'That person is not on the list' using errcode = 'P0002';
  end if;

  update public.member_devices
    set member_id = v_member, is_admin = false, last_seen_at = now()
    where auth_user_id = auth.uid();

  return public.whoami();
end;
$$;

create or replace function public.unlock_admin(pin text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_active_member() then
    raise exception 'Join with the family code first' using errcode = '28000';
  end if;
  if not public.check_secret('admin_pin_hash', btrim(pin)) then
    raise exception 'That PIN is not right' using errcode = '28P01';
  end if;
  update public.member_devices set is_admin = true where auth_user_id = auth.uid();
  return public.whoami();
end;
$$;

create or replace function public.lock_admin()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  update public.member_devices set is_admin = false where auth_user_id = auth.uid();
  return public.whoami();
end;
$$;

create or replace function public.set_family_code(new_code text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if length(btrim(new_code)) < 4 then
    raise exception 'Family code must be at least 4 characters';
  end if;
  insert into public.settings (key, value)
  values ('family_code_hash', crypt(btrim(new_code), gen_salt('bf')))
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

create or replace function public.set_admin_pin(new_pin text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if length(btrim(new_pin)) < 4 then
    raise exception 'Admin PIN must be at least 4 characters';
  end if;
  insert into public.settings (key, value)
  values ('admin_pin_hash', crypt(btrim(new_pin), gen_salt('bf')))
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.members enable row level security;
alter table public.settings enable row level security;
alter table public.member_devices enable row level security;

-- members: any active member can read the roster; only the admin changes it.
create policy members_select on public.members
  for select to authenticated
  using (public.is_active_member());

create policy members_insert on public.members
  for insert to authenticated
  with check (public.is_admin());

create policy members_update on public.members
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- settings: hashes are never readable. Other keys (none yet) are readable by members.
create policy settings_select on public.settings
  for select to authenticated
  using (public.is_active_member() and key not like '%\_hash');

-- member_devices: a device can see its own row and nothing else. Writes go through RPCs.
create policy member_devices_select_own on public.member_devices
  for select to authenticated
  using (auth_user_id = auth.uid());
