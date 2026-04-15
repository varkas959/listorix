-- ─────────────────────────────────────────────────────────────────────────────
-- Listorix — Migration v2
-- Run this in Supabase → SQL Editor (one-time, safe to re-run)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add missing `count` column to items (was causing items to not sync to remote)
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS count INTEGER NOT NULL DEFAULT 1;

-- 2. Add `share_code` column to lists (needed for family sharing)
ALTER TABLE public.lists
  ADD COLUMN IF NOT EXISTS share_code TEXT UNIQUE;

-- 3. Create list_members table (who has joined which shared list)
CREATE TABLE IF NOT EXISTS public.list_members (
  list_id   UUID NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'editor',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (list_id, user_id)
);

ALTER TABLE public.list_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own memberships" ON public.list_members;
CREATE POLICY "own memberships"
  ON public.list_members FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.list_members TO authenticated;

-- 4. Update items RLS — allow members of a shared list to read/write items
DROP POLICY IF EXISTS "own items" ON public.items;
DROP POLICY IF EXISTS "own or shared items" ON public.items;

CREATE POLICY "own or shared items"
  ON public.items FOR ALL
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.list_members lm
      WHERE lm.list_id = items.list_id
        AND lm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.list_members lm
      WHERE lm.list_id = items.list_id
        AND lm.user_id = auth.uid()
    )
  );

-- 5. Update lists RLS — members can read shared lists (to look up by share_code)
DROP POLICY IF EXISTS "own lists" ON public.lists;
DROP POLICY IF EXISTS "own or shared lists" ON public.lists;

-- Read: own lists + lists you're a member of + lists with a share_code (for join lookup)
CREATE POLICY "lists select"
  ON public.lists FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.list_members lm
      WHERE lm.list_id = lists.id AND lm.user_id = auth.uid()
    ) OR
    share_code IS NOT NULL   -- allow anyone to look up a list by code to join
  );

CREATE POLICY "lists insert"
  ON public.lists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "lists update"
  ON public.lists FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "lists delete"
  ON public.lists FOR DELETE
  USING (auth.uid() = user_id);

-- 6. Create push_tokens table (for family notifications)
CREATE TABLE IF NOT EXISTS public.push_tokens (
  user_id    UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own push token" ON public.push_tokens;
CREATE POLICY "own push token"
  ON public.push_tokens FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;

-- Done — migration complete.
