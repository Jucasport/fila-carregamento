create extension if not exists pgcrypto;

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists queues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  name text not null default 'Fila principal',
  average_loading_minutes integer not null default 30,
  is_paused boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  name text not null,
  phone text not null,
  plate text not null,
  carrier text,
  truck_type text,
  access_code text unique,
  created_at timestamptz default now()
);

create table if not exists queue_entries (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references queues(id) on delete cascade,
  driver_id uuid references drivers(id) on delete cascade,
  position integer not null,
  status text not null check (status in ('AGUARDANDO','PRÓXIMO','CHAMADO','EM_CARREGAMENTO','CARREGADO','CANCELADO','AUSENTE')),
  joined_at timestamptz default now(),
  called_at timestamptz,
  loading_started_at timestamptz,
  loading_finished_at timestamptz,
  estimated_wait_minutes integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists queue_history (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references queues(id) on delete cascade,
  driver_id uuid references drivers(id) on delete cascade,
  plate text not null,
  joined_at timestamptz,
  called_at timestamptz,
  loading_started_at timestamptz,
  loading_finished_at timestamptz,
  total_wait_minutes integer,
  loading_minutes integer,
  status text,
  created_at timestamptz default now()
);

create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references queues(id) on delete cascade,
  average_loading_minutes integer not null default 30,
  notification_enabled boolean default true,
  updated_at timestamptz default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references drivers(id) on delete cascade,
  message text not null,
  sent_at timestamptz default now(),
  is_read boolean default false
);

create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references queues(id) on delete cascade,
  actor_id uuid,
  action text not null,
  details jsonb,
  created_at timestamptz default now()
);

create unique index if not exists drivers_plate_unique on drivers (upper(plate));
create index if not exists queue_entries_queue_position_idx on queue_entries (queue_id, position);
create index if not exists queue_entries_status_idx on queue_entries (status);

alter table drivers add column if not exists truck_type text;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_queue_entries_updated_at on queue_entries;
create trigger set_queue_entries_updated_at
before update on queue_entries
for each row
execute function set_updated_at();

drop trigger if exists set_settings_updated_at on settings;
create trigger set_settings_updated_at
before update on settings
for each row
execute function set_updated_at();

create or replace function call_next_driver()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_entry_id uuid;
begin
  select id
  into current_entry_id
  from queue_entries
  where status = 'AGUARDANDO'
  order by position, joined_at
  limit 1
  for update;

  if current_entry_id is null then
    return;
  end if;

  update queue_entries
  set status = 'CHAMADO',
      position = 1,
      called_at = now()
  where id = current_entry_id;

  update queue_entries
  set position = position - 1,
      status = case when position = 2 then 'PRÓXIMO' else 'AGUARDANDO' end
  where status = 'AGUARDANDO'
    and id <> current_entry_id;
end;
$$;

create or replace function remove_driver_from_queue(target_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_queue_id uuid;
  removed_position integer;
begin
  select queue_id, position
  into removed_queue_id, removed_position
  from queue_entries
  where driver_id = target_driver_id
    and status in ('AGUARDANDO', 'PRÓXIMO', 'CHAMADO', 'EM_CARREGAMENTO')
  order by joined_at desc
  limit 1
  for update;

  if removed_queue_id is null then
    return;
  end if;

  update queue_entries
  set status = 'CANCELADO', updated_at = now()
  where queue_id = removed_queue_id
    and driver_id = target_driver_id
    and position = removed_position;

  update queue_entries
  set position = position - 1, updated_at = now()
  where queue_id = removed_queue_id
    and status in ('AGUARDANDO', 'PRÓXIMO', 'CHAMADO', 'EM_CARREGAMENTO')
    and position > removed_position;
end;
$$;

alter table companies enable row level security;
alter table locations enable row level security;
alter table queues enable row level security;
alter table drivers enable row level security;
alter table queue_entries enable row level security;
alter table queue_history enable row level security;
alter table settings enable row level security;
alter table notifications enable row level security;
alter table admin_audit_logs enable row level security;

drop policy if exists "public_select_companies" on companies;
create policy "public_select_companies" on companies for select using (true);

drop policy if exists "public_select_locations" on locations;
create policy "public_select_locations" on locations for select using (true);

drop policy if exists "public_select_queues" on queues;
create policy "public_select_queues" on queues for select using (true);

drop policy if exists "public_select_drivers" on drivers;
create policy "public_select_drivers" on drivers for select using (true);

drop policy if exists "public_select_queue_entries" on queue_entries;
create policy "public_select_queue_entries" on queue_entries for select using (true);

drop policy if exists "public_insert_drivers" on drivers;
create policy "public_insert_drivers" on drivers for insert with check (true);

drop policy if exists "public_insert_queue_entries" on queue_entries;
create policy "public_insert_queue_entries" on queue_entries for insert with check (true);

drop policy if exists "public_update_queue_entries" on queue_entries;
create policy "public_update_queue_entries" on queue_entries for update using (true) with check (true);

drop policy if exists "public_select_history" on queue_history;
create policy "public_select_history" on queue_history for select using (true);

drop policy if exists "public_insert_history" on queue_history;
create policy "public_insert_history" on queue_history for insert with check (true);

drop policy if exists "public_read_settings" on settings;
create policy "public_read_settings" on settings for select using (true);

drop policy if exists "public_update_settings" on settings;
create policy "public_update_settings" on settings for update using (true) with check (true);

drop policy if exists "public_insert_admin_audit_logs" on admin_audit_logs;
create policy "public_insert_admin_audit_logs" on admin_audit_logs for insert with check (true);

insert into companies (name)
values ('Empresa Demo')
on conflict do nothing;

insert into queues (company_id, location_id, name, average_loading_minutes)
select c.id, null, 'Fila principal', 30
from companies c
where c.name = 'Empresa Demo'
on conflict do nothing;
