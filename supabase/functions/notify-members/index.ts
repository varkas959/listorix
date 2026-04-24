/**
 * notify-members — Send push notification to all household members when
 * someone adds a new item to the shared group list.
 *
 * Flow:
 *  1. Verify caller JWT → get actor user_id + display_name
 *  2a. NEW: if group_id provided → query group_members for all recipients
 *  2b. LEGACY: if list_id provided → query list owner + list_members
 *  3. Exclude the actor (don't notify yourself)
 *  4. Fetch Expo push tokens from push_tokens table
 *  5. Send push via Expo Push API (free, no key needed)
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL           = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL          = 'https://exp.host/--/api/v2/push/send';
const PREVIEW_LIMIT          = 3;

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

interface DbItemPreviewRow {
  id: string;
  name: string;
  checked: boolean;
}

function withoutNewlyAddedItem(
  pendingItems: DbItemPreviewRow[],
  itemName: string,
  itemId?: string | null,
): DbItemPreviewRow[] {
  if (itemId) {
    return pendingItems.filter((item) => item.id !== itemId);
  }

  let excluded = false;
  return pendingItems.filter((item) => {
    if (!excluded && item.name.trim().toLowerCase() === itemName.trim().toLowerCase()) {
      excluded = true;
      return false;
    }
    return true;
  });
}

function buildPreviewBody(
  actorName: string,
  itemName: string,
  pendingItems: DbItemPreviewRow[],
  itemId?: string | null,
): string {
  const nextItems = withoutNewlyAddedItem(pendingItems, itemName, itemId);
  const previewNames = nextItems.slice(0, PREVIEW_LIMIT).map((item) => item.name);
  const remainingCount = Math.max(0, nextItems.length - previewNames.length);

  if (previewNames.length === 0) {
    return `${actorName} added ${itemName}.`;
  }

  const moreSuffix = remainingCount > 0 ? ` +${remainingCount} more` : '';
  return `${actorName} added ${itemName}. Next: ${previewNames.join(', ')}${moreSuffix}`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    // ── 1. Verify JWT ────────────────────────────────────────────────────────
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const { data: { user: actor }, error: authErr } = await supabaseAdmin.auth.getUser(jwt);
    if (authErr || !actor) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
    }

    const { group_id, list_id, item_name, item_id } = await req.json();
    if (!item_name) {
      return new Response(JSON.stringify({ error: 'Missing item_name' }), { status: 400, headers: cors });
    }

    // ── 2. Get actor display name ────────────────────────────────────────────
    const { data: actorProfile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', actor.id)
      .single();

    const actorName = actorProfile?.display_name ?? actor.email?.split('@')[0] ?? 'Someone';

    // ── 3. Collect recipient user IDs ────────────────────────────────────────
    const recipientIds = new Set<string>();

    if (group_id) {
      // NEW PATH: send to all group members
      const { data: members } = await supabaseAdmin
        .from('group_members')
        .select('user_id')
        .eq('group_id', group_id);

      for (const m of members ?? []) recipientIds.add(m.user_id);

    } else if (list_id) {
      // LEGACY PATH: list owner + list_members (keep for backward compat)
      const { data: list } = await supabaseAdmin
        .from('lists')
        .select('user_id')
        .eq('id', list_id)
        .single();

      if (!list) {
        return new Response(JSON.stringify({ error: 'List not found' }), { status: 404, headers: cors });
      }

      recipientIds.add(list.user_id);

      const { data: members } = await supabaseAdmin
        .from('list_members')
        .select('user_id')
        .eq('list_id', list_id);

      for (const m of members ?? []) recipientIds.add(m.user_id);

    } else {
      return new Response(JSON.stringify({ error: 'Missing group_id or list_id' }), { status: 400, headers: cors });
    }

    // Don't notify the actor themselves
    recipientIds.delete(actor.id);

    if (recipientIds.size === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: cors });
    }

    // ── 4. Get push tokens ───────────────────────────────────────────────────
    const { data: tokenRows } = await supabaseAdmin
      .from('push_tokens')
      .select('token')
      .in('user_id', [...recipientIds]);

    const tokens = (tokenRows ?? []).map(r => r.token).filter(Boolean);
    if (tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: cors });
    }

    let activeListId = list_id ?? null;
    if (!activeListId && group_id) {
      const { data: activeList } = await supabaseAdmin
        .from('lists')
        .select('id')
        .eq('group_id', group_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      activeListId = activeList?.id ?? null;
    }

    let pendingItems: DbItemPreviewRow[] = [];
    if (activeListId) {
      const { data: itemRows } = await supabaseAdmin
        .from('items')
        .select('id, name, checked')
        .eq('list_id', activeListId)
        .eq('checked', false)
        .order('created_at', { ascending: true })
        .returns<DbItemPreviewRow[]>();

      pendingItems = itemRows ?? [];
    }

    const nextItems = withoutNewlyAddedItem(pendingItems, item_name, item_id);
    const previewNames = nextItems.slice(0, PREVIEW_LIMIT).map((item) => item.name);
    const remainingCount = Math.max(0, nextItems.length - previewNames.length);
    const body = buildPreviewBody(actorName, item_name, pendingItems, item_id);

    // ── 5. Send Expo push notifications ─────────────────────────────────────
    const messages = tokens.map(to => ({
      to,
      title: '🛒 New item added',
      ['title']: 'Family list updated',
      body,
      categoryId: 'family-list-update',
      data:  {
        group_id,
        list_id: activeListId ?? list_id ?? null,
        item_id: item_id ?? null,
        item_name,
        preview_names: previewNames,
        remaining_count: remainingCount,
      },
      sound: 'default',
    }));

    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify(messages),
    });

    const expoJson = await expoResponse.json().catch(() => null);
    console.log('[notify-members] send attempt', JSON.stringify({
      actor_id: actor.id,
      group_id: group_id ?? null,
      list_id: activeListId ?? list_id ?? null,
      preview_names: previewNames,
      remaining_count: remainingCount,
      recipient_count: recipientIds.size,
      token_count: tokens.length,
      expo_status: expoResponse.status,
      expo_response: expoJson,
    }));

    if (!expoResponse.ok) {
      console.error('[notify-members] expo push failed', expoResponse.status, expoJson);
      return new Response(JSON.stringify({ error: 'Expo push failed', details: expoJson }), {
        status: 502,
        headers: cors,
      });
    }

    return new Response(JSON.stringify({ sent: tokens.length, tickets: expoJson }), { headers: cors });

  } catch (err) {
    console.error('[notify-members]', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: cors });
  }
});
