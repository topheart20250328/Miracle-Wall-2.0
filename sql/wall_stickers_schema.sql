-- 建立留言貼紙表格
create extension if not exists pgcrypto;

create table if not exists public.wall_stickers (
  id uuid primary key default gen_random_uuid(),
  x_norm double precision not null check (x_norm between 0 and 1),
  y_norm double precision not null check (y_norm between 0 and 1),
  note text not null check (char_length(note) <= 800),
  rotation_angle double precision not null default 0 check (rotation_angle >= 0 and rotation_angle < 360),
  device_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.wall_stickers
  add column if not exists rotation_angle double precision not null default 0;

alter table if exists public.wall_stickers
  alter column rotation_angle set data type double precision,
  alter column rotation_angle set not null,
  alter column rotation_angle set default 0;

alter table if exists public.wall_stickers
  add column if not exists device_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.wall_stickers'::regclass
      and conname = 'wall_stickers_rotation_angle_check'
  ) then
    alter table public.wall_stickers
      add constraint wall_stickers_rotation_angle_check
      check (rotation_angle >= 0 and rotation_angle < 360);
  end if;
end;
$$;

create or replace function public.request_device_id()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-device-id',
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'device_id'
  );
$$;

create or replace function public.is_admin_request()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-admin-secret' = 'admin-super-secret',
    false
  );
$$;

create or replace function public.set_wall_stickers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_wall_stickers_updated_at on public.wall_stickers;
create trigger trg_wall_stickers_updated_at
before update on public.wall_stickers
for each row
execute procedure public.set_wall_stickers_updated_at();

create index if not exists idx_wall_stickers_created_at on public.wall_stickers (created_at desc);
create index if not exists idx_wall_stickers_device_id on public.wall_stickers (device_id);

alter table public.wall_stickers enable row level security;

drop policy if exists "Allow read" on public.wall_stickers;
create policy "Allow read" on public.wall_stickers
for select
using (true);

drop policy if exists "Allow insert" on public.wall_stickers;
create policy "Allow insert" on public.wall_stickers
for insert
with check (
  public.is_admin_request()
  or (
    device_id is null
    or device_id = public.request_device_id()
  )
);

drop policy if exists "Allow update" on public.wall_stickers;
create policy "Allow update" on public.wall_stickers
for update
using (
  public.is_admin_request()
  or (
    created_at >= timezone('utc', now()) - interval '24 hours'
    and (
      device_id is null
      or device_id = public.request_device_id()
    )
  )
)
with check (
  public.is_admin_request()
  or (
    created_at >= timezone('utc', now()) - interval '24 hours'
    and (
      device_id is null
      or device_id = public.request_device_id()
    )
  )
);

drop policy if exists "Allow delete" on public.wall_stickers;
create policy "Allow delete" on public.wall_stickers
for delete
using (
  public.is_admin_request()
  or (
    created_at >= timezone('utc', now()) - interval '24 hours'
    and (
      device_id is null
      or device_id = public.request_device_id()
    )
  )
);
