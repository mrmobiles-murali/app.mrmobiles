-- Install only after review and before enabling the WhatsApp API webhook.
-- Keep WhatsApp sender identity separate from Telegram user IDs.
create table if not exists public.whatsapp_webhook_events (
  event_key text primary key check (length(event_key) = 64),
  payload jsonb not null,
  state text not null default 'pending'
    check (state in ('pending', 'processing', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists whatsapp_webhook_events_pending_idx
  on public.whatsapp_webhook_events (received_at)
  where state in ('pending','failed');
alter table public.whatsapp_webhook_events enable row level security;
revoke all on public.whatsapp_webhook_events from anon, authenticated;
-- No anon/authenticated policies. Backend service role only.
