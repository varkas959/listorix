import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// How notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  false,
    shouldSetBadge:   false,
  }),
});

const WEEKLY_REMINDER_ID = 'listorix-weekly-reminder';
export const FAMILY_LIST_CATEGORY_ID = 'family-list-update';
export const OPEN_FAMILY_LIST_ACTION_ID = 'OPEN_FAMILY_LIST';
export const MARK_FAMILY_ITEM_DONE_ACTION_ID = 'MARK_FAMILY_ITEM_DONE';

export interface NotificationNavigationPayload {
  group_id?: string;
  list_id?: string;
  item_id?: string;
}

export async function initializeNotificationActions(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(
    FAMILY_LIST_CATEGORY_ID,
    [
      {
        identifier: OPEN_FAMILY_LIST_ACTION_ID,
        buttonTitle: 'Open Family List',
        options: {
          opensAppToForeground: true,
        },
      },
      {
        identifier: MARK_FAMILY_ITEM_DONE_ACTION_ID,
        buttonTitle: 'Mark Bought',
        options: {
          opensAppToForeground: false,
        },
      },
    ],
  );
}

export async function showMarkBoughtConfirmation(itemName: string): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Marked as bought',
        body: `${itemName} was checked off in Listorix.`,
        sound: false,
      },
      trigger: null,
    });
  } catch {
    // Non-critical confirmation only.
  }
}

/**
 * Request notification permissions from the user.
 * Returns true if granted, false if denied.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();

  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Schedule a weekly grocery reminder.
 * Fires every Saturday at 10:00 AM — a common grocery shopping day.
 */
export async function scheduleWeeklyReminder(): Promise<void> {
  // Cancel any existing reminder first to avoid duplicates
  await cancelWeeklyReminder();

  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_REMINDER_ID,
    content: {
      title: '🛒 Time to plan your groceries!',
      body: 'Open Listorix and build your list before you head to the store.',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 7,   // Saturday (1 = Sunday … 7 = Saturday)
      hour: 10,
      minute: 0,
    },
  });
}

/**
 * Cancel the weekly reminder.
 */
export async function cancelWeeklyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_REMINDER_ID);
}

/**
 * Check if notifications are currently permitted by the OS.
 */
export async function areNotificationsPermitted(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

/**
 * Get the Expo push token for this device and save it to Supabase.
 * Called silently after sign-in — required for family list notifications.
 * No-ops on simulators, unsigned builds, or if permission not granted.
 */
/**
 * Register (or refresh) the Expo push token for this device in Supabase.
 * - Requests permission if not yet granted (shows iOS permission dialog).
 * - No-ops on simulators or unsigned builds.
 * - Safe to call multiple times — upserts on user_id conflict.
 * - Call this after sign-in AND after joining/creating a group.
 */
export async function registerPushToken(): Promise<void> {
  try {
    if (!Device.isDevice) return; // simulators can't receive push

    // Request permission if not already granted — shows the iOS dialog
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return; // user denied

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return;

    const { data: tokenData } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!tokenData) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    await supabase
      .from('push_tokens')
      .upsert(
        { user_id: session.user.id, token: tokenData, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
  } catch {
    // Non-critical — push token registration failure should never break the app
  }
}
