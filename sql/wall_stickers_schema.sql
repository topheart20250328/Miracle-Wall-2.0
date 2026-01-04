-- 建立留言貼紙表格
create extension if not exists pgcrypto;

create table if not exists public.wall_stickers (
  id uuid primary key default gen_random_uuid(),
  x_norm double precision not null check (x_norm between 0 and 1),
  y_norm double precision not null check (y_norm between 0 and 1),
  note text not null check (char_length(note) <= 800),
  device_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.wall_review_settings (
  id uuid primary key default gen_random_uuid(),
  require_marquee_approval boolean not null default true,
  require_sticker_approval boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint wall_review_settings_sticker_depends_marquee check (require_sticker_approval = false or require_marquee_approval = true)
);

create unique index if not exists idx_wall_review_settings_singleton on public.wall_review_settings ((true));

drop view if exists public.wall_sticker_entries;

alter table if exists public.wall_stickers
  add column if not exists device_id text;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wall_stickers'
      and column_name = 'is_approved'
  ) then
    alter table public.wall_stickers
      add column is_approved boolean not null default false;
    update public.wall_stickers
      set is_approved = true;
  end if;
end;
$$;

alter table if exists public.wall_stickers
  alter column is_approved set default false;

alter table if exists public.wall_stickers
  alter column is_approved set not null;

alter table if exists public.wall_stickers
  drop column if exists rotation_angle;

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

drop function if exists public.create_wall_sticker(double precision, double precision, text, double precision, text, double precision);
drop function if exists public.create_wall_sticker(double precision, double precision, text, text, double precision);

create or replace function public.create_wall_sticker(
  p_x_norm double precision,
  p_y_norm double precision,
  p_note text,
  p_device_id text default null,
  p_min_distance double precision default 0.0103
)
returns public.wall_stickers
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = on
as $$
declare
  conflict_exists boolean;
  target_device text;
  inserted public.wall_stickers;
begin
  target_device := coalesce(p_device_id, public.request_device_id());

  select exists (
    select 1
    from public.wall_stickers
    where ((x_norm - p_x_norm) * (x_norm - p_x_norm) + (y_norm - p_y_norm) * (y_norm - p_y_norm))
      < (p_min_distance * p_min_distance)
  )
  into conflict_exists;

  if conflict_exists then
    raise exception using message = 'POSITION_CONFLICT';
  end if;

  insert into public.wall_stickers (x_norm, y_norm, note, device_id, is_approved)
  values (p_x_norm, p_y_norm, p_note, target_device, false)
  returning * into inserted;

  return inserted;
end;
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

create or replace function public.set_wall_review_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_wall_review_settings_updated_at on public.wall_review_settings;
create trigger trg_wall_review_settings_updated_at
before update on public.wall_review_settings
for each row
execute procedure public.set_wall_review_settings_updated_at();

insert into public.wall_review_settings (require_marquee_approval, require_sticker_approval)
select true, true
where not exists (select 1 from public.wall_review_settings);

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
  and coalesce(is_approved, false) = false
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
    and coalesce(is_approved, false) = false
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

create or replace view public.wall_sticker_entries
with (security_barrier = true)
as
select
  ws.id,
  ws.x_norm,
  ws.y_norm,
  case
    when not coalesce(settings.require_sticker_approval, true)
      or public.is_admin_request()
      or (
        ws.device_id is not null
        and ws.device_id = public.request_device_id()
      )
      or (
        ws.device_id is null
        and public.request_device_id() is null
      )
      or ws.is_approved
    then ws.note
    else null
  end as note,
  ws.created_at,
  ws.updated_at,
  ws.device_id,
  ws.is_approved,
  case
    when not coalesce(settings.require_sticker_approval, true)
      or public.is_admin_request()
      or (
        ws.device_id is not null
        and ws.device_id = public.request_device_id()
      )
      or (
        ws.device_id is null
        and public.request_device_id() is null
      )
    then true
    else false
  end as can_view_note
from public.wall_stickers ws
left join public.wall_review_settings settings on true;

grant select on public.wall_sticker_entries to anon;
grant select on public.wall_sticker_entries to authenticated;
grant execute on function public.create_wall_sticker(double precision, double precision, text, text, double precision) to anon;
grant execute on function public.create_wall_sticker(double precision, double precision, text, text, double precision) to authenticated;

alter table public.wall_review_settings enable row level security;

drop policy if exists "Allow read review settings" on public.wall_review_settings;
create policy "Allow read review settings" on public.wall_review_settings
for select
using (true);

drop policy if exists "Allow admin manage review settings" on public.wall_review_settings;
create policy "Allow admin manage review settings" on public.wall_review_settings
for all
using (public.is_admin_request())
with check (public.is_admin_request());

grant select on public.wall_review_settings to anon;
grant select on public.wall_review_settings to authenticated;
