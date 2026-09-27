create table if not exists public.products (
  id text primary key,
  sku text unique,
  name text not null,
  brand text,
  model text,
  subtitle text not null default '',
  price_paise integer not null check (price_paise >= 0),
  category text not null check (category in ('phone','accessory','service')),
  emoji text not null default '📱',
  image_url text,
  stock_qty integer check (stock_qty is null or stock_qty >= 0),
  active boolean not null default true,
  search_aliases text[] not null default '{}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
revoke all on table public.products from anon, authenticated;
grant select, insert, update, delete on table public.products to service_role;

drop policy if exists "service role manages products" on public.products;
create policy "service role manages products"
on public.products
for all
to service_role
using (true)
with check (true);

create index if not exists products_active_category_idx
  on public.products (active, category);
