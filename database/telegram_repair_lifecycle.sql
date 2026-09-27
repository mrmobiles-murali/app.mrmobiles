-- Telegram repair lifecycle additions.
-- Applied to Supabase production before deploying the matching bot workflow.

alter table public.service_requests
  alter column customer_phone drop not null;

alter table public.service_requests
  add column if not exists telegram_user_id bigint,
  add column if not exists source text not null default 'web';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'service_requests_source_check'
      and conrelid = 'public.service_requests'::regclass
  ) then
    alter table public.service_requests
      add constraint service_requests_source_check
      check (source in ('web','telegram'));
  end if;
end $$;

create index if not exists service_requests_telegram_user_created_idx
  on public.service_requests (telegram_user_id, created_at desc);

alter table public.service_requests enable row level security;
revoke all on table public.service_requests from anon, authenticated;
grant select, insert, update, delete on table public.service_requests to service_role;

alter table public.workflow_events enable row level security;
revoke all on table public.workflow_events from anon, authenticated;
grant select, insert on table public.workflow_events to service_role;
