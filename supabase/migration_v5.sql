-- migration_v5.sql -- Household exit, admin removal, and historical trip access
--
-- Run in: Supabase -> SQL Editor

create table if not exists public.list_participants (
  list_id uuid not null references public.lists(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz,
  snapshot_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create index if not exists list_participants_user_idx
  on public.list_participants(user_id, snapshot_at desc);

create index if not exists list_participants_group_idx
  on public.list_participants(group_id);

alter table public.list_participants enable row level security;

create policy "users can read own list participants"
  on public.list_participants for select
  to authenticated
  using (auth.uid() = user_id);

grant select on public.list_participants to authenticated;

create policy "former members can read historical group lists"
  on public.lists for select
  to authenticated
  using (
    completed_at is not null
    and exists (
      select 1
      from public.list_participants lp
      where lp.list_id = public.lists.id
        and lp.user_id = auth.uid()
    )
  );

create policy "former members can read historical group items"
  on public.items for select
  to authenticated
  using (
    exists (
      select 1
      from public.list_participants lp
      where lp.list_id = public.items.list_id
        and lp.user_id = auth.uid()
    )
  );

create or replace function public.snapshot_group_list_participants(
  p_list_id uuid,
  p_group_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
  ) then
    raise exception 'NOT_GROUP_MEMBER';
  end if;

  if not exists (
    select 1
    from public.lists l
    where l.id = p_list_id
      and l.group_id = p_group_id
  ) then
    raise exception 'LIST_NOT_IN_GROUP';
  end if;

  insert into public.list_participants (list_id, group_id, user_id, role, joined_at)
  select
    p_list_id,
    p_group_id,
    gm.user_id,
    gm.role,
    gm.joined_at
  from public.group_members gm
  where gm.group_id = p_group_id
  on conflict (list_id, user_id) do update
  set
    group_id = excluded.group_id,
    role = excluded.role,
    joined_at = excluded.joined_at;
end;
$$;

create or replace function public.leave_household(
  p_group_id uuid
)
returns table (
  removed_user_id uuid,
  promoted_admin_user_id uuid,
  household_deleted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_role text;
  v_promote_user_id uuid;
  v_member_count integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select gm.role
  into v_current_role
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.user_id = v_user_id;

  if v_current_role is null then
    raise exception 'NOT_GROUP_MEMBER';
  end if;

  if v_current_role = 'admin' then
    select gm.user_id
    into v_promote_user_id
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id <> v_user_id
    order by gm.joined_at asc, gm.user_id asc
    limit 1;

    if v_promote_user_id is not null then
      update public.group_members
      set role = 'admin'
      where group_id = p_group_id
        and user_id = v_promote_user_id;

      update public.groups
      set created_by = v_promote_user_id
      where id = p_group_id;
    end if;
  end if;

  delete from public.group_members
  where group_id = p_group_id
    and user_id = v_user_id;

  update public.profiles
  set group_id = null
  where id = v_user_id
    and group_id = p_group_id;

  select count(*)
  into v_member_count
  from public.group_members
  where group_id = p_group_id;

  if v_member_count = 0 then
    delete from public.items
    where list_id in (
      select id
      from public.lists
      where group_id = p_group_id
        and completed_at is null
    );

    delete from public.lists
    where group_id = p_group_id
      and completed_at is null;

    delete from public.groups
    where id = p_group_id;

    return query
    select v_user_id, null::uuid, true;
  end if;

  return query
  select v_user_id, v_promote_user_id, false;
end;
$$;

create or replace function public.remove_household_member(
  p_group_id uuid,
  p_target_user_id uuid
)
returns table (
  removed_user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_role text;
begin
  if v_actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_target_user_id = v_actor_user_id then
    raise exception 'USE_LEAVE_FLOW';
  end if;

  select gm.role
  into v_actor_role
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.user_id = v_actor_user_id;

  if v_actor_role <> 'admin' then
    raise exception 'NOT_ALLOWED';
  end if;

  if not exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_target_user_id
  ) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  delete from public.group_members
  where group_id = p_group_id
    and user_id = p_target_user_id;

  update public.profiles
  set group_id = null
  where id = p_target_user_id
    and group_id = p_group_id;

  return query
  select p_target_user_id;
end;
$$;

grant execute on function public.snapshot_group_list_participants(uuid, uuid) to authenticated;
grant execute on function public.leave_household(uuid) to authenticated;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;
