-- migration_v4.sql -- Community ideas board for Listorix
--
-- Run in: Supabase -> SQL Editor

create table if not exists public.feature_ideas (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  title text not null,
  normalized_title text generated always as (
    regexp_replace(lower(btrim(title)), '\s+', ' ', 'g')
  ) stored,
  description text not null default '',
  status text not null default 'open' check (status in ('open', 'planned', 'in_progress')),
  vote_count integer not null default 0 check (vote_count >= 0),
  source text not null default 'user' check (source in ('seeded', 'user')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists feature_ideas_normalized_title_idx
  on public.feature_ideas(normalized_title);

create table if not exists public.feature_idea_votes (
  idea_id uuid not null references public.feature_ideas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

create index if not exists feature_idea_votes_user_idx
  on public.feature_idea_votes(user_id);

create or replace function public.touch_feature_ideas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_feature_ideas_updated_at on public.feature_ideas;
create trigger trg_feature_ideas_updated_at
  before update on public.feature_ideas
  for each row execute procedure public.touch_feature_ideas_updated_at();

alter table public.feature_ideas enable row level security;
alter table public.feature_idea_votes enable row level security;

create policy "anyone can read feature ideas"
  on public.feature_ideas for select
  using (true);

create policy "users can read own feature idea votes"
  on public.feature_idea_votes for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.toggle_feature_idea_vote(p_idea_id uuid)
returns table (idea_id uuid, vote_count integer, voted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_exists boolean;
  v_vote_count integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (select 1 from public.feature_ideas where id = p_idea_id) then
    raise exception 'IDEA_NOT_FOUND';
  end if;

  select exists(
    select 1
    from public.feature_idea_votes
    where idea_id = p_idea_id and user_id = v_user_id
  ) into v_exists;

  if v_exists then
    delete from public.feature_idea_votes
    where idea_id = p_idea_id and user_id = v_user_id;

    update public.feature_ideas
    set vote_count = greatest(vote_count - 1, 0)
    where id = p_idea_id
    returning public.feature_ideas.vote_count into v_vote_count;

    return query select p_idea_id, v_vote_count, false;
  else
    insert into public.feature_idea_votes (idea_id, user_id)
    values (p_idea_id, v_user_id)
    on conflict do nothing;

    update public.feature_ideas
    set vote_count = vote_count + 1
    where id = p_idea_id
    returning public.feature_ideas.vote_count into v_vote_count;

    return query select p_idea_id, v_vote_count, true;
  end if;
end;
$$;

create or replace function public.submit_feature_idea(
  p_title text,
  p_description text default null
)
returns table (
  idea_id uuid,
  title text,
  description text,
  vote_count integer,
  status text,
  created_at timestamptz,
  source text,
  merged boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_normalized text;
  v_slug_base text;
  v_slug text;
  v_existing public.feature_ideas%rowtype;
  v_created public.feature_ideas%rowtype;
  v_voted boolean;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_title = '' then
    raise exception 'TITLE_REQUIRED';
  end if;

  v_normalized := regexp_replace(lower(v_title), '\s+', ' ', 'g');

  select *
  into v_existing
  from public.feature_ideas
  where normalized_title = v_normalized
  limit 1;

  if found then
    select exists(
      select 1
      from public.feature_idea_votes
      where idea_id = v_existing.id and user_id = v_user_id
    ) into v_voted;

    if not v_voted then
      insert into public.feature_idea_votes (idea_id, user_id)
      values (v_existing.id, v_user_id)
      on conflict do nothing;

      update public.feature_ideas
      set vote_count = vote_count + 1
      where id = v_existing.id
      returning * into v_existing;
    end if;

    return query
    select
      v_existing.id,
      v_existing.title,
      v_existing.description,
      v_existing.vote_count,
      v_existing.status,
      v_existing.created_at,
      v_existing.source,
      true;
    return;
  end if;

  v_slug_base := regexp_replace(v_normalized, '[^a-z0-9 ]', '', 'g');
  v_slug_base := regexp_replace(v_slug_base, '\s+', '-', 'g');
  v_slug := nullif(v_slug_base, '');
  if v_slug is null then
    v_slug := 'idea-' || substring(replace(uuid_generate_v4()::text, '-', '') from 1 for 8);
  end if;

  insert into public.feature_ideas (
    slug,
    title,
    description,
    status,
    vote_count,
    source,
    created_by
  )
  values (
    v_slug || '-' || substring(replace(uuid_generate_v4()::text, '-', '') from 1 for 6),
    v_title,
    coalesce(nullif(v_description, ''), 'Suggested by the Listorix community.'),
    'open',
    1,
    'user',
    v_user_id
  )
  returning * into v_created;

  insert into public.feature_idea_votes (idea_id, user_id)
  values (v_created.id, v_user_id)
  on conflict do nothing;

  return query
  select
    v_created.id,
    v_created.title,
    v_created.description,
    v_created.vote_count,
    v_created.status,
    v_created.created_at,
    v_created.source,
    false;
end;
$$;

grant usage on schema public to anon, authenticated;
grant select on public.feature_ideas to anon, authenticated;
grant select on public.feature_idea_votes to authenticated;
grant execute on function public.toggle_feature_idea_vote(uuid) to authenticated;
grant execute on function public.submit_feature_idea(text, text) to authenticated;

insert into public.feature_ideas (slug, title, description, status, vote_count, source)
values
  (
    'smarter-insights',
    'Smarter list insights',
    'Show stronger patterns, savings signals, and category trends instead of generic empty states.',
    'planned',
    231,
    'seeded'
  ),
  (
    'multi-store-compare',
    'Compare stores for the same list',
    'See which store may be cheaper for the items you are already planning to buy.',
    'open',
    188,
    'seeded'
  ),
  (
    'price-drop-alerts',
    'Price drop alerts',
    'Get notified when a frequently bought item drops below your usual price.',
    'open',
    166,
    'seeded'
  ),
  (
    'receipt-history-link',
    'Link scanned bills to history',
    'Review scanned bills later with a clearer trip summary and item-level breakdown.',
    'open',
    144,
    'seeded'
  ),
  (
    'shared-family-notes',
    'Shared notes for family lists',
    'Add quick notes like brands, quantity hints, or store reminders for family members.',
    'in_progress',
    121,
    'seeded'
  )
on conflict (slug) do update
set
  title = excluded.title,
  description = excluded.description,
  status = excluded.status,
  vote_count = excluded.vote_count,
  source = excluded.source;
