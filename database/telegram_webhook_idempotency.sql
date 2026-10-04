-- Telegram webhook update idempotency for Mr Mobiles.
-- Production migration applied on 2026-10-04.
-- The table is server-only: anon/authenticated access is revoked and RLS is enabled.

create table if not exists public.telegram_webhook_updates (
  update_id bigint primary key,
  received_at timestamptz not null default now()
);

alter table public.telegram_webhook_updates enable row level security;

revoke all on table public.telegram_webhook_updates from anon, authenticated;
grant select, insert, delete on table public.telegram_webhook_updates to service_role;

create index if not exists telegram_webhook_updates_received_at_idx
  on public.telegram_webhook_updates (received_at);
