-- ─────────────────────────────────────────────────────────────────────────────
-- GroList — Supabase Database Schema
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: profiles
-- One row per authenticated user.
-- Auto-created via trigger when a new user signs up.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  display_name     text,
  store_preference text,        -- user's preferred store (string)
  budget           numeric,     -- null = no budget set
  onboarded        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own profile"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: lists
-- Each shopping trip is a list row.
-- Exactly one row per user has is_active = true at any time.
-- When a trip is complete, is_active → false + completed_at is set.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.lists (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  is_active    boolean not null default true,
  store_name   text,
  total        numeric,           -- set when trip is completed
  completed_at timestamptz,       -- null = trip in progress
  created_at   timestamptz not null default now()
);

alter table public.lists enable row level security;

create policy "own lists"
  on public.lists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Fast lookup: user's current active list
create index lists_active_idx
  on public.lists (user_id, is_active)
  where is_active = true;

-- Fast lookup: completed trips for history screen
create index lists_history_idx
  on public.lists (user_id, completed_at desc)
  where completed_at is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: items
-- Grocery items belonging to a list. Mirrors the GroceryItem type exactly.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.items (
  id         uuid primary key default uuid_generate_v4(),
  list_id    uuid not null references public.lists(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  qty        text not null default '1',
  price      numeric not null default 0,
  category   text not null default 'Other',
  checked    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.items enable row level security;

create policy "own items"
  on public.items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index items_list_idx on public.items (list_id);
create index items_user_idx on public.items (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: price_history
-- Per-user map of item name → last purchased price.
-- Upserted in batch on trip completion.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.price_history (
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_name  text not null,
  last_price numeric not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_name)
);

alter table public.price_history enable row level security;

create policy "own price history"
  on public.price_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: voice_usage
-- Logs every Whisper API call for rate limiting and cost tracking.
-- On-device (English) calls are free and NOT logged here.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.voice_usage (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  duration_ms integer,                       -- audio duration from client
  source_lang text,                          -- 'hi', 'te', 'ta', 'kn'
  status      text not null default 'ok',    -- 'ok', 'error', 'rate_limited'
  cost_usd    numeric generated always as (
    coalesce(duration_ms, 0) / 60000.0 * 0.006
  ) stored
);

alter table public.voice_usage enable row level security;

-- Users can read their own usage; service role inserts from Edge Function
create policy "users read own voice usage"
  on public.voice_usage for select
  using (auth.uid() = user_id);

create index voice_usage_user_day_idx
  on public.voice_usage (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- VIEWS: Admin cost monitoring (query from Supabase Dashboard → SQL Editor)
-- ─────────────────────────────────────────────────────────────────────────────

-- Daily cost per user
create or replace view public.voice_cost_daily as
select
  user_id,
  date_trunc('day', created_at) as day,
  count(*) as request_count,
  sum(coalesce(duration_ms, 0)) as total_duration_ms,
  sum(coalesce(cost_usd, 0))::numeric(10,4) as total_cost_usd
from public.voice_usage
where status = 'ok'
group by user_id, date_trunc('day', created_at)
order by day desc, total_cost_usd desc;

-- Monthly summary
create or replace view public.voice_cost_monthly as
select
  date_trunc('month', created_at) as month,
  count(distinct user_id) as unique_users,
  count(*) as total_requests,
  sum(coalesce(duration_ms, 0)) / 60000.0 as total_minutes,
  sum(coalesce(cost_usd, 0))::numeric(10,4) as total_cost_usd
from public.voice_usage
where status = 'ok'
group by date_trunc('month', created_at)
order by month desc;

-- Top users by cost (spot abuse)
create or replace view public.voice_top_users as
select
  vu.user_id,
  p.display_name,
  count(*) as total_requests,
  sum(coalesce(vu.cost_usd, 0))::numeric(10,4) as total_cost_usd,
  max(vu.created_at) as last_used
from public.voice_usage vu
join public.profiles p on p.id = vu.user_id
where vu.status = 'ok'
group by vu.user_id, p.display_name
order by total_cost_usd desc;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: scan_usage
-- Logs every receipt scan (GPT-4o-mini Vision) for rate limiting and cost tracking.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.scan_usage (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  token_count integer,
  status      text not null default 'ok',    -- 'ok', 'error', 'rate_limited'
  cost_usd    numeric generated always as (
    coalesce(token_count, 0) / 1000.0 * 0.0002
  ) stored
);

alter table public.scan_usage enable row level security;

create policy "users read own scan usage"
  on public.scan_usage for select
  using (auth.uid() = user_id);

create index scan_usage_user_day_idx
  on public.scan_usage (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- GRANTS
-- PostgREST requires explicit grants when tables are created via SQL.
-- (The Table Editor does this automatically — SQL Editor does not.)
-- ─────────────────────────────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.profiles      to authenticated;
grant select, insert, update, delete on public.lists         to authenticated;
grant select, insert, update, delete on public.items         to authenticated;
grant select, insert, update, delete on public.price_history to authenticated;
grant select on public.voice_usage to authenticated;
grant select on public.scan_usage to authenticated;

grant all on all sequences in schema public to authenticated;
