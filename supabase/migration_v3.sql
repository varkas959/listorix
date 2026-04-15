-- ─────────────────────────────────────────────────────────────────────────────
-- migration_v3.sql — Household Groups (permanent family sharing)
--
-- Run in: Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Groups table ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.groups (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL DEFAULT 'My Household',
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Group members table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.group_members (
  group_id  UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member',   -- 'admin' | 'member'
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

-- ── Extend existing tables ────────────────────────────────────────────────────

-- Stamp group's active list
ALTER TABLE public.lists
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;

-- Quick group lookup on profiles (avoids JOIN on every app load)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS groups_invite_code_idx
  ON public.groups(invite_code);

CREATE INDEX IF NOT EXISTS group_members_user_idx
  ON public.group_members(user_id);

CREATE INDEX IF NOT EXISTS group_members_group_idx
  ON public.group_members(group_id);

CREATE INDEX IF NOT EXISTS lists_group_idx
  ON public.lists(group_id) WHERE group_id IS NOT NULL;

-- ── RLS — groups ──────────────────────────────────────────────────────────────

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read groups (needed for invite code lookup)
CREATE POLICY "authenticated users can read groups"
  ON public.groups FOR SELECT
  TO authenticated
  USING (true);

-- Any authenticated user can create a group
CREATE POLICY "authenticated users can insert groups"
  ON public.groups FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Only the creator can update or delete their group
CREATE POLICY "group creator can update"
  ON public.groups FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "group creator can delete"
  ON public.groups FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- ── RLS — group_members ───────────────────────────────────────────────────────

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can join a group (insert own row)
CREATE POLICY "users can join groups"
  ON public.group_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Group members can view the full roster for their group
CREATE POLICY "group members can view roster"
  ON public.group_members FOR SELECT
  TO authenticated
  USING (
    group_id IN (
      SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = auth.uid()
    )
  );

-- Users can remove themselves from a group
CREATE POLICY "users can leave groups"
  ON public.group_members FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ── RLS — lists (add group policies on top of existing user policies) ─────────

-- Group members can SELECT the group's lists
CREATE POLICY "group members can read group lists"
  ON public.lists FOR SELECT
  TO authenticated
  USING (
    group_id IS NOT NULL
    AND group_id IN (
      SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = auth.uid()
    )
  );

-- Group members can UPDATE group lists (e.g. mark complete, set total)
CREATE POLICY "group members can update group lists"
  ON public.lists FOR UPDATE
  TO authenticated
  USING (
    group_id IS NOT NULL
    AND group_id IN (
      SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = auth.uid()
    )
  );

-- ── RLS — items (add group policies on top of existing user policies) ─────────

-- Group members can read items in group lists
CREATE POLICY "group members can read group items"
  ON public.items FOR SELECT
  TO authenticated
  USING (
    list_id IN (
      SELECT l.id FROM public.lists l
      JOIN public.group_members gm ON gm.group_id = l.group_id
      WHERE gm.user_id = auth.uid()
        AND l.group_id IS NOT NULL
    )
  );

-- Group members can insert items into group lists
CREATE POLICY "group members can insert group items"
  ON public.items FOR INSERT
  TO authenticated
  WITH CHECK (
    list_id IN (
      SELECT l.id FROM public.lists l
      JOIN public.group_members gm ON gm.group_id = l.group_id
      WHERE gm.user_id = auth.uid()
        AND l.group_id IS NOT NULL
    )
  );

-- Group members can update items in group lists
CREATE POLICY "group members can update group items"
  ON public.items FOR UPDATE
  TO authenticated
  USING (
    list_id IN (
      SELECT l.id FROM public.lists l
      JOIN public.group_members gm ON gm.group_id = l.group_id
      WHERE gm.user_id = auth.uid()
        AND l.group_id IS NOT NULL
    )
  );

-- Group members can delete items from group lists
CREATE POLICY "group members can delete group items"
  ON public.items FOR DELETE
  TO authenticated
  USING (
    list_id IN (
      SELECT l.id FROM public.lists l
      JOIN public.group_members gm ON gm.group_id = l.group_id
      WHERE gm.user_id = auth.uid()
        AND l.group_id IS NOT NULL
    )
  );
