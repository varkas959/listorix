import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { isOnboarded } from '../src/services/storage';
import { Colors } from '../src/constants/colors';
import { useAuthStore } from '../src/store/useAuthStore';
import { registerPushToken } from '../src/services/NotificationService';
import { initializeCurrencySettings } from '../src/utils/currency';

export default function RootLayout() {
  const { initialize, user, loading } = useAuthStore();
  const [onboarded, setBoarded] = useState<boolean | null>(null);
  const router   = useRouter();
  const segments = useSegments();

  // Restore Supabase session from SecureStore on first mount
  useEffect(() => {
    initialize();
    initializeCurrencySettings().catch(() => undefined);
  }, []);

  // Register push token when user signs in — needed for family list notifications
  useEffect(() => {
    if (user) registerPushToken();
  }, [user]);

  // Re-read onboarding flag from storage whenever segments change.
  // This is critical: onboarding.tsx calls setOnboarded() then navigates away.
  // Without this, the route guard still sees the stale onboarded=false and
  // immediately bounces the user back to /onboarding in a loop.
  useEffect(() => {
    isOnboarded().then(v => setBoarded(v));
  }, [segments]);

  // Route guard — runs whenever auth state or onboarding status changes
  useEffect(() => {
    if (loading || onboarded === null) return;   // still initializing

    const inAuth       = segments[0] === 'auth';
    const inOnboarding = segments[0] === 'onboarding' || segments[0] === 'onboard-store';
    const inTabs       = segments[0] === '(tabs)';
    const inLegal      = segments[0] === 'legal';
    const inAddItems   = segments[0] === 'add-items';   // ← native sheet screen

    if (user && !onboarded && !inOnboarding) {
      // Signed in but hasn't completed onboarding → onboarding flow
      router.replace('/onboarding');
    } else if (user && onboarded && (inAuth || inOnboarding)) {
      // Already signed in + onboarded → go straight to the app
      router.replace('/(tabs)');
    } else if (!user && !inAuth && !inTabs && !inLegal && !inAddItems) {
      // Not signed in and on an unexpected screen → go to app
      router.replace('/(tabs)');
    }
  }, [loading, user, onboarded, segments]);

  // Show spinner while session is being restored from SecureStore
  if (loading || onboarded === null) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="auth"          options={{ gestureEnabled: false }} />
        <Stack.Screen name="onboarding"    options={{ gestureEnabled: false }} />
        <Stack.Screen name="onboard-store" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="legal"         options={{ presentation: 'card' }} />
        <Stack.Screen
          name="add-items"
          options={{
            presentation:       'card',
            headerShown:        false,
            gestureEnabled:     true,
            animation:          'slide_from_bottom',
          }}
        />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
});
