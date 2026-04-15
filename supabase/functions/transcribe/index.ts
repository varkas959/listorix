/**
 * Supabase Edge Function: transcribe
 *
 * Proxies audio to OpenAI Whisper /v1/audio/translations.
 * - All languages → English output in one step (Whisper auto-detects + translates).
 * - OPENAI_API_KEY lives as a Supabase secret — never in the client bundle.
 * - JWT is verified manually using the service-role client (handles ES256).
 * - Rate-limited to DAILY_LIMIT per user per day.
 *
 * Deploy:
 *   supabase functions deploy transcribe --project-ref <ref> --no-verify-jwt
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DAILY_LIMIT = 20;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // ── Verify user JWT ───────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace('Bearer ', '').trim();
  if (!jwt) return json({ error: 'Missing Authorization header' }, 401);

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
  if (authError || !user) {
    console.warn('[transcribe] Auth failed:', authError?.message);
    return json({ error: 'Unauthorized' }, 401);
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count, error: countError } = await supabaseAdmin
    .from('voice_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', todayStart.toISOString())
    .eq('status', 'ok');

  if (countError) console.error('[transcribe] Usage count failed:', countError.message);

  const usedToday = count ?? 0;

  if (!countError && usedToday >= DAILY_LIMIT) {
    await supabaseAdmin.from('voice_usage').insert({ user_id: user.id, status: 'rate_limited' });
    return json({ error: 'Daily voice limit reached. Try again tomorrow.', code: 'RATE_LIMITED', remaining: 0 }, 429);
  }

  // ── Parse FormData ────────────────────────────────────────────────────────
  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return json({ error: 'Invalid form data' }, 400);
  }

  const audio = incoming.get('audio');
  if (!audio || !(audio instanceof File)) {
    return json({ error: 'Missing audio field (expected File)' }, 400);
  }

  const durationMs = parseInt(incoming.get('duration_ms')?.toString() ?? '0', 10) || null;
  const sourceLang = incoming.get('source_lang')?.toString() || null;

  // Reject recordings over 25 seconds
  if (durationMs && durationMs > 25_000) {
    return json({ error: 'Recording too long. Say your items in under 25 seconds.', code: 'TOO_LONG' }, 400);
  }

  // ── Call OpenAI Whisper /translations ─────────────────────────────────────
  // /translations always returns English regardless of input language.
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    console.error('[transcribe] OPENAI_API_KEY secret is not set');
    return json({ error: 'Server configuration error' }, 503);
  }

  const whisperForm = new FormData();
  whisperForm.append('file', audio, 'audio.m4a');
  whisperForm.append('model', 'whisper-1');
  whisperForm.append(
    'prompt',
    'Grocery items with quantities. Examples: 1 kg rice, 2 litres milk, 500 grams tomatoes, paneer, atta, dal.',
  );

  let whisperRes: Response;
  try {
    whisperRes = await fetch('https://api.openai.com/v1/audio/translations', {
      method:  'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body:    whisperForm,
      signal:  AbortSignal.timeout(25_000),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    console.error('[transcribe] Whisper error:', isTimeout ? 'timed out' : err);
    await supabaseAdmin.from('voice_usage').insert({
      user_id: user.id, duration_ms: durationMs, source_lang: sourceLang, status: 'error',
    });
    return json({
      error: isTimeout ? 'Voice service timed out — please try again.' : 'Could not reach voice service',
    }, 502);
  }

  if (!whisperRes.ok) {
    const errBody = await whisperRes.text().catch(() => '');
    console.error(`[transcribe] Whisper ${whisperRes.status}:`, errBody);
    await supabaseAdmin.from('voice_usage').insert({
      user_id: user.id, duration_ms: durationMs, source_lang: sourceLang, status: 'error',
    });
    if (whisperRes.status === 429) {
      return json({ error: 'Voice service busy — try again in a moment.', code: 'RATE_LIMIT' }, 429);
    }
    return json({ error: `Whisper error ${whisperRes.status}` }, 502);
  }

  const whisperData = await whisperRes.json() as { text: string };
  const text = whisperData.text?.trim() ?? '';
  console.log(`[transcribe] Whisper OK — lang:${sourceLang} — "${text.substring(0, 80)}"`);

  // Reject suspiciously long transcripts (songs, speeches)
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount > 60) {
    await supabaseAdmin.from('voice_usage').insert({
      user_id: user.id, duration_ms: durationMs, source_lang: sourceLang, status: 'rejected',
    });
    return json({ error: 'Please say only your grocery items.', code: 'TOO_LONG' }, 400);
  }

  // ── Log usage ─────────────────────────────────────────────────────────────
  await supabaseAdmin.from('voice_usage').insert({
    user_id: user.id, duration_ms: durationMs, source_lang: sourceLang, status: 'ok',
  });

  const remaining = DAILY_LIMIT - (usedToday + 1);
  console.log(`[transcribe] Done — ${remaining} left today for user ${user.id}`);

  return json({ text, remaining });
});
