-- cleanup_active_lists.sql
--
-- Purpose:
-- Normalize duplicate active lists so each user has at most one active personal
-- list and each household has at most one active family list.
--
-- Safe behavior:
-- - Does NOT delete any rows.
-- - Keeps the newest active list in each partition.
-- - Marks older duplicate active lists as inactive.
-- - Leaves historical/completed lists untouched.
--
-- Run in Supabase SQL Editor after taking a quick backup/export if you want
-- extra safety.

begin;

-- 1. Inspect duplicate active personal lists.
select
  user_id,
  count(*) as active_personal_lists
from public.lists
where is_active = true
  and group_id is null
group by user_id
having count(*) > 1
order by active_personal_lists desc, user_id;

-- 2. Inspect duplicate active household lists.
select
  group_id,
  count(*) as active_group_lists
from public.lists
where is_active = true
  and group_id is not null
group by group_id
having count(*) > 1
order by active_group_lists desc, group_id;

-- 3. Keep only the newest active personal list per user.
with ranked_personal as (
  select
    id,
    row_number() over (
      partition by user_id
      order by created_at desc, id desc
    ) as rn
  from public.lists
  where is_active = true
    and group_id is null
)
update public.lists l
set is_active = false
from ranked_personal rp
where l.id = rp.id
  and rp.rn > 1;

-- 4. Keep only the newest active household list per group.
with ranked_group as (
  select
    id,
    row_number() over (
      partition by group_id
      order by created_at desc, id desc
    ) as rn
  from public.lists
  where is_active = true
    and group_id is not null
)
update public.lists l
set is_active = false
from ranked_group rg
where l.id = rg.id
  and rg.rn > 1;

commit;
