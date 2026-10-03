-- Repair operations and service warranty support.
-- Production migration applied on 2026-10-03.

alter table public.service_requests
  add column if not exists technician_name text,
  add column if not exists sla_due_at timestamptz;

create index if not exists service_requests_sla_due_idx
  on public.service_requests (sla_due_at)
  where sla_due_at is not null;

create table if not exists public.customer_warranties (
  id uuid primary key default gen_random_uuid(),
  warranty_code text not null unique,
  repair_reference text not null unique,
  telegram_user_id bigint not null,
  device_label text not null,
  start_at timestamptz not null default now(),
  end_at timestamptz not null,
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_warranties_status_check check (status in ('active','void'))
);

create index if not exists customer_warranties_user_end_idx
  on public.customer_warranties (telegram_user_id, end_at desc);

alter table public.customer_warranties enable row level security;
revoke all on table public.customer_warranties from anon, authenticated;
grant select, insert, update, delete on table public.customer_warranties to service_role;
