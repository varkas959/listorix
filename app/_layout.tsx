import React, { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import * as Updates from 'expo-updates';
import { isOnboarded } from '../src/services/storage';
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
import { LaunchScreen } from '../src/components/ui/LaunchScreen';
import {
  appendLaunchDiagnostic,
  beginLaunchDiagnosticsSession,
  installLaunchErrorHandler,
} from '../src/services/launchDiagnostics';

export default function RootLayout() {
  const { initialize, user, loading } = useAuthStore();
  const hydrateListStore = useListStore(s => s.hydrate);
  const listHydrated = useListStore(s => s.hydrated);
  const listBootstrapped = useListStore(s => s.bootstrapped);
  const pendingInviteCode = useListStore(s => s.pendingInviteCode);
  const householdInviteCode = useListStore(s => s.inviteCode);
  const householdGroupId = useListStore(s => s.groupId);
  const activeContext = useListStore(s => s.activeContext);
  const [onboarded, setBoarded] = useState<boolean | null>(null);
  const router   = useRouter();
  const segments = useSegments();
  const handledNotificationRef = useRef<string | null>(null);
  const handledInviteUrlRef = useRef<string | null>(null);
  const autoJoinInviteRef = useRef<string | null>(null);
  const [showLaunch, setShowLaunch] = useState(true);

  const waitForHouseholdContext = async (groupId: string, timeoutMs = 4000) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const store = useListStore.getState();
      if (store.bootstrapped && store.groupId === groupId) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    return false;
  };

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

    let store = useListStore.getState();
    if (!store.groupId || store.groupId !== payload.group_id) {
      const ready = await waitForHouseholdContext(payload.group_id);
      if (!ready) return;
      store = useListStore.getState();
    }

    if (store.activeContext === 'group') {
      store.clearGroupNotification();
      return;
    }

    await store.switchContext('group');
  };

  const handleNotificationMarkBought = async (payload?: NotificationNavigationPayload) => {
    if (!payload?.group_id || !payload?.item_id) return;
    if (!user) return;

    let store = useListStore.getState();
    if (!store.groupId || store.groupId !== payload.group_id) {
      const ready = await waitForHouseholdContext(payload.group_id);
      if (!ready) return;
      store = useListStore.getState();
    }

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

  const handleInviteLink = async (url?: string | null) => {
    if (!url || handledInviteUrlRef.current === url) return;

    const parsed = Linking.parse(url);
    const rawCode = parsed.queryParams?.code;
    const code = (Array.isArray(rawCode) ? rawCode[0] : rawCode)?.trim().toUpperCase();
    const path = (parsed.path ?? '').toLowerCase();
    const looksLikeJoinLink = path.includes('join') || url.toLowerCase().includes('join?code=');

    if (!looksLikeJoinLink || !code || code.length !== 8) return;

    handledInviteUrlRef.current = url;
    useListStore.getState().setPendingInviteCode(code);
    router.replace('/(tabs)');
  };

  const attemptPendingInviteJoin = async () => {
    const store = useListStore.getState();
    const pendingCode = store.pendingInviteCode?.trim().toUpperCase();
    if (!user || !listBootstrapped || !pendingCode) return;
    if (autoJoinInviteRef.current === pendingCode) return;

    if (store.groupId) {
      if (store.inviteCode?.trim().toUpperCase() === pendingCode) {
        autoJoinInviteRef.current = pendingCode;
        store.setPendingInviteCode(null);
        if (store.activeContext !== 'group') {
          await store.switchContext('group');
        } else {
          store.clearGroupNotification();
        }
      }
      return;
    }

    autoJoinInviteRef.current = pendingCode;
    const result = await store.joinGroup(pendingCode);
    if (result === 'ok') {
      router.replace('/(tabs)');
      return;
    }
    autoJoinInviteRef.current = null;
  };

  // Restore Supabase session from SecureStore on first mount
  useEffect(() => {
    beginLaunchDiagnosticsSession('root_layout_mount').catch(() => undefined);
    installLaunchErrorHandler();
    appendLaunchDiagnostic('root_init_start').catch(() => undefined);
    initialize().then(() => {
      appendLaunchDiagnostic('auth_initialized').catch(() => undefined);
    }).catch((error) => {
      appendLaunchDiagnostic('auth_initialize_failed', String(error)).catch(() => undefined);
    });
    initializeCurrencySettings().catch(() => undefined);
    initializeNotificationActions().catch(() => undefined);
  }, []);

  // Register push token when user signs in — needed for family list notifications
  useEffect(() => {
    if (user) registerPushToken({ requestPermission: false });
  }, [user]);

  // Silent OTA prefetch:
  // checks and downloads updates on app open/foreground without showing prompts.
  // Updates apply on the next relaunch boundary.
  useEffect(() => {
    let running = false;

    const silentlyPrefetchUpdate = async () => {
      if (running || __DEV__) return;
      running = true;
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) {
          await Updates.fetchUpdateAsync();
          appendLaunchDiagnostic('ota_prefetched').catch(() => undefined);
        }
      } catch (error) {
        appendLaunchDiagnostic('ota_prefetch_failed', String(error)).catch(() => undefined);
      } finally {
        running = false;
      }
    };

    silentlyPrefetchUpdate().catch(() => undefined);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        silentlyPrefetchUpdate().catch(() => undefined);
      }
    });

    return () => {
      appStateSub.remove();
    };
  }, []);

  // Hydrate the list store after auth restoration so the app can restore the
  // correct personal/family context and cached items on every cold launch.
  useEffect(() => {
    if (loading) return;
    appendLaunchDiagnostic('list_hydrate_requested', `user=${user?.id ?? 'guest'}`).catch(() => undefined);
    hydrateListStore().catch(() => undefined);
  }, [loading, user?.id, hydrateListStore]);

  useEffect(() => {
    appendLaunchDiagnostic(
      'root_state',
      `loading=${loading} user=${user ? 'yes' : 'no'} onboarded=${String(onboarded)} hydrated=${listHydrated ? 'yes' : 'no'} bootstrapped=${listBootstrapped ? 'yes' : 'no'}`
    ).catch(() => undefined);
  }, [loading, user, onboarded, listHydrated, listBootstrapped]);

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      handleInviteLink(url).catch(() => undefined);
    });

    const linkSub = Linking.addEventListener('url', ({ url }) => {
      handleInviteLink(url).catch(() => undefined);
    });

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
      linkSub.remove();
      responseSub.remove();
    };
  }, [router]);

  useEffect(() => {
    attemptPendingInviteJoin().catch(() => undefined);
  }, [user?.id, listBootstrapped, pendingInviteCode, householdInviteCode, householdGroupId, activeContext, router]);

  // Re-read onboarding flag from storage whenever segments change.
  // This is critical: onboarding.tsx calls setOnboarded() then navigates away.
  // Without this, the route guard still sees the stale onboarded=false and
  // immediately bounces the user back to /onboarding in a loop.
  useEffect(() => {
    isOnboarded().then(v => setBoarded(v));
  }, [segments]);

  // Route guard — runs whenever auth state or onboarding status changes
  useEffect(() => {
    if (loading || onboarded === null || (user && !listBootstrapped)) return;   // still initializing

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
  }, [loading, user, onboarded, segments, listBootstrapped]);

  const startupPending = loading || onboarded === null || (user && !listBootstrapped);
  const showBootSurface = showLaunch || startupPending;

  if (showBootSurface) {
    return (
      <LaunchScreen
        ready={!startupPending}
        onFinish={() => setShowLaunch(false)}
      />
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
        <Stack.Screen name="household" />
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
