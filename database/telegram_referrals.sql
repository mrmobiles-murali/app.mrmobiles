-- First-touch Telegram referral attribution for Mr Mobiles.
-- Production migration applied on 2026-10-03.

create table if not exists public.telegram_referrals (
  id uuid primary key default gen_random_uuid(),
  referred_user_id bigint not null unique,
  referrer_user_id bigint not null,
  source text not null default 'bot_start',
  created_at timestamptz not null default now(),
  constraint telegram_referrals_not_self check (referred_user_id <> referrer_user_id),
  constraint telegram_referrals_source_check check (source in ('bot_start','mini_app'))
);

create index if not exists telegram_referrals_referrer_created_idx
  on public.telegram_referrals (referrer_user_id, created_at desc);

alter table public.telegram_referrals enable row level security;
revoke all on table public.telegram_referrals from anon, authenticated;
grant select, insert, update, delete on table public.telegram_referrals to service_role;
