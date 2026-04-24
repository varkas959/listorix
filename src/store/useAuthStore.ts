import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { registerPushToken } from '../services/NotificationService';
import { useListStore } from './useListStore';

interface AuthState {
  user:      User | null;
  session:   Session | null;
  /** True while the initial session is being restored from SecureStore on app start. */
  loading:   boolean;
  authError: string | null;

  /** Call once on app mount — restores persisted session from SecureStore. */
  initialize:     () => Promise<void>;
  signIn:         (email: string, password: string) => Promise<boolean>;
  signUp:         (email: string, password: string) => Promise<boolean>;
  signOut:        () => Promise<void>;
  clearAuthError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user:      null,
  session:   null,
  loading:   true,
  authError: null,

  initialize: async () => {
    // Supabase reads the persisted JWT from SecureStore automatically.
    const { data: { session } } = await supabase.auth.getSession();
    set({ session, user: session?.user ?? null, loading: false });

    // Keep auth state in sync with token refreshes and remote sign-outs.
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null });
      // Register push token silently on every sign-in (no-op if already registered)
      if (session) {
        registerPushToken({ requestPermission: false });
      } else {
        useListStore.getState().resetForSignedOut().catch(() => undefined);
      }
    });
  },

  signIn: async (email, password) => {
    set({ authError: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ authError: mapAuthError(error.message) });
      return false;
    }
    return true;
  },

  signUp: async (email, password) => {
    set({ authError: null });
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      set({ authError: mapAuthError(error.message) });
      return false;
    }
    return true;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    await useListStore.getState().resetForSignedOut();
    set({ user: null, session: null });
  },

  clearAuthError: () => set({ authError: null }),
}));

function mapAuthError(msg: string): string {
  if (msg.includes('Invalid login credentials'))   return 'Wrong email or password.';
  if (msg.includes('Email not confirmed'))          return 'Check your email to confirm your account.';
  if (msg.includes('User already registered'))      return 'An account with this email already exists.';
  if (msg.includes('Password should be at least'))  return 'Password must be at least 6 characters.';
  if (msg.includes('rate limit'))                   return 'Too many attempts. Please wait a minute.';
  return 'Something went wrong. Please try again.';
}
