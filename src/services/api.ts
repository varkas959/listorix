/**
 * api.ts — All Supabase CRUD operations.
 *
 * Design rules:
 * - Every function is standalone and takes explicit parameters.
 * - Most errors are caught and warned so callers stay offline-first.
 * - Household setup calls may throw when the backend schema is incomplete.
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

interface DbParticipantRow {
  list_id: string;
}

interface DbListIdRow {
  id:         string;
  created_at?: string | null;
}

type SupabaseLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
} | null | undefined;

export class HouseholdSetupError extends Error {
  kind: 'schema_missing' | 'request_failed';

  constructor(kind: 'schema_missing' | 'request_failed', message: string) {
    super(message);
    this.name = 'HouseholdSetupError';
    this.kind = kind;
  }
}

function formatSupabaseError(error: SupabaseLikeError): string {
  if (!error) return 'Unknown Supabase error';
  return JSON.stringify({
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

function isHouseholdSchemaError(error: SupabaseLikeError): boolean {
  const code = error?.code ?? '';
  const haystack = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase();

  return (
    code === '42P01' || // relation does not exist
    code === '42703' || // column does not exist
    haystack.includes('relation') && haystack.includes('does not exist') ||
    haystack.includes('column') && haystack.includes('does not exist') ||
    haystack.includes('groups') && haystack.includes('does not exist') ||
    haystack.includes('group_members') && haystack.includes('does not exist') ||
    haystack.includes('group_id') && haystack.includes('does not exist')
  );
}

async function assertHouseholdSchemaReady(): Promise<void> {
  const probes = await Promise.all([
    supabase.from('groups').select('id').limit(1),
    supabase.from('group_members').select('group_id').limit(1),
    supabase.from('profiles').select('group_id').limit(1),
    supabase.from('lists').select('group_id').limit(1),
  ]);

  const failingProbe = probes.find(result => result.error);
  if (!failingProbe?.error) return;

  if (isHouseholdSchemaError(failingProbe.error)) {
    throw new HouseholdSetupError(
      'schema_missing',
      `Household schema is incomplete: ${formatSupabaseError(failingProbe.error)}`
    );
  }

  throw new HouseholdSetupError(
    'request_failed',
    `Household schema probe failed: ${formatSupabaseError(failingProbe.error)}`
  );
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
  const { data: existingRows, error: selErr } = await supabase
    .from('lists')
    .select('id, created_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('group_id', null)   // personal lists only — exclude group lists
    .order('created_at', { ascending: false })
    .limit(1)
    .returns<DbListIdRow[]>();

  if (selErr) {
    console.warn('[api] getOrCreateActiveListId SELECT error:', selErr.code, selErr.message, selErr.details);
  }
  if (existingRows?.[0]?.id) return existingRows[0].id;

  const { data: created, error } = await supabase
    .from('lists')
    .insert({ user_id: userId, is_active: true })
    .select('id')
    .single();

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
    const { data: listRows, error: listError } = await supabase
      .from('lists')
      .select('id, created_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('group_id', null)   // personal lists only
      .order('created_at', { ascending: false })
      .limit(1)
      .returns<DbListIdRow[]>();

    if (listError) {
      console.warn('[api] getActiveList list query:', listError.message);
      return null;
    }

    const list = listRows?.[0];

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
  if (groupId) {
    const { error: snapshotError } = await supabase.rpc('snapshot_group_list_participants', {
      p_list_id: listId,
      p_group_id: groupId,
    });

    if (snapshotError) {
      console.warn('[api] snapshot_group_list_participants:', snapshotError.message);
    }
  }

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
  const [personalResult, participantResult] = await Promise.all([
    supabase
      .from('lists')
      .select('id, completed_at, total')
      .eq('user_id', userId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(50),
    supabase
      .from('list_participants')
      .select('list_id')
      .eq('user_id', userId)
      .order('snapshot_at', { ascending: false })
      .limit(50)
      .returns<DbParticipantRow[]>(),
  ]);

  if (personalResult.error) {
    console.warn('[api] getTripHistory personal:', personalResult.error.message);
  }
  if (participantResult.error) {
    console.warn('[api] getTripHistory participants:', participantResult.error.message);
  }

  const participantIds = [...new Set((participantResult.data ?? []).map(row => row.list_id))];
  const participantListsResult = participantIds.length > 0
    ? await supabase
        .from('lists')
        .select('id, completed_at, total')
        .in('id', participantIds)
        .not('completed_at', 'is', null)
    : { data: [], error: null as SupabaseLikeError };

  if (participantListsResult.error) {
    console.warn('[api] getTripHistory participant lists:', participantListsResult.error.message);
  }

  const allRows = [
    ...(personalResult.data ?? []),
    ...(participantListsResult.data ?? []),
  ] as { id: string; completed_at: string; total: number | null }[];

  const uniqueRows = new Map<string, { id: string; completed_at: string; total: number | null }>();
  for (const row of allRows) {
    uniqueRows.set(row.id, row);
  }

  return [...uniqueRows.values()]
    .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
    .slice(0, 50)
    .map(row => ({
      id:          row.id,
      completedAt: new Date(row.completed_at).getTime(),
      total:       row.total ?? 0,
      itemCount:   0,
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
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!accessToken || !anonKey) return;

    const { error } = await supabase.functions.invoke('notify-members', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
      body: { list_id: listId, item_name: itemName },
    });
    if (error) {
      console.warn('[api] notifyMembersOfNewItem:', error.message);
    }
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

async function prepareHouseholdMembership(targetGroupId: string): Promise<void> {
  const { error } = await supabase.rpc('prepare_household_membership', {
    p_target_group_id: targetGroupId,
  });

  if (error) {
    console.warn('[api] prepareHouseholdMembership:', error.message);
    throw new Error('prepare_household_membership_failed');
  }
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
  await assertHouseholdSchemaReady();
  const invite_code = generateGroupCode();

  const { data: group, error } = await supabase
    .from('groups')
    .insert({ name: name ?? 'My Household', created_by: userId, invite_code })
    .select('id, name, invite_code, created_by')
    .single();

  if (error || !group) {
    const details = formatSupabaseError(error);
    console.error('[api] createGroup INSERT error:', details);
    throw new HouseholdSetupError(
      isHouseholdSchemaError(error) ? 'schema_missing' : 'request_failed',
      `Could not create group: ${details}`
    );
  }

  // Insert creator as admin
  const { error: memberErr } = await supabase
    .from('group_members')
    .insert({ group_id: group.id, user_id: userId, role: 'admin' });
  if (memberErr) {
    console.error('[api] createGroup member INSERT error:', formatSupabaseError(memberErr));
    await supabase.from('groups').delete().eq('id', group.id);
    throw new HouseholdSetupError(
      isHouseholdSchemaError(memberErr) ? 'schema_missing' : 'request_failed',
      `Could not create group membership: ${formatSupabaseError(memberErr)}`
    );
  }

  try {
    await prepareHouseholdMembership(group.id);
  } catch (error) {
    console.error('[api] createGroup prepare membership error:', error);
    throw new HouseholdSetupError(
      'request_failed',
      'Could not normalize household membership for the new household.'
    );
  }

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

  await prepareHouseholdMembership(group.id);

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
  const { error } = await supabase.rpc('leave_household', {
    p_group_id: groupId,
  });

  if (error) {
    console.warn('[api] leaveGroup:', error.message);
    throw new Error('leave_group_failed');
  }
}

export async function removeGroupMember(
  groupId: string,
  targetUserId: string,
): Promise<void> {
  const { error } = await supabase.rpc('remove_household_member', {
    p_group_id: groupId,
    p_target_user_id: targetUserId,
  });

  if (error) {
    console.warn('[api] removeGroupMember:', error.message);
    throw new Error('remove_group_member_failed');
  }
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

  if (error) {
    console.warn('[api] getGroupActiveListId:', error.message);
    if (isHouseholdSchemaError(error)) {
      throw new HouseholdSetupError(
        'schema_missing',
        `Could not read household list: ${formatSupabaseError(error)}`
      );
    }
  }
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

  if (error || !created) {
    throw new HouseholdSetupError(
      isHouseholdSchemaError(error) ? 'schema_missing' : 'request_failed',
      '[api] Failed to create group list: ' + formatSupabaseError(error)
    );
  }
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
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!accessToken || !anonKey) return;

    const { error } = await supabase.functions.invoke('notify-members', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
      body: {
        group_id: groupId,
        list_id: listId,
        item_name: itemName,
        item_id: itemId ?? null,
      },
    });
    if (error) {
      console.warn('[api] notifyGroupMembers:', error.message);
    }
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
