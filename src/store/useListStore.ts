import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { GroceryItem, GroupMember, ParsedItem, PriceHistory, PriceRecord, WidgetData } from '../types';
import {
  loadItems, saveItems, loadPriceHistory, savePriceHistory,
  loadHistory, saveHistory,
  loadRichPriceHistory, saveRichPriceHistory,
  saveWidgetData,
  clearLegacyItemsCache,
  getHasCompletedFirstList, setHasCompletedFirstList,
  loadCategoryOverrides, saveCategoryOverrides,
  type ItemsContext,
} from '../services/storage';
import { registerPushToken } from '../services/NotificationService';
import {
  getActiveList,
  getOrCreateActiveListId,
  completeActiveList,
  remoteAddItem,
  remoteToggleItem,
  remoteRemoveItem,
  remoteUpdateItemPrice,
  remoteUpdateItemCount,
  syncPriceHistory,
  getRemotePriceHistory,
  updateProfile,
  getItemsForList,
  // Group functions
  createGroup    as apiCreateGroup,
  joinGroup      as apiJoinGroup,
  leaveGroup     as apiLeaveGroup,
  getGroupWithMembers,
  getGroupActiveListId,
  getOrCreateGroupActiveListId,
  notifyGroupMembers,
  HouseholdSetupError,
} from '../services/api';
import { useAuthStore } from './useAuthStore';

const HIGH_PRICE_FRACTION = 0.18;
const ACTIVE_CONTEXT_KEY  = 'listorix:activeContext';

function withCountDefaults(items: GroceryItem[]): GroceryItem[] {
  return items.map(i => ({ ...i, count: i.count ?? 1 }));
}

export interface SavedEvent {
  id:             string;
  amount:         number;
  label:          string;
  category:       string;
  newCategoryPct: number;
  ts:             number;
}

interface ListState {
  items:                GroceryItem[];
  hydrated:             boolean;
  lastTripTotal:        number;
  lastTripStore:        string;
  lastTripByCategory:   Record<string, number>;
  lastItemPrice:        Record<string, number>;
  richPriceHistory:     PriceHistory;
  priceHistoryHydrated: boolean;
  budget:               number | null;
  lastSavedEvent:       SavedEvent | null;
  _activeListId:        string | null;
  syncStatus:           'idle' | 'syncing' | 'error';
  hasCompletedFirstList: boolean;

  // ── Household group ────────────────────────────────────────────────────────
  groupId:       string | null;
  groupName:     string | null;
  inviteCode:    string | null;
  groupMembers:  GroupMember[];
  /** 'personal' = own list, 'group' = shared household list */
  activeContext: 'personal' | 'group';
  /** true when a family member adds an item while user is on personal context */
  groupNotification: boolean;
  clearGroupNotification: () => void;

  hydrate:         () => Promise<void>;
  addItem:         (data: ParsedItem) => void;
  toggleItem:      (id: string) => void;
  removeItem:      (id: string) => void;
  clearList:       () => void;
  setBudget:       (amount: number | null) => void;
  clearSavedEvent: () => void;
  updateItemPrice:    (id: string, newPrice: number) => void;
  updateItemCount:    (id: string, count: number) => void;
  updateItemCategory: (id: string, category: string) => void;
  /** Flips true the first time the user sets any item price. Read + clear in the list screen. */
  priceNudgePending:  boolean;
  clearPriceNudge:    () => void;

  /** item name (lowercase) → user-chosen category */
  categoryOverrides: Record<string, string>;

  // ── Group actions ──────────────────────────────────────────────────────────
  createGroup:   (name?: string) => Promise<'ok' | 'schema_missing' | 'error'>;
  joinGroup:     (code: string) => Promise<'ok' | 'not_found' | 'error'>;
  leaveGroup:    () => Promise<void>;
  switchContext: (ctx: 'personal' | 'group') => Promise<void>;
}

let _nextId = 100;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** item total = unit price × count */
function itemTotal(item: GroceryItem): number {
  return item.price * (item.count ?? 1);
}

/** Update the rich price history map with this trip's items. */
function buildRichHistory(existing: PriceHistory, items: GroceryItem[]): PriceHistory {
  const updated = { ...existing };
  for (const item of items) {
    if (item.price <= 0) continue;
    const key = item.name.toLowerCase();
    const prev: PriceRecord | undefined = updated[key];
    updated[key] = prev
      ? {
          lastPrice: item.price,
          lastDate:  Date.now(),
          avgPrice:  Math.round((prev.avgPrice * prev.count + item.price) / (prev.count + 1)),
          count:     prev.count + 1,
        }
      : { lastPrice: item.price, lastDate: Date.now(), avgPrice: item.price, count: 1 };
  }
  return updated;
}

/** Write widget data — called after every mutation. Fire-and-forget. */
function persistWidgetData(items: GroceryItem[]) {
  const unchecked = items.filter(i => !i.checked);
  const data: WidgetData = {
    pending:   unchecked.reduce((s, i) => s + itemTotal(i), 0),
    itemCount: unchecked.length,
    items:     unchecked.slice(0, 5).map(i => i.name),
  };
  saveWidgetData(data);
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useListStore = create<ListState>((set, get) => ({
  items:                [],
  hydrated:             false,
  lastTripTotal:        0,
  lastTripStore:        '',
  lastTripByCategory:   {},
  lastItemPrice:        {},
  richPriceHistory:     {},
  priceHistoryHydrated: false,
  budget:               null,
  lastSavedEvent:       null,
  _activeListId:        null,
  syncStatus:           'idle',
  hasCompletedFirstList: false,
  groupId:              null,
  groupName:            null,
  inviteCode:           null,
  groupMembers:         [],
  activeContext:        'personal',
  groupNotification:    false,
  clearGroupNotification: () => set({ groupNotification: false }),
  categoryOverrides:    {},
  priceNudgePending:    false,
  clearPriceNudge:      () => set({ priceNudgePending: false }),

  // ── hydrate ────────────────────────────────────────────────────────────────
  hydrate: async () => {
    await clearLegacyItemsCache();

    const [savedContext, rawPersonalStored, rawGroupStored, priceMap, richHistory, firstListDone, catOverrides] = await Promise.all([
      AsyncStorage.getItem(ACTIVE_CONTEXT_KEY),
      loadItems('personal'),
      loadItems('group'),
      loadPriceHistory(),
      loadRichPriceHistory(),
      getHasCompletedFirstList(),
      loadCategoryOverrides(),
    ]);

    const cachedContext: ItemsContext = savedContext === 'group' ? 'group' : 'personal';
    const stored = withCountDefaults(
      cachedContext === 'group' ? rawGroupStored : rawPersonalStored
    );

    const hasReal = Object.keys(priceMap).length > 0;
    set({
      items:                 stored,
      hydrated:              true,
      hasCompletedFirstList: firstListDone,
      richPriceHistory:      richHistory,
      categoryOverrides:     catOverrides,
      ...(hasReal ? { lastItemPrice: priceMap, priceHistoryHydrated: true } : {}),
    });

    const user = useAuthStore.getState().user;
    if (!user) return;

    try {
      set({ syncStatus: 'syncing' });

      const [remoteList, remotePrices, groupData] = await Promise.all([
        getActiveList(user.id),          // personal lists only (group_id IS NULL)
        getRemotePriceHistory(user.id),
        getGroupWithMembers(user.id),    // fetch group if user has one
      ]);

      // Set group state
      if (groupData) {
        // Restore context — default to 'group' when user is in a group
        const ctx = (savedContext === 'personal') ? 'personal' : 'group';
        set({
          groupId:       groupData.group.id,
          groupName:     groupData.group.name,
          inviteCode:    groupData.group.invite_code,
          groupMembers:  groupData.members,
          activeContext: ctx,
        });
        if (!savedContext) {
          AsyncStorage.setItem(ACTIVE_CONTEXT_KEY, 'group');
        }
      }

      // Load list based on active context
      const ctx = get().activeContext;

      if (ctx === 'group' && groupData) {
        // FIND the existing group list — never create in hydrate to avoid
        // accidentally creating a fresh empty list on every restart.
        const groupListId = await getGroupActiveListId(groupData.group.id);
        if (groupListId) {
          const groupItems = await getItemsForList(groupListId);
          const withCount  = withCountDefaults(groupItems);
          // Only overwrite in-memory items AND local cache when remote has items.
          // If remote returns empty (network hiccup / empty list), keep whatever
          // was loaded from AsyncStorage at the top of hydrate — never blank the screen.
          if (withCount.length > 0) {
            set({ _activeListId: groupListId, items: withCount });
            saveItems(withCount, 'group');
          } else {
            set({ _activeListId: groupListId });
          }
        } else {
          // No active group list yet — create one now (first use or after trip complete)
          try {
            const newListId = await getOrCreateGroupActiveListId(user.id, groupData.group.id);
            set({ _activeListId: newListId, items: withCountDefaults(rawGroupStored) });
          } catch { /* stay offline */ }
        }
      } else {
        // Load personal list (existing logic)
        if (remoteList) {
          const withCount = withCountDefaults(remoteList.items);
          set({ _activeListId: remoteList.listId, items: withCount });
          saveItems(withCount, 'personal');
        } else {
          const localItems = withCountDefaults(rawPersonalStored);
          const listId = await getOrCreateActiveListId(user.id);
          set({ _activeListId: listId, items: localItems });
        }
      }

      if (Object.keys(remotePrices).length > 0) {
        const merged = { ...get().lastItemPrice, ...remotePrices };
        set({ lastItemPrice: merged, priceHistoryHydrated: true });
        savePriceHistory(merged);
      }

      set({ syncStatus: 'idle' });
    } catch {
      set({ syncStatus: 'error' });
    }
  },

  // ── addItem ────────────────────────────────────────────────────────────────
  addItem: (data) => {
    const richHistory    = get().richPriceHistory;
    const suggestedPrice = richHistory[data.name.toLowerCase()]?.lastPrice;
    // If user has previously overridden this item's category, honour that choice.
    const learnedCategory = get().categoryOverrides[data.name.toLowerCase()];
    const newItem: GroceryItem = {
      id:        String(++_nextId),
      name:      data.name,
      qty:       data.qty || '1',
      count:     data.count ?? 1,
      price:     data.price ?? suggestedPrice ?? 0,
      category:  learnedCategory ?? data.category ?? 'Other',
      checked:   false,
      createdAt: Date.now(),
    };
    const items = [...get().items, newItem];
    set({ items });
    saveItems(items, get().activeContext);
    persistWidgetData(items);

    const user        = useAuthStore.getState().user;
    const activeList  = get()._activeListId;
    const groupId     = get().groupId;
    const isGroupCtx  = get().activeContext === 'group';

    if (user && activeList) {
      remoteAddItem(user.id, activeList, newItem).then(remoteId => {
        if (!remoteId) return;
        const patched = get().items.map(i =>
          i.id === newItem.id ? { ...i, remoteId } : i
        );
        set({ items: patched });
        saveItems(patched, get().activeContext);

        // Notify group members (or legacy list members for personal shared lists)
        if (isGroupCtx && groupId) {
          notifyGroupMembers(groupId, activeList, newItem.name, remoteId);
        }
      });
    }
  },

  // ── toggleItem ─────────────────────────────────────────────────────────────
  toggleItem: (id) => {
    const item  = get().items.find(i => i.id === id);
    const items = get().items.map(i =>
      i.id === id ? { ...i, checked: !i.checked } : i
    );

    // Build a single update object — ONE set() call, ONE render cycle
    const update: Partial<ListState> = { items };

    if (item && !item.checked && item.price > 0) {
      const remaining      = items.filter(i => !i.checked);
      const totalAfter     = remaining.reduce((s, i) => s + itemTotal(i), 0);
      const catAfter       = remaining
        .filter(i => i.category === item.category)
        .reduce((s, i) => s + itemTotal(i), 0);
      const newCategoryPct = totalAfter > 0
        ? Math.round((catAfter / totalAfter) * 100) : 0;

      update.lastSavedEvent = {
        id, amount: itemTotal(item), label: item.name,
        category: item.category, newCategoryPct, ts: Date.now(),
      };
    }

    set(update);
    saveItems(items, get().activeContext);
    persistWidgetData(items);

    const user = useAuthStore.getState().user;
    if (user && item?.remoteId) {
      remoteToggleItem(item.remoteId, !item.checked);
    }

    // Auto-snapshot when ALL items are checked (trip complete)
    const allChecked = items.length > 0 && items.every(i => i.checked);
    if (allChecked) {
      const priceMap = { ...get().lastItemPrice };
      for (const i of items) {
        if (i.price > 0) priceMap[i.name] = i.price;
      }
      const tripTotal   = items.reduce((s, i) => s + itemTotal(i), 0);
      const richHistory = buildRichHistory(get().richPriceHistory, items);

      set({
        lastItemPrice: priceMap, priceHistoryHydrated: true,
        hasCompletedFirstList: true, richPriceHistory: richHistory,
      });
      savePriceHistory(priceMap);
      saveRichPriceHistory(richHistory);
      setHasCompletedFirstList();

      loadHistory().then(existing => {
        saveHistory([
          { id: Date.now().toString(), date: Date.now(), items: [...items], total: tripTotal },
          ...existing,
        ]);
      });

      if (user) {
        syncPriceHistory(user.id, priceMap);
        (async () => {
          let listId = get()._activeListId;
          if (!listId) {
            try { listId = await getOrCreateActiveListId(user.id); }
            catch { return; }
            set({ _activeListId: listId });
          }
          // Pass groupId so the next list is also a group list
          const activeGroupId = get().activeContext === 'group' ? get().groupId : null;
          completeActiveList(user.id, listId, tripTotal, activeGroupId).then(newListId => {
            set({ _activeListId: newListId });
            // Group membership persists — do NOT clear group state
          });
        })();
      }
    }
  },

  // ── removeItem ─────────────────────────────────────────────────────────────
  removeItem: (id) => {
    const item  = get().items.find(i => i.id === id);
    const items = get().items.filter(i => i.id !== id);
    set({ items });
    saveItems(items, get().activeContext);
    persistWidgetData(items);

    const user = useAuthStore.getState().user;
    if (user && item?.remoteId) {
      remoteRemoveItem(item.remoteId);
    }
  },

  // ── clearList ──────────────────────────────────────────────────────────────
  clearList: () => {
    const currentItems = get().items;
    const priceMap     = { ...get().lastItemPrice };
    const total        = currentItems.reduce((s, i) => s + itemTotal(i), 0);
    const richHistory  = buildRichHistory(get().richPriceHistory, currentItems);

    for (const item of currentItems) {
      if (item.price > 0) priceMap[item.name] = item.price;
    }

    set({
      items: [], lastItemPrice: priceMap, priceHistoryHydrated: true,
      hasCompletedFirstList: true, richPriceHistory: richHistory,
    });
    saveItems([], get().activeContext);
    savePriceHistory(priceMap);
    saveRichPriceHistory(richHistory);
    setHasCompletedFirstList();
    persistWidgetData([]);

    loadHistory().then(existing => {
      saveHistory([
        { id: Date.now().toString(), date: Date.now(), items: currentItems, total },
        ...existing,
      ]);
    });

    const user        = useAuthStore.getState().user;
    const activeList  = get()._activeListId;
    const activeGroupId = get().activeContext === 'group' ? get().groupId : null;

    if (user && activeList) {
      completeActiveList(user.id, activeList, total, activeGroupId).then(newListId => {
        set({ _activeListId: newListId });
        // Group state persists — only list ID rotates
      });
      syncPriceHistory(user.id, priceMap);
    }
  },

  // ── updateItemPrice ────────────────────────────────────────────────────────
  updateItemPrice: (id, newPrice) => {
    const current = get().items;
    const item    = current.find(i => i.id === id);
    const items   = current.map(i => i.id === id ? { ...i, price: newPrice } : i);

    // Fire the price nudge exactly once: when user sets the very first price in the list.
    const hadNoPrices = current.every(i => i.price === 0);
    const isAddingPrice = (item?.price ?? 0) === 0 && newPrice > 0;

    set({
      items,
      ...(hadNoPrices && isAddingPrice ? { priceNudgePending: true } : {}),
    });
    saveItems(items, get().activeContext);
    persistWidgetData(items);

    const user = useAuthStore.getState().user;
    if (user && item?.remoteId) {
      remoteUpdateItemPrice(item.remoteId, newPrice);
    }
  },

  // ── updateItemCount ────────────────────────────────────────────────────────
  updateItemCount: (id, count) => {
    const safeCount = Math.max(1, count);
    const item      = get().items.find(i => i.id === id);
    const items     = get().items.map(i =>
      i.id === id ? { ...i, count: safeCount } : i
    );
    set({ items });
    saveItems(items, get().activeContext);
    persistWidgetData(items);

    const user = useAuthStore.getState().user;
    if (user && item?.remoteId) {
      remoteUpdateItemCount(item.remoteId, safeCount);
    }
  },

  // ── updateItemCategory ────────────────────────────────────────────────────
  updateItemCategory: (id, category) => {
    const item  = get().items.find(i => i.id === id);
    const items = get().items.map(i =>
      i.id === id ? { ...i, category } : i
    );
    set({ items });
    saveItems(items, get().activeContext);

    // Remember the user's choice — next time this item name is added,
    // it will default to the category the user set here.
    if (item) {
      const overrides = { ...get().categoryOverrides, [item.name.toLowerCase()]: category };
      set({ categoryOverrides: overrides });
      saveCategoryOverrides(overrides);
    }
  },

  // ── setBudget ──────────────────────────────────────────────────────────────
  setBudget: (amount) => {
    set({ budget: amount });
    const user = useAuthStore.getState().user;
    if (user) updateProfile(user.id, { budget: amount });
  },

  clearSavedEvent: () => set({ lastSavedEvent: null }),

  // ── createGroup ────────────────────────────────────────────────────────────
  createGroup: async (name?: string) => {
    const user = useAuthStore.getState().user;
    if (!user) return 'error';

    try {
      saveItems(get().items, 'personal');
      const result = await apiCreateGroup(user.id, name);
      if (!result) return 'error';

      // Fetch full member list so avatar shows real display name, not null
      const withMembers = await getGroupWithMembers(user.id).catch(() => null);

      // Persist household metadata first. We only switch the visible context
      // after the shared list is confirmed ready.
      set({
        groupId:      result.group.id,
        groupName:    result.group.name,
        inviteCode:   result.group.invite_code,
        groupMembers: withMembers?.members ?? result.members,
      });

      try {
        const groupListId = await getOrCreateGroupActiveListId(user.id, result.group.id);
        const groupItems  = await getItemsForList(groupListId);
        const withCount   = withCountDefaults(groupItems);
        set({ _activeListId: groupListId, items: withCount, activeContext: 'group' });
        AsyncStorage.setItem(ACTIVE_CONTEXT_KEY, 'group');
        saveItems(withCount, 'group');
        persistWidgetData(withCount);
      } catch (error) {
        if (error instanceof HouseholdSetupError && error.kind === 'schema_missing') {
          return 'schema_missing';
        }
        console.warn('[store] createGroup list bootstrap failed:', error);
        return 'error';
      }

      // Request notification permission + register token so members get notified
      registerPushToken();

      return 'ok';
    } catch (error) {
      if (error instanceof HouseholdSetupError && error.kind === 'schema_missing') {
        return 'schema_missing';
      }
      console.warn('[store] createGroup failed:', error);
      return 'error';
    }
  },

  // ── joinGroup ──────────────────────────────────────────────────────────────
  joinGroup: async (code: string) => {
    const user = useAuthStore.getState().user;
    if (!user) return 'error';

    try {
      saveItems(get().items, 'personal');
      const result = await apiJoinGroup(user.id, code.trim().toUpperCase());
      if (!result) {
        console.warn('[store] joinGroup: group not found for code:', code);
        return 'not_found';
      }

      set({
        groupId:       result.group.id,
        groupName:     result.group.name,
        inviteCode:    result.group.invite_code,
        groupMembers:  result.members,
        activeContext: 'group',
      });
      AsyncStorage.setItem(ACTIVE_CONTEXT_KEY, 'group');

      // Load the group's active list
      const groupListId = await getOrCreateGroupActiveListId(user.id, result.group.id);
      const groupItems  = await getItemsForList(groupListId);
      const withCount   = withCountDefaults(groupItems);
      set({ _activeListId: groupListId, items: withCount });
      saveItems(withCount, 'group');
      persistWidgetData(withCount);

      // Request notification permission + register token so owner gets notified
      registerPushToken();

      return 'ok';
    } catch {
      return 'error';
    }
  },

  // ── leaveGroup ─────────────────────────────────────────────────────────────
  leaveGroup: async () => {
    const user    = useAuthStore.getState().user;
    const groupId = get().groupId;
    if (!user || !groupId) return;

    await apiLeaveGroup(user.id, groupId);

    set({
      groupId:       null,
      groupName:     null,
      inviteCode:    null,
      groupMembers:  [],
      activeContext: 'personal',
    });
    AsyncStorage.setItem(ACTIVE_CONTEXT_KEY, 'personal');

    // Restore the user's own personal list
    try {
      const remoteList = await getActiveList(user.id);
      if (remoteList) {
        const withCount = withCountDefaults(remoteList.items);
        set({ _activeListId: remoteList.listId, items: withCount });
        saveItems(withCount, 'personal');
        persistWidgetData(withCount);
      } else {
        const listId = await getOrCreateActiveListId(user.id);
        const personalCached = await loadItems('personal');
        set({ _activeListId: listId, items: personalCached });
        saveItems(personalCached, 'personal');
        persistWidgetData(personalCached);
      }
    } catch { /* stay with current state */ }
  },

  // ── switchContext ──────────────────────────────────────────────────────────
  switchContext: async (ctx: 'personal' | 'group') => {
    const prevCtx   = get().activeContext;
    const prevItems = get().items;
    if (prevCtx === ctx) return;

    // Guard: can only switch to 'group' if a group actually exists
    const groupId = get().groupId;
    if (ctx === 'group' && !groupId) return;

    // Clear notification dot when user opens the household list
    if (ctx === 'group') set({ groupNotification: false });

    saveItems(prevItems, prevCtx);

    const cachedTargetItems = withCountDefaults(await loadItems(ctx));

    // Swap to the target cache immediately so we avoid both stale cross-context
    // flashes and empty-state flicker while the remote fetch is in flight.
    set({ activeContext: ctx, items: cachedTargetItems });
    AsyncStorage.setItem(ACTIVE_CONTEXT_KEY, ctx);

    const user = useAuthStore.getState().user;
    if (!user) return;

    try {
      if (ctx === 'group' && groupId) {
        const groupListId = await getOrCreateGroupActiveListId(user.id, groupId);
        const groupItems  = await getItemsForList(groupListId);
        const withCount   = withCountDefaults(groupItems);
        set({ _activeListId: groupListId, items: withCount.length > 0 ? withCount : cachedTargetItems });
        if (withCount.length > 0) {
          saveItems(withCount, 'group');
          persistWidgetData(withCount);
        } else {
          persistWidgetData(cachedTargetItems);
        }
      } else {
        // Switch to personal list
        const remoteList = await getActiveList(user.id);
        if (remoteList) {
          const withCount = withCountDefaults(remoteList.items);
          set({ _activeListId: remoteList.listId, items: withCount });
          saveItems(withCount, 'personal');
          persistWidgetData(withCount);
        } else {
          const listId = await getOrCreateActiveListId(user.id);
          set({ _activeListId: listId, items: cachedTargetItems });
          persistWidgetData(cachedTargetItems);
        }
      }
    } catch {
      // Restore previous context and items on failure — never leave UI stuck
      set({ activeContext: prevCtx, items: prevItems });
      AsyncStorage.setItem(ACTIVE_CONTEXT_KEY, prevCtx);
    }
  },
}));

// ── Exported helpers ──────────────────────────────────────────────────────────

export function isHighPrice(itemPrice: number, totalAll: number): boolean {
  if (totalAll === 0) return false;
  return itemPrice / totalAll >= HIGH_PRICE_FRACTION;
}

export function priceDiffVsLast(
  itemName: string,
  itemPrice: number,
  lastItemPrice: Record<string, number>
): number | null {
  const last = lastItemPrice[itemName];
  if (last === undefined) return null;
  return Math.round(((itemPrice - last) / last) * 100);
}
