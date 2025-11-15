-- 建立留言貼紙表格
create extension if not exists pgcrypto;

create table if not exists public.wall_stickers (
  id uuid primary key default gen_random_uuid(),
  x_norm double precision not null check (x_norm between 0 and 1),
  y_norm double precision not null check (y_norm between 0 and 1),
  note text not null check (char_length(note) <= 800),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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

alter table public.wall_stickers enable row level security;

drop policy if exists "Allow read" on public.wall_stickers;
create policy "Allow read" on public.wall_stickers
for select
using (true);

drop policy if exists "Allow insert" on public.wall_stickers;
create policy "Allow insert" on public.wall_stickers
for insert
with check (true);

drop policy if exists "Allow update" on public.wall_stickers;
create policy "Allow update" on public.wall_stickers
for update
using (true)
with check (true);
