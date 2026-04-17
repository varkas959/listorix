import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { isOnboarded } from '../src/services/storage';
import { Colors } from '../src/constants/colors';
import { useAuthStore } from '../src/store/useAuthStore';
import {
  getGroupActiveListId,
  getItemsForList,
} from '../src/services/api';
import {
  FAMILY_LIST_CATEGORY_ID,
  MARK_FAMILY_ITEM_DONE_ACTION_ID,
  OPEN_FAMILY_LIST_ACTION_ID,
  initializeNotificationActions,
  registerPushToken,
  showMarkBoughtConfirmation,
  type NotificationNavigationPayload,
} from '../src/services/NotificationService';
import { saveItems } from '../src/services/storage';
import { initializeCurrencySettings } from '../src/utils/currency';
import { useListStore } from '../src/store/useListStore';

export default function RootLayout() {
  const { initialize, user, loading } = useAuthStore();
  const hydrateListStore = useListStore(s => s.hydrate);
  const [onboarded, setBoarded] = useState<boolean | null>(null);
  const router   = useRouter();
  const segments = useSegments();
  const handledNotificationRef = useRef<string | null>(null);

  const refreshGroupItemsForNotification = async (groupId: string) => {
    const groupListId = await getGroupActiveListId(groupId);
    if (!groupListId) return;

    const groupItems = await getItemsForList(groupListId);
    const withCount = groupItems.map(item => ({ ...item, count: item.count ?? 1 }));
    useListStore.setState({ _activeListId: groupListId, items: withCount });
    await saveItems(withCount, 'group');
  };

  const handleNotificationOpen = async (payload?: NotificationNavigationPayload) => {
    if (!payload?.group_id) return;

    router.replace('/(tabs)');

    const store = useListStore.getState();
    if (!store.groupId || store.groupId !== payload.group_id) return;
    if (store.activeContext === 'group') {
      store.clearGroupNotification();
      return;
    }

    await store.switchContext('group');
  };

  const handleNotificationMarkBought = async (payload?: NotificationNavigationPayload) => {
    if (!payload?.group_id || !payload?.item_id) return;
    if (!user) return;

    const store = useListStore.getState();
    if (!store.groupId || store.groupId !== payload.group_id) return;

    if (store.activeContext !== 'group') {
      await store.switchContext('group');
    } else {
      store.clearGroupNotification();
    }

    await refreshGroupItemsForNotification(payload.group_id);

    const refreshedStore = useListStore.getState();
    const target = refreshedStore.items.find(
      item => item.remoteId === payload.item_id || item.id === payload.item_id,
    );
    if (!target || target.checked) return;

    refreshedStore.toggleItem(target.id);
    await showMarkBoughtConfirmation(target.name);
  };

  // Restore Supabase session from SecureStore on first mount
  useEffect(() => {
    initialize();
    initializeCurrencySettings().catch(() => undefined);
    initializeNotificationActions().catch(() => undefined);
  }, []);

  // Register push token when user signs in — needed for family list notifications
  useEffect(() => {
    if (user) registerPushToken();
  }, [user]);

  // Hydrate the list store after auth restoration so the app can restore the
  // correct personal/family context and cached items on every cold launch.
  useEffect(() => {
    if (loading) return;
    hydrateListStore().catch(() => undefined);
  }, [loading, user?.id, hydrateListStore]);

  useEffect(() => {
    function payloadFromResponse(response: Notifications.NotificationResponse): NotificationNavigationPayload | undefined {
      const request = response.notification.request;
      const actionId = response.actionIdentifier;
      const category = request.content.categoryIdentifier;

      if (
        actionId !== Notifications.DEFAULT_ACTION_IDENTIFIER &&
        actionId !== OPEN_FAMILY_LIST_ACTION_ID &&
        actionId !== MARK_FAMILY_ITEM_DONE_ACTION_ID
      ) {
        return undefined;
      }

      if (
        category !== FAMILY_LIST_CATEGORY_ID &&
        actionId !== OPEN_FAMILY_LIST_ACTION_ID &&
        actionId !== MARK_FAMILY_ITEM_DONE_ACTION_ID
      ) {
        return undefined;
      }

      return request.content.data as NotificationNavigationPayload | undefined;
    }

    function markHandled(response: Notifications.NotificationResponse): boolean {
      const notificationId = response.notification.request.identifier;
      if (handledNotificationRef.current === notificationId) return false;
      handledNotificationRef.current = notificationId;
      return true;
    }

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (!markHandled(response)) return;
      const payload = payloadFromResponse(response);
      if (response.actionIdentifier === MARK_FAMILY_ITEM_DONE_ACTION_ID) {
        handleNotificationMarkBought(payload).catch(() => undefined);
        return;
      }
      handleNotificationOpen(payload).catch(() => undefined);
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response || !markHandled(response)) return;
      const payload = payloadFromResponse(response);
      if (response.actionIdentifier === MARK_FAMILY_ITEM_DONE_ACTION_ID) {
        handleNotificationMarkBought(payload).catch(() => undefined);
        return;
      }
      handleNotificationOpen(payload).catch(() => undefined);
    });

    return () => {
      responseSub.remove();
    };
  }, [router]);

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
            presentation:       'transparentModal',
            headerShown:        false,
            gestureEnabled:     true,
            animation:          'slide_from_bottom',
            contentStyle:       { backgroundColor: 'transparent' },
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
