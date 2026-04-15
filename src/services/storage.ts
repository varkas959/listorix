import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GroceryItem, TripSummary, PriceHistory, WidgetData } from '../types';

const KEYS = {
  items:               'listorix:items',
  history:             'listorix:history',
  nextId:              'listorix:nextId',
  priceHistory:        'listorix:priceHistory',
  richPriceHistory:    'listorix:richPriceHistory',
  widgetData:          'listorix:widget_data',
  onboarded:           'listorix:onboarded',
  storePreference:     'listorix:storePreference',
  savePromptShown:     'listorix:savePromptShown',
  listTemplate:        'listorix:listTemplate',
  firstListDone:       'listorix:firstListDone',
  language:            'listorix:language',
  currency:            'listorix:currency',
  notifications:       'listorix:notifications',
  localBudget:         'listorix:localBudget',
  deletedTripIds:      'listorix:deletedTripIds',
  categoryOverrides:   'listorix:categoryOverrides',
} as const;

export async function loadItems(): Promise<GroceryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.items);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveItems(items: GroceryItem[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.items, JSON.stringify(items));
}

export async function loadHistory(): Promise<TripSummary[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.history);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveHistory(history: TripSummary[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.history, JSON.stringify(history));
}

export async function loadPriceHistory(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.priceHistory);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function savePriceHistory(map: Record<string, number>): Promise<void> {
  await AsyncStorage.setItem(KEYS.priceHistory, JSON.stringify(map));
}

export async function isOnboarded(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(KEYS.onboarded);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function setOnboarded(): Promise<void> {
  await AsyncStorage.setItem(KEYS.onboarded, 'true');
}

export async function getStorePreference(): Promise<string | null> {
  try { return await AsyncStorage.getItem(KEYS.storePreference); }
  catch { return null; }
}
export async function setStorePreference(value: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.storePreference, value);
}

export async function isSavePromptShown(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(KEYS.savePromptShown)) === 'true'; }
  catch { return false; }
}
export async function setSavePromptShown(): Promise<void> {
  await AsyncStorage.setItem(KEYS.savePromptShown, 'true');
}

export async function saveListTemplate(items: GroceryItem[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.listTemplate, JSON.stringify(items));
}

export async function loadListTemplate(): Promise<GroceryItem[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.listTemplate);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function getHasCompletedFirstList(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(KEYS.firstListDone)) === 'true'; }
  catch { return false; }
}
export async function setHasCompletedFirstList(): Promise<void> {
  await AsyncStorage.setItem(KEYS.firstListDone, 'true');
}

// ── Language ──────────────────────────────────────────────────────────────────
export async function getLanguage(): Promise<string> {
  try { return (await AsyncStorage.getItem(KEYS.language)) ?? 'en'; }
  catch { return 'en'; }
}
export async function setLanguage(code: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.language, code);
}

// ── Currency ──────────────────────────────────────────────────────────────────
export async function getCurrency(): Promise<string> {
  try { return (await AsyncStorage.getItem(KEYS.currency)) ?? ''; }
  catch { return ''; }
}
export async function setCurrency(value: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.currency, value);
}

// ── Notifications ─────────────────────────────────────────────────────────────
export async function getNotificationsEnabled(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(KEYS.notifications)) !== 'false'; }
  catch { return true; }
}
export async function setNotificationsEnabled(v: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.notifications, v ? 'true' : 'false');
}

// ── Local budget (for non-signed-in users) ────────────────────────────────────
export async function getLocalBudget(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.localBudget);
    return raw ? Number(raw) : null;
  } catch { return null; }
}
export async function setLocalBudget(amount: number | null): Promise<void> {
  if (amount == null) await AsyncStorage.removeItem(KEYS.localBudget);
  else await AsyncStorage.setItem(KEYS.localBudget, String(amount));
}

export async function getNextId(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.nextId);
    const id  = raw ? parseInt(raw, 10) : 1;
    await AsyncStorage.setItem(KEYS.nextId, String(id + 1));
    return id;
  } catch {
    return Date.now();
  }
}

// ── Rich price history (F3) ───────────────────────────────────────────────────

export async function loadRichPriceHistory(): Promise<PriceHistory> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.richPriceHistory);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export async function saveRichPriceHistory(history: PriceHistory): Promise<void> {
  await AsyncStorage.setItem(KEYS.richPriceHistory, JSON.stringify(history));
}

// ── Widget data (F6) ─────────────────────────────────────────────────────────

export async function saveWidgetData(data: WidgetData): Promise<void> {
  await AsyncStorage.setItem(KEYS.widgetData, JSON.stringify(data));
}

// ── Trip deletion ─────────────────────────────────────────────────────────────

/** Remove a trip from local history and remember its ID so remote copies stay hidden. */
export async function deleteTrip(id: string): Promise<void> {
  const [trips, deletedRaw] = await Promise.all([
    loadHistory(),
    AsyncStorage.getItem(KEYS.deletedTripIds),
  ]);
  const deleted: string[] = deletedRaw ? JSON.parse(deletedRaw) : [];
  if (!deleted.includes(id)) deleted.push(id);
  await Promise.all([
    saveHistory(trips.filter(t => t.id !== id)),
    AsyncStorage.setItem(KEYS.deletedTripIds, JSON.stringify(deleted)),
  ]);
}

export async function getDeletedTripIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.deletedTripIds);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

// ── Category overrides (user-taught mappings) ─────────────────────────────────

export async function loadCategoryOverrides(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.categoryOverrides);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export async function saveCategoryOverrides(overrides: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(KEYS.categoryOverrides, JSON.stringify(overrides));
}

// ── Clear all local data (used on account deletion) ─────────────────────────
export async function clearAllLocalData(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(KEYS));
}

