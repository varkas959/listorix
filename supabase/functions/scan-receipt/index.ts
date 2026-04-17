/**
 * Supabase Edge Function: scan-receipt
 *
 * Accepts a base64-encoded receipt image, sends it to GPT-4o-mini Vision
 * for structured OCR, and returns parsed grocery items with prices.
 *
 * Deploy:
 *   supabase secrets set OPENAI_API_KEY=sk-...
 *   supabase functions deploy scan-receipt --project-ref <ref> --no-verify-jwt
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DAILY_LIMIT = 10;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB base64 limit

const RECEIPT_PROMPT = `You are a receipt OCR assistant for a grocery shopping app.

FIRST: Determine if the image is a grocery receipt or bill.
- If it is NOT a receipt/bill (e.g. selfie, food photo, landscape, product, random object, screenshot, etc.), return ONLY: { "not_receipt": true, "items": [] }
- If it IS a receipt/bill, extract items and return: { "items": [...] }

Return JSON: { "items": [...], "not_receipt"?: boolean }
Each item: { "name": string, "qty": string, "price": number }

Rules for receipts:
- "name" in English, even if the receipt uses another language
- "qty" with unit if visible ("1kg", "500g", "2L", "1 pack"), else "1"
- "price" as a number without the currency symbol, 0 if not visible
- Skip non-grocery items: bags, taxes, discounts, totals, subtotals, store info, dates
- Normalize abbreviations: "TOM" → "Tomatoes", "PNR" → "Paneer", "MLK" → "Milk"
- Handle common global grocery receipt formats, including supermarkets, local markets, warehouse clubs, and convenience stores
- If the receipt is unreadable, return { "items": [] }`;

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

  // ── Verify JWT ──────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace('Bearer ', '').trim();

  if (!jwt) {
    return json({ error: 'Missing Authorization header' }, 401);
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
  if (authError || !user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // ── Rate limit ──────────────────────────────────────────────────────────────
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count, error: countError } = await supabaseAdmin
    .from('scan_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', todayStart.toISOString())
    .eq('status', 'ok');

  if (countError) {
    console.error('[scan-receipt] Usage count failed:', countError.message);
  }

  const usedToday = count ?? 0;

  if (!countError && usedToday >= DAILY_LIMIT) {
    await supabaseAdmin.from('scan_usage').insert({
      user_id: user.id,
      status: 'rate_limited',
    });
    return json({
      error: 'Daily scan limit reached. Try again tomorrow.',
      code: 'RATE_LIMITED',
      remaining: 0,
    }, 429);
  }

  // ── Parse request body ──────────────────────────────────────────────────────
  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { image } = body;
  if (!image || typeof image !== 'string') {
    return json({ error: 'Missing "image" field (base64 string)' }, 400);
  }

  // Image size guard
  if (image.length > MAX_IMAGE_BYTES) {
    return json({ error: 'Image too large. Try a smaller or more compressed photo.' }, 413);
  }

  // ── Call GPT-4o-mini Vision ─────────────────────────────────────────────────
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    return json({ error: 'Server configuration error' }, 503);
  }

  let gptRes: Response;
  try {
    gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: RECEIPT_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${image}`,
                  detail: 'low',
                },
              },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    console.error('[scan-receipt] Network error reaching OpenAI:', err);
    await supabaseAdmin.from('scan_usage').insert({
      user_id: user.id, status: 'error',
    });
    return json({ error: 'Could not reach OpenAI' }, 502);
  }

  if (!gptRes.ok) {
    const errBody = await gptRes.text().catch(() => '');
    console.error(`[scan-receipt] OpenAI ${gptRes.status}:`, errBody);
    await supabaseAdmin.from('scan_usage').insert({
      user_id: user.id, status: 'error',
    });
    return json({ error: `Vision error ${gptRes.status}` }, 502);
  }

  const gptData = await gptRes.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { total_tokens: number };
  };

  const tokenCount = gptData.usage?.total_tokens ?? null;

  // Parse GPT response
  let items: Array<{ name: string; qty: string; price: number }> = [];
  try {
    const parsed = JSON.parse(gptData.choices[0].message.content);

    // If AI detected the image is not a receipt, reject without charging a credit
    if (parsed.not_receipt === true) {
      console.log(`[scan-receipt] Not a receipt — user ${user.id}`);
      return json({
        error:       'not_a_receipt',
        items:       [],
        remaining:   DAILY_LIMIT - usedToday,
      }, 422);
    }

    items = Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    console.error('[scan-receipt] Failed to parse GPT response');
    await supabaseAdmin.from('scan_usage').insert({
      user_id: user.id, token_count: tokenCount, status: 'error',
    });
    return json({ error: 'Failed to parse receipt' }, 502);
  }

  // Validate items
  items = items.filter(
    (item) => item && typeof item.name === 'string' && item.name.trim().length > 0,
  ).map((item) => ({
    name:  item.name.trim(),
    qty:   typeof item.qty === 'string' ? item.qty.trim() : '1',
    price: typeof item.price === 'number' ? item.price : 0,
  }));

  // ── Log usage ──────────────────────────────────────────────────────────────
  await supabaseAdmin.from('scan_usage').insert({
    user_id: user.id,
    token_count: tokenCount,
    status: 'ok',
  });

  const remainingToday = DAILY_LIMIT - (usedToday + 1);
  console.log(`[scan-receipt] OK — user ${user.id} — ${items.length} items — ${remainingToday} left`);

  return json({ items, remaining: remainingToday });
});
