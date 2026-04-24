/**
 * ReceiptService — receipt image capture + GPT-4o-mini Vision OCR.
 *
 * Flow: expo-image-picker → base64 image → Supabase Edge Function
 *       → GPT-4o-mini Vision → structured JSON items → detectCategory()
 */

import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';
import { detectCategory } from './VoiceParser';
import type { ParsedItem } from '../types';

/** Thrown when the user has hit their daily scan limit (HTTP 429). */
export class RateLimitError extends Error {
  remaining: number;
  constructor(message: string, remaining = 0) {
    super(message);
    this.name = 'RateLimitError';
    this.remaining = remaining;
  }
}

/** Thrown when the scanned image is not a receipt or bill (HTTP 422). */
export class NotReceiptError extends Error {
  constructor() {
    super('This image doesn\'t look like a receipt or bill.');
    this.name = 'NotReceiptError';
  }
}

export class AuthRequiredError extends Error {
  constructor(message = 'Sign in to scan receipts.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL      ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const SCAN_DAILY_LIMIT = 10;

/**
 * Fetch how many scans the current user has left today.
 * Returns null if the count can't be determined.
 */
export async function getScanRemaining(): Promise<number | null> {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const { count, error } = await supabase
      .from('scan_usage')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ok')
      .gte('created_at', today.toISOString());
    if (error) return null;
    return Math.max(0, SCAN_DAILY_LIMIT - (count ?? 0));
  } catch {
    return null;
  }
}

/** Check if Supabase backend is configured. */
export function isBackendReady(): boolean {
  return (
    SUPABASE_URL.startsWith('https://') &&
    !SUPABASE_URL.includes('your-project-ref') &&
    SUPABASE_ANON_KEY.length > 20 &&
    !SUPABASE_ANON_KEY.includes('your-anon-key')
  );
}

/** Check camera permission WITHOUT prompting the OS dialog. */
export async function checkCameraPermission(): Promise<boolean> {
  const { granted } = await ImagePicker.getCameraPermissionsAsync();
  return granted;
}

/** Request camera permission. Returns true if granted. */
export async function requestCameraPermission(): Promise<boolean> {
  const { granted } = await ImagePicker.requestCameraPermissionsAsync();
  return granted;
}

/** Request media library permission for gallery access. Returns true if granted. */
export async function requestMediaLibraryPermission(): Promise<boolean> {
  const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return granted;
}

/**
 * Pick a receipt image from camera or gallery.
 * Returns base64 string, null if cancelled, or throws on error.
 */
export async function pickReceiptImage(
  source: 'camera' | 'gallery',
): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = {
    base64: true,
    quality: 0.4,       // lower quality = smaller base64 payload
    allowsEditing: true, // let user crop/straighten the receipt
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
  };

  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled) return null;

  const base64 = result.assets?.[0]?.base64;
  if (!base64) {
    throw new Error('Could not read the image. Try selecting a different photo.');
  }

  return base64;
}

/**
 * Send receipt image to Edge Function for OCR.
 * Returns parsed items with categories + remaining daily uses.
 * Throws RateLimitError on 429.
 */
export async function scanReceipt(
  base64Image: string,
): Promise<{ items: ParsedItem[]; remaining: number | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new AuthRequiredError();
  }
  const jwt = session.access_token;

  const endpoint = `${SUPABASE_URL}/functions/v1/scan-receipt`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: base64Image }),
    });
  } catch {
    throw new Error('Network error \u2014 check your connection');
  }

  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));

  if (res.status === 429) {
    throw new RateLimitError(
      data.error ?? 'Daily scan limit reached',
      data.remaining ?? 0,
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new AuthRequiredError();
  }

  if (res.status === 422 && data.error === 'not_a_receipt') {
    throw new NotReceiptError();
  }

  if (!res.ok) {
    throw new Error(data.error ?? `Scan failed (${res.status})`);
  }

  // Map items through detectCategory for consistent categorization
  const rawItems: Array<{ name: string; qty: string; price: number }> = data.items ?? [];

  const items: ParsedItem[] = rawItems.map((item) => ({
    name:     item.name.charAt(0).toUpperCase() + item.name.slice(1),
    qty:      item.qty || '1',
    price:    item.price || 0,
    category: detectCategory(item.name),
  }));

  return {
    items,
    remaining: data.remaining ?? null,
  };
}
