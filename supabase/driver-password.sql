alter table public.drivers
  add column if not exists password_hash text,
  add column if not exists must_change_password boolean not null default true;

update public.drivers
set password_hash = encode(digest('Fila1234', 'sha256'), 'hex'),
    must_change_password = true
where password_hash is null;

notify pgrst, 'reload schema';