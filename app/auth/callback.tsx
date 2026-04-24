import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../../src/services/supabase';
import { Colors } from '../../src/constants/colors';

// CRITICAL: closes ASWebAuthenticationSession and hands control back to the app
WebBrowser.maybeCompleteAuthSession();

/**
 * Deep-link landing page for OAuth callbacks.
 * listorix://auth/callback?code=... arrives here after Google/Apple sign-in.
 */
export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string | string[];
    access_token?: string | string[];
    refresh_token?: string | string[];
  }>();

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession) {
          if (!cancelled) router.replace('/(tabs)');
          return;
        }

        const codeParam = params.code;
        const accessTokenParam = params.access_token;
        const refreshTokenParam = params.refresh_token;
        const code = Array.isArray(codeParam) ? codeParam[0] : codeParam;
        const accessToken = Array.isArray(accessTokenParam) ? accessTokenParam[0] : accessTokenParam;
        const refreshToken = Array.isArray(refreshTokenParam) ? refreshTokenParam[0] : refreshTokenParam;

        if (typeof code === 'string' && code.length > 0) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (
          typeof accessToken === 'string' &&
          typeof refreshToken === 'string' &&
          accessToken.length > 0 &&
          refreshToken.length > 0
        ) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      } catch (e) {
        console.warn('[callback] auth callback failed:', e);
      }

      // Check session regardless — Supabase may have auto-processed it
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session) {
        router.replace('/(tabs)');
      } else {
        router.replace('/auth');
      }
    }

    handleCallback();
    return () => {
      cancelled = true;
    };
  }, [params.access_token, params.code, params.refresh_token, router]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
});
