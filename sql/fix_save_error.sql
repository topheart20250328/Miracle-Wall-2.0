-- Fix for "Save Failed" error
-- Run this in Supabase SQL Editor

-- 1. Ensure the is_approved column exists and has a default
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wall_stickers' AND column_name = 'is_approved') THEN
        ALTER TABLE public.wall_stickers ADD COLUMN is_approved boolean NOT NULL DEFAULT false;
    END IF;
END $$;

-- 2. Update the create_wall_sticker function to explicitly handle is_approved
-- Drop ALL potential conflicting versions of the function
DROP FUNCTION IF EXISTS public.create_wall_sticker(double precision, double precision, text, text, double precision);
DROP FUNCTION IF EXISTS public.create_wall_sticker(double precision, double precision, text, text, text);

create or replace function public.create_wall_sticker(
  p_x_norm double precision,
  p_y_norm double precision,
  p_note text,
  p_device_id text default null,
  p_min_distance double precision default 0.0103
)
returns setof public.wall_stickers
language plpgsql
security definer
as $$
declare
  target_device text;
  inserted public.wall_stickers;
begin
  -- Use provided device ID or fall back to request header
  target_device := coalesce(p_device_id, current_setting('request.headers', true)::json->>'x-device-id');

  -- Check for overlaps (using the provided min distance)
  if exists (
    select 1
    from public.wall_stickers
    where sqrt(power(x_norm - p_x_norm, 2) + power(y_norm - p_y_norm, 2)) < p_min_distance
  ) then
    raise exception 'POSITION_CONFLICT' using errcode = 'P0001';
  end if;

  -- Insert the new sticker
  insert into public.wall_stickers (x_norm, y_norm, note, device_id, is_approved)
  values (p_x_norm, p_y_norm, p_note, target_device, false)
  returning * into inserted;

  return next inserted;
end;
$$;
