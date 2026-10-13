-- Blinds are hunting spots that need upkeep, not seats to reserve.
--   * Status on each pin: feeder motor, lock, chairs, trail cam, a condition line,
--     and who last touched it. Anyone in the family keeps these current.
--   * Anyone can add or edit a blind or feeder. Only the admin removes one.

alter table public.pins
  add column motor_status  text not null default 'working' check (motor_status in ('working', 'down')),
  add column lock_status   text not null default 'none' check (lock_status in ('none', 'locked', 'unlocked')),
  add column chairs        integer not null default 0 check (chairs between 0 and 20),
  add column has_camera    boolean not null default false,
  add column camera_status text not null default 'working' check (camera_status in ('working', 'batteries', 'down')),
  add column condition     text check (condition is null or length(condition) <= 300),
  add column status_by     uuid references public.members(id),
  add column status_at     timestamptz;

drop policy pins_insert on public.pins;
drop policy pins_update on public.pins;
create policy pins_insert on public.pins for insert to authenticated
  with check (public.is_active_member() and created_by = public.current_member_id());
create policy pins_update on public.pins for update to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
