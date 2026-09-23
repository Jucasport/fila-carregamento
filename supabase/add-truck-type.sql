alter table public.drivers
add column if not exists truck_type text;

notify pgrst, 'reload schema';