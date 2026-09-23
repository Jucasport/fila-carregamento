alter table public.drivers
  add column if not exists password_hash text,
  add column if not exists must_change_password boolean not null default true;

drop policy if exists "public_update_drivers" on public.drivers;
create policy "public_update_drivers" on public.drivers
for update using (true) with check (true);

update public.drivers
set password_hash = encode(digest('Fila1234', 'sha256'), 'hex'),
    must_change_password = true
where password_hash is null;

notify pgrst, 'reload schema';