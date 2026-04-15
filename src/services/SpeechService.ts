/**
 * SpeechService — Sarvam AI voice input.
 *
 * All languages (English, Hindi, Telugu, Tamil, Kannada) use the same path:
 * expo-av recording → Supabase Edge Function → Sarvam AI speech-to-text-translate
 * → English text → VoiceParser pipeline.
 *
 * No native modules required — works in Expo Go and dev builds.
 */

import { Audio } from 'expo-av';
import { supabase } from './supabase';

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL      ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// ── Language constants ─────────────────────────────────────────────────────────

export const VOICE_LANGUAGES = [
  { code: 'en', label: 'English', script: 'English' },
  { code: 'hi', label: 'हिंदी',   script: 'Hindi'   },
  { code: 'te', label: 'తెలుగు',  script: 'Telugu'  },
  { code: 'ta', label: 'தமிழ்',   script: 'Tamil'   },
  { code: 'kn', label: 'ಕನ್ನಡ',   script: 'Kannada' },
] as const;

export type VoiceLang = typeof VOICE_LANGUAGES[number];

// ── Error types ────────────────────────────────────────────────────────────────

export class RateLimitError extends Error {
  remaining: number;
  constructor(msg: string, remaining: number) {
    super(msg);
    this.name = 'RateLimitError';
    this.remaining = remaining;
  }
}

// ── Availability check ─────────────────────────────────────────────────────────

export const VOICE_DAILY_LIMIT = 20;

/**
 * Fetch how many voice uses the current user has left today.
 * Returns null if the count can't be determined (not signed in, network error, etc.).
 */
export async function getVoiceRemaining(): Promise<number | null> {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const { count, error } = await supabase
      .from('voice_usage')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ok')
      .gte('created_at', today.toISOString());
    if (error) return null;
    return Math.max(0, VOICE_DAILY_LIMIT - (count ?? 0));
  } catch {
    return null;
  }
}

/** Returns true when the Supabase backend is configured. */
export function hasApiKey(): boolean {
  return (
    SUPABASE_URL.startsWith('https://') &&
    !SUPABASE_URL.includes('your-project-ref') &&
    SUPABASE_ANON_KEY.length > 20 &&
    !SUPABASE_ANON_KEY.includes('your-anon-key')
  );
}

/** Check microphone permission WITHOUT prompting the OS dialog. */
export async function checkMicPermission(): Promise<boolean> {
  const { granted } = await Audio.getPermissionsAsync();
  return granted;
}

/** Request microphone permission. Returns true if granted. */
export async function requestMicPermission(): Promise<boolean> {
  const { granted } = await Audio.requestPermissionsAsync();
  return granted;
}

// ── Recording ──────────────────────────────────────────────────────────────────

// Mono 64kbps M4A — half the file size of HIGH_QUALITY stereo, uploads faster.
// Whisper transcribes speech perfectly at this quality.
// Note: no linearPCM fields — those are PCM-only and break AAC recording on iOS.
const SPEECH_RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension:        '.m4a',
    outputFormat:     Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder:     Audio.AndroidAudioEncoder.AAC,
    sampleRate:       44100,
    numberOfChannels: 1,
    bitRate:          64000,
  },
  ios: {
    extension:        '.m4a',
    outputFormat:     Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality:     Audio.IOSAudioQuality.MEDIUM,
    sampleRate:       44100,
    numberOfChannels: 1,
    bitRate:          64000,
  },
  web: {
    mimeType:      'audio/webm',
    bitsPerSecond: 64000,
  },
};

let _recording: Audio.Recording | null = null;

/** Start recording audio (works in Expo Go — uses expo-av only). */
export async function startRecording(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS:   true,
    playsInSilentModeIOS: true,
  });
  const { recording } = await Audio.Recording.createAsync(SPEECH_RECORDING_OPTIONS);
  _recording = recording;
}

/**
 * Stop recording and transcribe via Supabase Edge Function → Sarvam AI.
 * Returns English text + remaining daily uses.
 * Throws RateLimitError if daily limit exceeded.
 */
export async function stopAndTranscribe(
  sourceLang?: string,
): Promise<{ text: string; remaining: number | null }> {
  if (!_recording) throw new Error('No active recording');

  const recStatus  = await _recording.getStatusAsync();
  const durationMs = recStatus.isRecording ? recStatus.durationMillis ?? 0 : 0;

  await _recording.stopAndUnloadAsync();
  const uri = _recording.getURI();
  _recording = null;

  if (!uri) throw new Error('No audio URI from recorder');

  // Get user JWT for Edge Function auth
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Sign in to use voice input.');
  }
  const jwt = session.access_token;

  const formData = new FormData();
  formData.append('audio', {
    uri,
    name: 'audio.m4a',
    type: 'audio/m4a',
  } as unknown as Blob);
  formData.append('duration_ms', String(durationMs));
  if (sourceLang) formData.append('source_lang', sourceLang);

  // 30-second timeout — Sarvam can be slow on longer regional-language phrases.
  // Without this the fetch hangs forever on poor mobile connections.
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/transcribe`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body:    formData,
      signal:  controller.signal,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Voice recognition timed out. Please try again.');
    }
    throw new Error('Network error — check your connection');
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));

  if (res.status === 429) {
    throw new RateLimitError(
      data.error ?? 'Daily voice limit reached',
      data.remaining ?? 0,
    );
  }

  if (!res.ok) {
    throw new Error(data.error ?? `Transcribe failed (${res.status})`);
  }

  return {
    text:      (data.text ?? '').trim(),
    remaining: data.remaining ?? null,
  };
}

/** Cancel a recording in progress without sending to Sarvam. */
export async function cancelRecording(): Promise<void> {
  if (_recording) {
    try { await _recording.stopAndUnloadAsync(); } catch { /* ignore */ }
    _recording = null;
  }
}

/** Returns true if a recording is currently active. */
export function isRecording(): boolean {
  return _recording !== null;
}
