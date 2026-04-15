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

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

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

    const { group_id, list_id, item_name } = await req.json();
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

    // ── 5. Send Expo push notifications ─────────────────────────────────────
    const messages = tokens.map(to => ({
      to,
      title: '🛒 New item added',
      body:  `${actorName} added "${item_name}" to the list`,
      data:  { group_id, list_id },
      sound: 'default',
    }));

    await fetch(EXPO_PUSH_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify(messages),
    });

    return new Response(JSON.stringify({ sent: tokens.length }), { headers: cors });

  } catch (err) {
    console.error('[notify-members]', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: cors });
  }
});
