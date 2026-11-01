-- Product visuals are consumed only by trusted server-side catalogue code.
-- RLS remains enabled. The server uses the Supabase service_role key.
-- Apply only to an isolated/staging database first, then verify grants and RLS.

alter table public.product_visuals enable row level security;

revoke all on table public.product_visuals from anon, authenticated;

grant select, insert, update, delete
  on table public.product_visuals
  to service_role;
