/**
 * api.ts — All Supabase CRUD operations.
 *
 * Design rules:
 * - Every function is standalone and takes explicit parameters.
 * - Errors are caught and warned, never thrown — callers stay offline-first.
 * - Returns typed data or null/empty on failure.
 */

import { supabase } from './supabase';
import type { GroceryItem, GroupMember, Profile } from '../types';

// ── Internal DB row shapes ────────────────────────────────────────────────────

interface DbItem {
  id:         string;
  list_id:    string;
  user_id:    string;
  name:       string;
  qty:        string;
  count:      number;
  price:      number;
  category:   string;
  checked:    boolean;
  created_at: string;
}

interface DbPriceHistory {
  item_name:  string;
  last_price: number;
}

interface DbList {
  id:           string;
  completed_at: string | null;
  total:        number | null;
  items:        { category: string }[];
}

// ── Profile ───────────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, store_preference, budget, onboarded')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return {
    id:              data.id,
    displayName:     data.display_name,
    storePreference: data.store_preference,
    budget:          data.budget,
    onboarded:       data.onboarded,
  };
}

export async function updateProfile(
  userId: string,
  updates: Partial<Pick<Profile, 'displayName' | 'storePreference' | 'budget' | 'onboarded'>>
): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.displayName     !== undefined) dbUpdates['display_name']      = updates.displayName;
  if (updates.storePreference !== undefined) dbUpdates['store_preference']  = updates.storePreference;
  if (updates.budget          !== undefined) dbUpdates['budget']             = updates.budget;
  if (updates.onboarded       !== undefined) dbUpdates['onboarded']          = updates.onboarded;
  if (Object.keys(dbUpdates).length === 0) return;

  const { error } = await supabase.from('profiles').update(dbUpdates).eq('id', userId);
  if (error) console.warn('[api] updateProfile:', error.message);
}

// ── Active List ───────────────────────────────────────────────────────────────

/**
 * Returns the active list ID for the user, creating one if none exists.
 * This is the guaranteed entry-point before any item write.
 */
export async function getOrCreateActiveListId(userId: string): Promise<string> {
  console.log('[api] getOrCreateActiveListId for userId:', userId);
  const { data: existing, error: selErr } = await supabase
    .from('lists')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('group_id', null)   // personal lists only — exclude group lists
    .limit(1)
    .single();

  if (selErr) console.warn('[api] SELECT lists error:', selErr.code, selErr.message, selErr.details);
  if (existing?.id) { console.log('[api] found existing list:', existing.id); return existing.id; }

  console.log('[api] no active list found, creating...');
  const { data: created, error } = await supabase
    .from('lists')
    .insert({ user_id: userId, is_active: true })
    .select('id')
    .single();

  console.log('[api] INSERT result:', { created, error: error ? { code: error.code, msg: error.message, details: error.details } : null });
  if (error || !created) throw new Error('[api] Failed to create active list: ' + error?.message);
  return created.id;
}

/**
 * Fetches the active list + all its items.
 * Returns null when offline or when no list exists yet.
 */
export async function getActiveList(
  userId: string
): Promise<{ listId: string; items: GroceryItem[] } | null> {
  try {
    const { data: list } = await supabase
      .from('lists')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('group_id', null)   // personal lists only
      .limit(1)
      .single();

    if (!list) return null;

    const { data: rows } = await supabase
      .from('items')
      .select('*')
      .eq('list_id', list.id)
      .order('created_at', { ascending: true })
      .returns<DbItem[]>();

    const items: GroceryItem[] = (rows ?? []).map(row => ({
      id:        row.id,
      remoteId:  row.id,
      name:      row.name,
      qty:       row.qty,
      count:     row.count ?? 1,
      price:     row.price,
      category:  row.category,
      checked:   row.checked,
      createdAt: new Date(row.created_at).getTime(),
    }));

    return { listId: list.id, items };
  } catch {
    return null;
  }
}

// ── Item CRUD ─────────────────────────────────────────────────────────────────

/**
 * Inserts one item into the remote list.
 * Returns the Supabase UUID so it can be patched back as remoteId.
 */
export async function remoteAddItem(
  userId: string,
  listId: string,
  item: GroceryItem
): Promise<string | null> {
  const { data, error } = await supabase
    .from('items')
    .insert({
      list_id:  listId,
      user_id:  userId,
      name:     item.name,
      qty:      item.qty,
      count:    item.count ?? 1,
      price:    item.price,
      category: item.category,
      checked:  item.checked,
    })
    .select('id')
    .single();

  if (error) { console.warn('[api] remoteAddItem:', error.message); return null; }
  return data?.id ?? null;
}

export async function remoteToggleItem(remoteId: string, checked: boolean): Promise<void> {
  const { error } = await supabase
    .from('items')
    .update({ checked, updated_at: new Date().toISOString() })
    .eq('id', remoteId);
  if (error) console.warn('[api] remoteToggleItem:', error.message);
}

export async function remoteRemoveItem(remoteId: string): Promise<void> {
  const { error } = await supabase.from('items').delete().eq('id', remoteId);
  if (error) console.warn('[api] remoteRemoveItem:', error.message);
}

export async function remoteUpdateItemPrice(remoteId: string, price: number): Promise<void> {
  const { error } = await supabase
    .from('items')
    .update({ price, updated_at: new Date().toISOString() })
    .eq('id', remoteId);
  if (error) console.warn('[api] remoteUpdateItemPrice:', error.message);
}

export async function remoteUpdateItemCount(remoteId: string, count: number): Promise<void> {
  const { error } = await supabase
    .from('items')
    .update({ count, updated_at: new Date().toISOString() })
    .eq('id', remoteId);
  if (error) console.warn('[api] remoteUpdateItemCount:', error.message);
}

// ── List Completion ───────────────────────────────────────────────────────────

/**
 * Marks the current list as complete and returns a fresh active list ID.
 * Called on clearList() and when all items are checked.
 */
export async function completeActiveList(
  userId: string,
  listId: string,
  total: number,
  groupId?: string | null,
): Promise<string> {
  await supabase
    .from('lists')
    .update({
      is_active:    false,
      total,
      completed_at: new Date().toISOString(),
    })
    .eq('id', listId);

  if (groupId) {
    return getOrCreateGroupActiveListId(userId, groupId);
  }
  return getOrCreateActiveListId(userId);
}

// ── Price History ─────────────────────────────────────────────────────────────

/** Batch-upserts the full price map — one call per trip completion. */
export async function syncPriceHistory(
  userId: string,
  priceMap: Record<string, number>
): Promise<void> {
  const rows = Object.entries(priceMap).map(([item_name, last_price]) => ({
    user_id:   userId,
    item_name,
    last_price,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return;

  const { error } = await supabase
    .from('price_history')
    .upsert(rows, { onConflict: 'user_id,item_name' });
  if (error) console.warn('[api] syncPriceHistory:', error.message);
}

export async function getRemotePriceHistory(
  userId: string
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('price_history')
    .select('item_name, last_price')
    .eq('user_id', userId)
    .returns<DbPriceHistory[]>();

  if (error) { console.warn('[api] getRemotePriceHistory:', error.message); return {}; }
  const map: Record<string, number> = {};
  for (const row of data ?? []) map[row.item_name] = row.last_price;
  return map;
}

// ── Trip History ──────────────────────────────────────────────────────────────

export interface RemoteTrip {
  id:          string;
  completedAt: number;    // Unix timestamp
  total:       number;
  itemCount:   number;
  categories:  string[];
}

export async function getTripHistory(userId: string): Promise<RemoteTrip[]> {
  const { data, error } = await supabase
    .from('lists')
    .select('id, completed_at, total')
    .eq('user_id', userId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(50);

  if (error) { console.warn('[api] getTripHistory:', error.message); return []; }

  return (data ?? []).map((row: { id: string; completed_at: string; total: number | null }) => ({
    id:          row.id,
    completedAt: new Date(row.completed_at).getTime(),
    total:       row.total ?? 0,
    itemCount:   0,    // not stored in lists table — local history has the real count
    categories:  [],
  }));
}

// ── Shared Lists (F5) ─────────────────────────────────────────────────────────

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** Generates a share code for a list and saves it to Supabase. Retries once on conflict. */
export async function generateShareCode(listId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode();
    const { error } = await supabase
      .from('lists')
      .update({ share_code: code })
      .eq('id', listId);
    if (!error) return code;
    // Unique constraint violation → try a different code
    if (error.code === '23505' || error.message.includes('unique')) continue;
    // Any other error (e.g. RLS, column missing) → log and bail
    console.warn('[api] generateShareCode error:', error.code, error.message);
    return null;
  }
  return null;
}

/** Look up a list by its share code. Returns listId or null if not found. */
export async function getListByShareCode(
  code: string
): Promise<{ listId: string } | null> {
  const { data, error } = await supabase
    .from('lists')
    .select('id')
    .eq('share_code', code.toUpperCase())
    .eq('is_active', true)
    .single();

  if (error || !data) return null;
  return { listId: data.id };
}

/** Join a list as an editor member. */
export async function joinListByCode(userId: string, listId: string): Promise<void> {
  const { error } = await supabase
    .from('list_members')
    .upsert({ list_id: listId, user_id: userId, role: 'editor' },
             { onConflict: 'list_id,user_id' });
  if (error) console.warn('[api] joinListByCode:', error.message);
}

/** Notify other members of a shared list that a new item was added. Fire-and-forget. */
export async function notifyMembersOfNewItem(
  listId: string,
  itemName: string,
): Promise<void> {
  try {
    const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL      ?? '';
    const { data: { session } } = await supabase.auth.getSession();
    const jwt = session?.access_token;
    if (!jwt || !SUPABASE_URL) return;

    fetch(`${SUPABASE_URL}/functions/v1/notify-members`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ list_id: listId, item_name: itemName }),
    }).catch(() => {}); // truly fire-and-forget
  } catch { /* non-critical */ }
}

// ── Groups ────────────────────────────────────────────────────────────────────

interface DbGroup {
  id:          string;
  name:        string;
  invite_code: string;
  created_by:  string;
}

export interface GroupWithMembers {
  group:   DbGroup;
  members: GroupMember[];
}

function generateGroupCode(): string {
  // Omit O, 0, I, 1 to avoid confusion
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Create a new group and insert the creator as admin. */
export async function createGroup(
  userId: string,
  name?: string,
): Promise<GroupWithMembers | null> {
  const invite_code = generateGroupCode();

  const { data: group, error } = await supabase
    .from('groups')
    .insert({ name: name ?? 'My Household', created_by: userId, invite_code })
    .select('id, name, invite_code, created_by')
    .single();

  if (error || !group) {
    console.error('[api] createGroup INSERT error:', JSON.stringify({ code: error?.code, message: error?.message, details: error?.details, hint: error?.hint }));
    return null;
  }

  // Insert creator as admin
  const { error: memberErr } = await supabase
    .from('group_members')
    .insert({ group_id: group.id, user_id: userId, role: 'admin' });
  if (memberErr) console.error('[api] createGroup member INSERT error:', JSON.stringify({ code: memberErr.code, message: memberErr.message }));

  // Stamp profiles.group_id for quick lookup
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ group_id: group.id })
    .eq('id', userId);
  if (profileErr) console.error('[api] createGroup profile UPDATE error:', JSON.stringify({ code: profileErr.code, message: profileErr.message }));

  const members: GroupMember[] = [{
    userId, displayName: null, role: 'admin', joinedAt: Date.now(),
  }];
  return { group, members };
}

/** Look up a group by its 8-char invite code. */
export async function getGroupByInviteCode(code: string): Promise<DbGroup | null> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, invite_code, created_by')
    .eq('invite_code', code.toUpperCase())
    .single();

  if (error || !data) return null;
  return data as DbGroup;
}

/** Join a group by invite code — upserts membership row and stamps profiles.group_id. */
export async function joinGroup(
  userId: string,
  code: string,
): Promise<GroupWithMembers | null> {
  const group = await getGroupByInviteCode(code);
  if (!group) return null;

  const { error } = await supabase
    .from('group_members')
    .upsert({ group_id: group.id, user_id: userId, role: 'member' },
             { onConflict: 'group_id,user_id' });
  if (error) {
    console.error('[api] joinGroup member insert error:', JSON.stringify({ code: error.code, message: error.message }));
    throw new Error('member_insert_failed');
  }

  await supabase.from('profiles').update({ group_id: group.id }).eq('id', userId);

  return getGroupWithMembers(userId);
}

/** Fetch the group the user belongs to, with full member roster including display names. */
export async function getGroupWithMembers(
  userId: string,
): Promise<GroupWithMembers | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('group_id')
    .eq('id', userId)
    .single();

  if (!profile?.group_id) return null;

  const { data: group } = await supabase
    .from('groups')
    .select('id, name, invite_code, created_by')
    .eq('id', profile.group_id)
    .single();

  if (!group) return null;

  const { data: memberRows } = await supabase
    .from('group_members')
    .select('user_id, role, joined_at')
    .eq('group_id', group.id);

  const userIds = (memberRows ?? []).map(m => m.user_id);
  const { data: profileRows } = userIds.length > 0
    ? await supabase.from('profiles').select('id, display_name').in('id', userIds)
    : { data: [] };

  const displayMap: Record<string, string | null> = {};
  for (const p of profileRows ?? []) displayMap[p.id] = p.display_name;

  const members: GroupMember[] = (memberRows ?? []).map(m => ({
    userId:      m.user_id,
    displayName: displayMap[m.user_id] ?? null,
    role:        m.role,
    joinedAt:    new Date(m.joined_at).getTime(),
  }));

  return { group: group as DbGroup, members };
}

/** Remove a user from a group and clear their profiles.group_id. */
export async function leaveGroup(userId: string, groupId: string): Promise<void> {
  await supabase.from('group_members').delete()
    .eq('group_id', groupId).eq('user_id', userId);
  await supabase.from('profiles').update({ group_id: null }).eq('id', userId);
}

/** Find the group's current active list ID without creating a new one. Returns null if not found. */
export async function getGroupActiveListId(groupId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('lists')
    .select('id')
    .eq('group_id', groupId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();   // returns null without error when 0 rows — unlike .single()

  if (error) console.warn('[api] getGroupActiveListId:', error.message);
  return data?.id ?? null;
}

/** Get (or create) the group's current active list ID. */
export async function getOrCreateGroupActiveListId(
  userId: string,
  groupId: string,
): Promise<string> {
  const existing = await getGroupActiveListId(groupId);
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from('lists')
    .insert({ user_id: userId, group_id: groupId, is_active: true })
    .select('id')
    .single();

  if (error || !created) throw new Error('[api] Failed to create group list: ' + error?.message);
  return created.id;
}

/** Fire-and-forget: notify all group members that a new item was added. */
export async function notifyGroupMembers(
  groupId: string,
  listId: string,
  itemName: string,
  itemId?: string | null,
): Promise<void> {
  try {
    const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const { data: { session } } = await supabase.auth.getSession();
    const jwt = session?.access_token;
    if (!jwt || !SUPABASE_URL) return;

    fetch(`${SUPABASE_URL}/functions/v1/notify-members`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ group_id: groupId, list_id: listId, item_name: itemName, item_id: itemId ?? null }),
    }).catch(() => {}); // truly fire-and-forget
  } catch { /* non-critical */ }
}

/** Fetch all items for a specific list (used after joining a shared list). */
export async function getItemsForList(listId: string): Promise<GroceryItem[]> {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('list_id', listId)
    .order('created_at', { ascending: true })
    .returns<DbItem[]>();

  if (error) { console.warn('[api] getItemsForList:', error.message); return []; }

  return (data ?? []).map(row => ({
    id:        row.id,
    remoteId:  row.id,
    name:      row.name,
    qty:       row.qty,
    count:     row.count ?? 1,
    price:     row.price,
    category:  row.category,
    checked:   row.checked,
    createdAt: new Date(row.created_at).getTime(),
  }));
}
