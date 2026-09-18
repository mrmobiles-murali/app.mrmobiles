create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  telegram_username text,
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR',
  status text not null default 'created',
  razorpay_order_id text unique,
  razorpay_payment_id text,
  cart jsonb not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists orders_telegram_user_id_idx
  on public.orders (telegram_user_id);

create index if not exists orders_status_idx
  on public.orders (status);

alter table public.orders enable row level security;

-- No public RLS policies are created.
-- This starter accesses orders only with the server-side service-role key.
