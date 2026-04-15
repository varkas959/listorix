import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Colors } from '../../src/constants/colors';
import { Spacing, Radius, Shadow } from '../../src/constants/spacing';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useListStore } from '../../src/store/useListStore';
import { getTripHistory, type RemoteTrip } from '../../src/services/api';
import { loadHistory, deleteTrip, getDeletedTripIds } from '../../src/services/storage';
import type { TripSummary } from '../../src/types';
import { formatAmount, useCurrencySettings } from '../../src/utils/currency';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DisplayItem {
  name:     string;
  qty:      string;
  price:    number;
  category: string;
}

interface DisplayTrip {
  id:        string;
  date:      number;
  total:     number;
  itemCount: number;
  items?:    DisplayItem[];
}

function fromLocal(t: TripSummary): DisplayTrip {
  return {
    id:        t.id,
    date:      t.date,
    total:     t.total,
    itemCount: t.items.length,
    items:     t.items.map(i => ({ name: i.name, qty: i.qty, price: i.price, category: i.category ?? 'Other' })),
  };
}

function fromRemote(t: RemoteTrip): DisplayTrip {
  return {
    id:        t.id,
    date:      t.completedAt,
    total:     t.total,
    itemCount: t.itemCount,
  };
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatCardDate(ts: number, locale: string): string {
  const d   = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === now.toDateString())       return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return d.toLocaleDateString(locale, {
    day:   'numeric',
    month: 'short',
    year:  d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatFooterDateTime(ts: number, locale: string): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true })
    .replace('am', 'AM').replace('pm', 'PM');
  return `${date}, ${time}`;
}

// ── Card ──────────────────────────────────────────────────────────────────────

const PREVIEW_COUNT = 2;

function TripCard({ trip, onRepeat, onDelete }: {
  trip:      DisplayTrip;
  onRepeat?: (items: DisplayItem[]) => void;
  onDelete?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { currencySymbol, locale } = useCurrencySettings();

  const hasItems   = (trip.items?.length ?? 0) > 0;
  const preview    = trip.items?.slice(0, PREVIEW_COUNT) ?? [];
  const overflow   = (trip.items?.length ?? 0) - PREVIEW_COUNT;
  const showMore   = !expanded && overflow > 0;
  const allItems   = expanded ? (trip.items ?? []) : preview;

  return (
    <View style={styles.card}>

      {/* ── Card header ─────────────────────────────────────────── */}
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.storeName}>Grocery Trip</Text>
          <Text style={styles.storeLocation}>{formatCardDate(trip.date, locale)}</Text>
        </View>
        <View style={styles.cardHeaderRight}>
          <View style={styles.deliveredBadge}>
            <Text style={styles.deliveredText}>Completed </Text>
            <View style={styles.deliveredIcon}>
              <Text style={styles.deliveredCheck}>✓</Text>
            </View>
          </View>
          {onDelete && (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => {
                Alert.alert(
                  'Delete Trip',
                  'This trip will be removed from your history.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => onDelete(trip.id) },
                  ],
                );
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.6}
            >
              <Text style={styles.deleteBtnText}>🗑</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.divider} />

      {/* ── Items ───────────────────────────────────────────────── */}
      {hasItems ? (
        <View style={styles.itemsSection}>
          {allItems.map((item, idx) => (
            <View key={idx} style={styles.itemRow}>
              <View style={styles.qtyBadge}>
                <Text style={styles.qtyText}>{item.qty || '1'}</Text>
              </View>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              {item.price > 0 && (
                <Text style={styles.itemPrice}>{currencySymbol}{formatAmount(item.price)}</Text>
              )}
            </View>
          ))}

          {showMore && (
            <TouchableOpacity onPress={() => setExpanded(true)} activeOpacity={0.6}>
              <Text style={styles.moreLink}>& {overflow} more</Text>
            </TouchableOpacity>
          )}
          {expanded && (
            <TouchableOpacity onPress={() => setExpanded(false)} activeOpacity={0.6}>
              <Text style={styles.moreLink}>Show less</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.itemsSection}>
          <Text style={styles.noItemsText}>{trip.itemCount} item{trip.itemCount !== 1 ? 's' : ''}</Text>
        </View>
      )}

      {/* ── Repeat Trip ─────────────────────────────────────────── */}
      {onRepeat && (trip.items?.length ?? 0) > 0 && (
        <TouchableOpacity
          style={styles.repeatBtn}
          onPress={() => onRepeat(trip.items!)}
          activeOpacity={0.75}
        >
          <Text style={styles.repeatBtnText}>↺  Repeat this trip</Text>
        </TouchableOpacity>
      )}

      {/* ── Footer ───── */}
      {!(onRepeat && (trip.items?.length ?? 0) > 0) && <View style={styles.divider} />}
      <Text style={styles.footer}>
        Completed: {formatFooterDateTime(trip.date, locale)}
        {'  •  '}
        <Text style={styles.footerTotal}>Bill Total: {currencySymbol}{formatAmount(trip.total)}</Text>
      </Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const insets      = useSafeAreaInsets();
  const router      = useRouter();
  const { user }    = useAuthStore();
  const addItem = useListStore(s => s.addItem);

  const [trips, setTrips] = useState<DisplayTrip[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrips = useCallback(async () => {
    // ── Phase 1: local only — AsyncStorage reads in <10ms, show instantly
    const [local, deletedIds] = await Promise.all([
      loadHistory(),
      getDeletedTripIds(),
    ]);
    const localTrips = local.map(fromLocal);

    const seenLocal    = new Set<string>();
    const dedupedLocal = localTrips.filter(trip => {
      if (deletedIds.has(trip.id)) return false;
      const key = `${new Date(trip.date).toDateString()}-${trip.total}`;
      if (seenLocal.has(key)) return false;
      seenLocal.add(key);
      return true;
    });
    dedupedLocal.sort((a, b) => b.date - a.date);
    setTrips(dedupedLocal);
    setLoading(false);

    // ── Phase 2: remote — silent background merge, no spinner ─────────────
    if (!user) return;
    try {
      const remote      = await getTripHistory(user.id);
      const remoteTrips = remote.map(fromRemote);

      const merged: DisplayTrip[] = [...dedupedLocal];
      for (const r of remoteTrips) {
        if (deletedIds.has(r.id)) continue;
        const rDay    = new Date(r.date).toDateString();
        const covered = dedupedLocal.some(l =>
          new Date(l.date).toDateString() === rDay && Math.abs(l.total - r.total) <= 5,
        );
        if (!covered) merged.push(r);
      }
      merged.sort((a, b) => b.date - a.date);
      setTrips(merged);
    } catch {
      // Remote failed — local data already showing, that's fine
    }
  }, [user]);

  async function handleDelete(id: string) {
    await deleteTrip(id);
    setTrips(prev => prev.filter(t => t.id !== id));
  }

  // useFocusEffect alone is enough — fires on mount AND every time the tab is revisited
  useFocusEffect(useCallback(() => { fetchTrips(); }, [fetchTrips]));

  function handleRepeat(items: DisplayItem[]) {
    // Add items to current list — no clearing, no confirmation
    items.forEach((item, i) => {
      setTimeout(() => {
        addItem({
          name:     item.name,
          qty:      item.qty || '1',
          price:    item.price,
          category: item.category,
          count:    1,
        });
      }, i * 60);
    });
    router.push('/(tabs)');
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {loading ? (
        <View style={styles.center} />
      ) : trips.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🛒</Text>
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptyBody}>
            Complete your first shopping list and it will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.pageTitle}>Past Orders</Text>
          {trips.map(trip => (
            <TripCard key={trip.id} trip={trip} onRepeat={handleRepeat} onDelete={handleDelete} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },

  pageTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 4,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: 8,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 4 },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  scroll: { flex: 1 },
  scrollContent: {
    padding: Spacing.md,
    gap: 14,
    paddingBottom: 140,
  },

  // ── Card ──────────────────────────────────────────────────────
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    ...Shadow.card,
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deleteBtn: {
    padding: 2,
    opacity: 0.5,
  },
  deleteBtnText: {
    fontSize: 14,
  },
  storeName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  storeLocation: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  deliveredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deliveredText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.success,
  },
  deliveredIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliveredCheck: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 12,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },

  // ── Items ─────────────────────────────────────────────────────
  itemsSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyBadge: {
    minWidth: 32,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: Colors.bg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  qtyText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  itemName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  moreLink: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: 2,
  },
  noItemsText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },

  // ── Footer ────────────────────────────────────────────────────
  repeatBtn: {
    paddingVertical: 13,
    backgroundColor: Colors.primarySubtle,
    alignItems: 'center',
  },
  repeatBtnText: {
    fontSize:   14,
    fontWeight: '700',
    color:      Colors.primary,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 11,
    color: Colors.textSecondary,
  },
  footerTotal: {
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});
