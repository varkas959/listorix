import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
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

  useEffect(() => {
    async function handleCallback() {
      try {
        // Parse the URL for code or tokens
        const url = await Linking.getInitialURL();
        if (url) {
          const code = new URL(url).searchParams.get('code');
          if (code) {
            await supabase.auth.exchangeCodeForSession(code);
          }
        }
      } catch (e) {
        console.warn('[callback] URL parse error:', e);
      }

      // Check session regardless — Supabase may have auto-processed it
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace('/(tabs)');
      } else {
        router.replace('/auth');
      }
    }

    handleCallback();
  }, []);

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
