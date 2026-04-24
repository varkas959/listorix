-- migration_v6.sql -- Keep one live household membership per user
--
-- Run in: Supabase -> SQL Editor

create or replace function public.prepare_household_membership(
  p_target_group_id uuid
)
returns table (
  target_group_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_target_group_id is null then
    raise exception 'TARGET_GROUP_REQUIRED';
  end if;

  -- Remove any stale household memberships from older homes.
  delete from public.group_members gm
  where gm.user_id = v_user_id
    and gm.group_id <> p_target_group_id;

  update public.profiles
  set group_id = p_target_group_id
  where id = v_user_id;

  return query
  select p_target_group_id;
end;
$$;

grant execute on function public.prepare_household_membership(uuid) to authenticated;
