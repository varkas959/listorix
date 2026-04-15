import React, {
  useMemo, useRef, useEffect, useState, useCallback, useImperativeHandle,
} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Animated,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useListStore } from '../../src/store/useListStore';
import { CategoryGroup } from '../../src/components/list/CategoryGroup';
import { Colors } from '../../src/constants/colors';
import { Spacing } from '../../src/constants/spacing';
import { SavedToast } from '../../src/components/ui/SavedToast';
import { NudgeToast } from '../../src/components/ui/NudgeToast';
import { SessionEndSheet } from '../../src/components/ui/SessionEndSheet';
import { ShareListSheet } from '../../src/components/ui/ShareListSheet';
import { useRealtimeItems } from '../../src/hooks/useRealtimeItems';
import { isSavePromptShown } from '../../src/services/storage';
import { fabEvents } from '../../src/utils/fabEvents';
import { formatAmount, useCurrencySettings } from '../../src/utils/currency';
import type { GroceryItem } from '../../src/types';

const CATEGORY_ORDER = [
  'Vegetables','Dairy','Fruits','Snacks','Grains','Pulses',
  'Spices','Bakery','Beverages','Oils & Sauces','Cleaning','Other',
];

interface ScoredListInsight {
  text: string;
  score: number;
}

function catVerb(cat: string) {
  return /s$/i.test(cat) || cat.includes('&') ? 'are' : 'is';
}

function computeCurrentListInsight(items: GroceryItem[], currencySymbol: string): string | null {
  if (items.length < 2) return null;

  const candidates: ScoredListInsight[] = [];
  const activeItems = items.filter(i => !i.checked);
  const unpricedActive = activeItems.filter(i => i.price === 0).length;
  const pricedItems = items.filter(i => i.price > 0);

  if (unpricedActive > 0 && unpricedActive < items.length) {
    candidates.push({
      text: unpricedActive === 1
        ? 'Add price for 1 item to complete your total'
        : `Add prices for ${unpricedActive} items to complete your total`,
      score: 260,
    });
  }

  const catMap: Record<string, { count: number; spend: number }> = {};
  items.forEach(item => {
    if (!catMap[item.category]) catMap[item.category] = { count: 0, spend: 0 };
    catMap[item.category].count++;
    catMap[item.category].spend += item.price * (item.count ?? 1);
  });

  const catSorted = Object.entries(catMap)
    .map(([cat, value]) => ({ cat, ...value }))
    .sort((a, b) => b.spend - a.spend || b.count - a.count);

  const totalSpend = pricedItems.reduce((sum, item) => sum + item.price * (item.count ?? 1), 0);
  if (totalSpend > 0 && catSorted[0]) {
    const topCatPct = Math.round((catSorted[0].spend / totalSpend) * 100);
    if (topCatPct >= 45) {
      candidates.push({
        text: `${catSorted[0].cat} ${catVerb(catSorted[0].cat)} leading your spend so far at ${currencySymbol}${formatAmount(catSorted[0].spend)}`,
        score: 210 + topCatPct,
      });
    }

    if (catSorted[1]) {
      const topTwoPct = Math.round(((catSorted[0].spend + catSorted[1].spend) / totalSpend) * 100);
      if (topTwoPct >= 75 && topTwoPct < 100 && catSorted.length >= 3) {
        candidates.push({
          text: `${catSorted[0].cat} and ${catSorted[1].cat} are driving most of your total so far`,
          score: 175 + topTwoPct,
        });
      }
    }
  }

  const itemSpendMap: Record<string, number> = {};
  const itemPriceMap: Record<string, number[]> = {};
  pricedItems.forEach(item => {
    const lineTotal = item.price * (item.count ?? 1);
    itemSpendMap[item.name] = (itemSpendMap[item.name] ?? 0) + lineTotal;
    itemPriceMap[item.name] = [...(itemPriceMap[item.name] ?? []), item.price];
  });

  const topSpendItem = Object.entries(itemSpendMap).sort((a, b) => b[1] - a[1])[0];
  if (topSpendItem && totalSpend > 0) {
    const [name, spend] = topSpendItem;
    const spendPct = Math.round((spend / totalSpend) * 100);
    if (spendPct >= 20) {
      candidates.push({
        text: `${name} is your biggest line item so far at ${currencySymbol}${formatAmount(spend)}`,
        score: 170 + spendPct,
      });
    }
  }

  const itemStats = Object.entries(itemPriceMap)
    .map(([name, prices]) => ({
      name,
      avg: Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length),
    }))
    .sort((a, b) => b.avg - a.avg);

  if (itemStats.length >= 2) {
    const sortedAvgs = [...itemStats].sort((a, b) => a.avg - b.avg);
    const medianPrice = sortedAvgs[Math.floor(sortedAvgs.length / 2)]?.avg ?? 1;
    const topItem = itemStats[0];
    const ratio = topItem.avg / Math.max(medianPrice, 1);
    if (ratio >= 2.5) {
      candidates.push({
        text: `${topItem.name} costs about ${Math.round(ratio)}x your typical priced item (${currencySymbol}${topItem.avg})`,
        score: 150 + ratio * 10,
      });
    }
  }

  if (totalSpend === 0 && catSorted[0]) {
    const topCat = catSorted[0];
    if (topCat.count >= 2) {
      candidates.push({
        text: `${topCat.cat} ${catVerb(topCat.cat)} taking up the most space - ${topCat.count} items`,
        score: 80 + topCat.count * 5,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const seenSubjects = new Set<string>();
  for (const candidate of candidates) {
    const subject = candidate.text.split(/\s+/)[0];
    if (seenSubjects.has(subject)) continue;
    seenSubjects.add(subject);
    return candidate.text;
  }

  return null;
}

function usePopOnChange(value: number) {
  const anim = useRef(new Animated.Value(1)).current;
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.88, duration: 55,  useNativeDriver: true }),
        Animated.spring(anim,  { toValue: 1,    useNativeDriver: true, tension: 280, friction: 7 }),
      ]).start();
    }
  }, [value]);
  return anim;
}

interface SaveDeltaBadgeHandle {
  show: (diff: number) => void;
}

const SaveDeltaBadge = React.memo(React.forwardRef<SaveDeltaBadgeHandle, {
  y: Animated.Value;
  opacity: Animated.Value;
  currencySymbol: string;
}>(
  function SaveDeltaBadge({ y, opacity, currencySymbol }, ref) {
    const [delta, setDelta] = useState(0);

    useImperativeHandle(ref, () => ({
      show(diff: number) {
        setDelta(diff);
      },
    }), []);

    if (delta <= 0) return null;

    return (
      <Animated.Text style={[styles.deltaChip, { opacity, transform: [{ translateY: y }] }]}>
        {`−${currencySymbol}${formatAmount(delta)}`}
      </Animated.Text>
    );
  },
));

export default function ListScreen() {
  const { currencySymbol } = useCurrencySettings();
  const items                 = useListStore(s => s.items);
  const toggleItem            = useListStore(s => s.toggleItem);
  const clearList             = useListStore(s => s.clearList);
  const lastTripTotal         = useListStore(s => s.lastTripTotal);
  const hasCompletedFirstList = useListStore(s => s.hasCompletedFirstList);
  const groupId               = useListStore(s => s.groupId);
  const groupName             = useListStore(s => s.groupName);
  const activeContext         = useListStore(s => s.activeContext);
  const switchContext         = useListStore(s => s.switchContext);
  const groupNotification     = useListStore(s => s.groupNotification);
  const _activeListId         = useListStore(s => s._activeListId);
  const insets                = useSafeAreaInsets();
  const lastNewId             = useRef<string | null>(null);
  const [shareOpen, setShareOpen]       = useState(false);
  const heroFade    = useRef(new Animated.Value(1)).current;
  const prevContext = useRef(activeContext);

  // Real-time sync — always active so owner and members both see each other's changes
  useRealtimeItems(_activeListId);

  // Hero fade when context switches
  useEffect(() => {
    if (prevContext.current === activeContext) return;
    prevContext.current = activeContext;
    Animated.sequence([
      Animated.timing(heroFade, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(heroFade, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [activeContext]);

  // Nudge toasts — shown for price milestone only (not on tap)
  const [nudgeMsg, setNudgeMsg] = useState('');
  const [nudgeOn, setNudgeOn]   = useState(false);

  // Session-end sheet — shown once after first trip is complete
  const [sessionSheet, setSessionSheet] = useState(false);
  const saveShownRef = useRef(false);
  useEffect(() => {
    isSavePromptShown().then(v => { saveShownRef.current = v; });
  }, []);

  // AHA delta badge — "-₹X" floats up near the total when pending drops
  const deltaY       = useRef(new Animated.Value(0)).current;
  const deltaOpacity = useRef(new Animated.Value(0)).current;
  const saveDeltaRef = useRef<SaveDeltaBadgeHandle>(null);
  // Green-flash Animated value — drives colour directly without setState (no extra render cycle)
  const flashAnim    = useRef(new Animated.Value(0)).current;

  const totalAll = items.reduce((s, i) => s + i.price * (i.count ?? 1), 0);
  const pending  = items.filter(i => !i.checked).reduce((s, i) => s + i.price * (i.count ?? 1), 0);
  const checked  = items.filter(i => i.checked).length;
  const allDone  = items.length > 0 && checked === items.length;

  // Single high-level insight — only when difference is meaningful
  // Progress bar — direct value update, no JS-thread animation (avoids layout thrash)
  const progress     = items.length > 0 ? (checked / items.length) * 100 : 0;
  const progressAnim = useRef(new Animated.Value(progress)).current;
  useEffect(() => { progressAnim.setValue(progress); }, [progress]);

  const pendingPop = usePopOnChange(pending);

  // No scroll-driven layout animations — prevents jank/shaking

  // Stable toggle handler — reads fresh items from store so it doesn't
  // need `items` in its deps (which would recreate it on every tap).
  const handleToggle = useCallback((id: string) => {
    toggleItem(id);
  }, [toggleItem]);

  // Quick add from inline input
  // Show session-end sheet whenever ALL items are done
  const prevAllDone = useRef(false);
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      setTimeout(() => setSessionSheet(true), 1200);
    }
    prevAllDone.current = allDone;
  }, [allDone]);

  // Flash amount green + show delta badge when pending drops
  // Colour interpolations derived from flashAnim — computed once, not re-created on every render
  const amountBigColor    = useRef(flashAnim.interpolate({ inputRange: [0, 1], outputRange: [Colors.textPrimary,   Colors.success] })).current;
  const amountSymbolColor = useRef(flashAnim.interpolate({ inputRange: [0, 1], outputRange: [Colors.textSecondary, Colors.success] })).current;

  const prevPending = useRef(pending);
  useEffect(() => {
    if (prevPending.current > pending && pending >= 0) {
      const diff = prevPending.current - pending;
      prevPending.current = pending;

      // Green flash via Animated — no setState, no extra render cycle
      flashAnim.setValue(1);
      Animated.timing(flashAnim, { toValue: 0, duration: 750, useNativeDriver: false }).start();

      // Delta badge: slide up and fade out
      saveDeltaRef.current?.show(diff);
      deltaY.setValue(0);
      deltaOpacity.setValue(0);
      Animated.sequence([
        Animated.parallel([
          Animated.spring(deltaY,       { toValue: -26, useNativeDriver: true, tension: 180, friction: 8 }),
          Animated.timing(deltaOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        ]),
        Animated.delay(500),
        Animated.timing(deltaOpacity,   { toValue: 0, duration: 240, useNativeDriver: true }),
      ]).start();
    }
    prevPending.current = pending;
  }, [pending]);

  // Count of items with a price set (used for header subtext only)
  // Price nudge — set by the store the moment user saves their first price.
  const priceNudgePending = useListStore(s => s.priceNudgePending);
  const clearPriceNudge   = useListStore(s => s.clearPriceNudge);
  useEffect(() => {
    if (!priceNudgePending) return;
    clearPriceNudge();
    setTimeout(() => {
      setNudgeMsg('Nice — you\'ve started tracking 💰');
      setNudgeOn(true);
    }, 400);
  }, [priceNudgePending]);

  // Human-readable progress text
  const remaining = items.length - checked;
  const progressText = allDone
    ? null                   // header switches to "All bought" state
    : checked === 0
      ? null                 // item count already shows total — no need to repeat
      : remaining === 1
        ? 'Last item!'
        : progress >= 75
          ? 'Almost done!'
          : `${remaining} left`;

  // Insight card — pick the most relevant insight based on current state
const insightText = useMemo(() => {
    return computeCurrentListInsight(items, currencySymbol);
  }, [items]);

  const grouped = useMemo(() => {
    const map: Record<string, typeof items> = {};
    items.forEach(item => {
      (map[item.category] = map[item.category] || []).push(item);
    });
    return map;
  }, [items]);

  const orderedCategories = useMemo(() => {
    const present = new Set(Object.keys(grouped));
    const ordered = CATEGORY_ORDER.filter(c => present.has(c));
    const extras  = Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c));
    return [...ordered, ...extras];
  }, [grouped]);

  const heroTitle = allDone
    ? 'All items checked'
    : totalAll === 0
      ? 'Finish adding your prices'
      : 'Current list total';

  const heroSubtitle = allDone
    ? 'Everything is accounted for.'
    : totalAll === 0
      ? 'Add prices to unlock a live running total.'
      : checked === 0
        ? activeContext === 'group'
          ? `Tracking household spend for ${groupName ?? 'Family'}.`
          : 'Tracking your spend as you add prices.'
        : `${remaining} ${remaining === 1 ? 'item remains' : 'items remain'} · ${currencySymbol}${formatAmount(totalAll)} total`;

  if (items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        {/* Header — empty state */}
        <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
          <View style={styles.headerTopRow}>
            <View />
          </View>
        </View>
        <ShareListSheet visible={shareOpen} onClose={() => setShareOpen(false)} />
        <EmptyState insetTop={8} currencySymbol={currencySymbol} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <SavedToast />
      <NudgeToast
        message={nudgeMsg}
        visible={nudgeOn}
        onHide={() => setNudgeOn(false)}
      />

      {/* Share list sheet (F5) */}
      <ShareListSheet visible={shareOpen} onClose={() => setShareOpen(false)} />

      {/* Session-end sheet — spending summary + repeat + save progress */}
      <SessionEndSheet
        visible={sessionSheet}
        totalSpent={totalAll}
        lastTripTotal={lastTripTotal}
        items={items}
        onClose={() => setSessionSheet(false)}
        onStartNew={() => {
          setSessionSheet(false);
          clearList();
        }}
      />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        {/* Top row: empty left (negative space) + icons right */}
        <View style={styles.headerTopRow}>
          <ContextSwitcher
            activeContext={activeContext}
            groupId={groupId}
            groupNotification={groupNotification}
            onSwitch={switchContext}
            onSharePress={() => setShareOpen(true)}
          />
          <View style={styles.headerIcons}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => Alert.alert('Clear List', 'This will save the current trip and start a fresh list.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: () => clearList() },
              ])}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.clearIcon}>🗑</Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* Amount — 3 states, fades on context switch */}
        <Animated.View style={{ opacity: heroFade }}>
        {allDone ? (
          <View style={styles.amountBlock}>
            <Animated.Text style={[styles.amountBig, styles.amountAccent, { transform: [{ scale: pendingPop }] }]}>
              ✓ All done
            </Animated.Text>
          </View>
        ) : totalAll === 0 ? (
          /* State 1 or 2: no prices */
          <View style={styles.amountBlock}>
            <Text style={styles.amountNoPriceTitle}>
              {items.length === 0 ? 'Start your list' : 'Add your first price'}
            </Text>
            <Text style={styles.amountNoPriceSub}>
              {items.length === 0
                ? 'Tap + to build your list.'
                : 'A live total appears as soon as pricing begins.'}
            </Text>
          </View>
        ) : (
          /* State 3: prices added */
          <View style={styles.amountBlock}>
            <View style={styles.amountNumRow}>
              <Animated.Text style={[styles.amountSymbol, { color: amountSymbolColor }]}>{currencySymbol}</Animated.Text>
              {/* scale (native driver) on View, colour (JS driver) on inner Text — must stay separate */}
              <Animated.View style={{ transform: [{ scale: pendingPop }] }}>
                <Animated.Text style={[styles.amountBig, { color: amountBigColor }]}>
                  {checked === 0 ? formatAmount(totalAll) : formatAmount(pending)}
                </Animated.Text>
              </Animated.View>
              <SaveDeltaBadge ref={saveDeltaRef} y={deltaY} opacity={deltaOpacity} currencySymbol={currencySymbol} />
            </View>
            <Text style={styles.amountLabel}>
              {checked === 0
                ? activeContext === 'group'
                  ? `Household spend · ${groupName ?? 'Family'}`
                  : 'Your total so far'
                : `${currencySymbol}${formatAmount(totalAll)} total · ${items.length - checked} left`}
            </Text>
          </View>
        )}
        </Animated.View>
      </View>

      {/* ── List ───────────────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Insight card — only when data is strong enough ────────────── */}
        {insightText && items.length >= 2 && (
          <View style={styles.insightCard}>
            <Text style={styles.insightPill}>Insight</Text>
            <View style={styles.insightBody}>
              <Text style={styles.insightLine1}>{insightText}</Text>
            </View>
          </View>
        )}

        {/* ── Progress bar ──────────────────────────────────────────────── */}
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressBar,
                allDone && styles.progressBarDone,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 100], outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          {progressText && (
            <Text style={[styles.progressText, progress >= 75 && styles.progressTextNear]}>
              {progressText}
            </Text>
          )}
        </View>

        {orderedCategories.map((cat, catIdx) => (
          <CategoryGroup
            key={cat}
            category={cat}
            items={grouped[cat]}
            onToggle={handleToggle}
            newItemId={lastNewId.current}
            isFirstGroup={catIdx === 0}
          />
        ))}
</ScrollView>
    </View>
  );
}

// ── Context Icons — minimal personal / household switcher ─────────────────────

interface ContextSwitcherProps {
  activeContext:     'personal' | 'group';
  groupId:           string | null;
  groupNotification: boolean;
  onSwitch:          (ctx: 'personal' | 'group') => Promise<void>;
  onSharePress:      () => void;
}

function ContextSwitcher({ activeContext, groupId, groupNotification, onSwitch, onSharePress }: ContextSwitcherProps) {
  const [switching, setSwitching] = React.useState(false);
  const [trackWidth, setTrackWidth] = React.useState(0);
  const thumbProgress = React.useRef(new Animated.Value(activeContext === 'group' ? 1 : 0)).current;

  async function handleSwitch(ctx: 'personal' | 'group') {
    if (switching || ctx === activeContext) return;
    if (ctx === 'group' && !groupId) {
      onSharePress();
      return;
    }

    setSwitching(true);
    try {
      await Promise.resolve(onSwitch(ctx));
    } finally {
      setSwitching(false);
    }
  }

  const personalActive = activeContext === 'personal';
  const groupActive    = activeContext === 'group';
  const thumbWidth = trackWidth > 0 ? (trackWidth - 4) / 2 : 0;
  const thumbTranslate = thumbProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, thumbWidth],
  });

  React.useEffect(() => {
    Animated.spring(thumbProgress, {
      toValue: groupActive ? 1 : 0,
      useNativeDriver: true,
      tension: 220,
      friction: 24,
    }).start();
  }, [groupActive, thumbProgress]);

  return (
    <View
      style={ctxStyles.track}
      onLayout={({ nativeEvent }) => setTrackWidth(nativeEvent.layout.width)}
    >
      {thumbWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            ctxStyles.thumb,
            {
              width: thumbWidth,
              transform: [{ translateX: thumbTranslate }],
            },
          ]}
        />
      )}

      <TouchableOpacity
        style={ctxStyles.segment}
        onPress={() => handleSwitch('personal')}
        activeOpacity={0.7}
        disabled={switching}
      >
        <Text style={[ctxStyles.segmentText, personalActive && ctxStyles.segmentTextActive]}>
          Personal
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={ctxStyles.segment}
        onPress={() => handleSwitch('group')}
        activeOpacity={0.7}
        disabled={switching}
      >
        <Text style={[ctxStyles.segmentText, groupActive && ctxStyles.segmentTextActive]}>
          Family
        </Text>
        {groupNotification && !groupActive && <View style={ctxStyles.segmentBadge} />}
      </TouchableOpacity>
    </View>
  );
}

const ctxStyles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    maxWidth: 184,
    minHeight: 40,
    padding: 2,
    borderRadius: 22,
    backgroundColor: '#EEF2F6',
    borderWidth: 1,
    borderColor: '#DDE4EB',
    position: 'relative',
  },
  thumb: {
    position: 'absolute',
    top: 2,
    left: 2,
    bottom: 2,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  segmentTextActive: {
    color: Colors.textPrimary,
  },
  segmentBadge: {
    position: 'absolute',
    top: 7,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    borderWidth: 1.5,
    borderColor: '#EEF2F6',
  },
});

function EmptyState({ insetTop, currencySymbol }: { insetTop: number; currencySymbol: string }) {
  return (
    <View style={[styles.empty, { paddingTop: insetTop + 8 }]}>

      {/* Illustration — grocery list card, no floating distractions */}
      <View style={styles.emptyIllustration}>
        <View style={styles.listCard}>
          <View style={styles.listRow}>
            <Text style={styles.listRowEmoji}>🥛</Text>
            <Text style={styles.listRowName}>Milk</Text>
            <Text style={styles.listRowPrice}>{currencySymbol}60</Text>
          </View>
          <View style={styles.listDivider} />
          <View style={styles.listRow}>
            <Text style={styles.listRowEmoji}>🥦</Text>
            <Text style={styles.listRowName}>Broccoli</Text>
            <Text style={styles.listRowPrice}>{currencySymbol}40</Text>
          </View>
          <View style={styles.listDivider} />
          <View style={styles.listRow}>
            <Text style={styles.listRowEmoji}>🍎</Text>
            <Text style={styles.listRowName}>Apples</Text>
            <Text style={styles.listRowPrice}>{currencySymbol}90</Text>
          </View>
          <View style={styles.listTotalLine} />
          <View style={styles.listTotalRow}>
            <Text style={styles.listTotalLabel}>Total</Text>
            <Text style={styles.listTotalAmount}>{currencySymbol}190</Text>
          </View>
        </View>
      </View>

      {/* Headline */}
      <Text style={styles.emptyTitle}>
        Build your grocery{'\n'}list in seconds
      </Text>

      {/* Subtext */}
      <Text style={styles.emptySubtitle}>
        Add items, set prices if you want,{'\n'}and keep your total in view
      </Text>

      {/* Primary CTA */}
      <TouchableOpacity
        style={styles.emptyCtaBtn}
        onPress={() => fabEvents.openFAB()}
        activeOpacity={0.85}
      >
        <Text style={styles.emptyCtaText}>Start your list</Text>
      </TouchableOpacity>

      {/* Reassurance */}
      <Text style={styles.emptyReassurance}>No sign-up required</Text>
    </View>
  );
}

// ── List-picker sheet styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },

  // ── Header ─────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: Colors.bg,
  },

  // Top row: context pills left, icons right
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearIcon: { fontSize: 14 },
  amountBlock: { gap: 3 },
  amountNumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  amountSymbol: {
    fontSize: 19,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  amountBig: {
    fontSize: 46,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -2,
    lineHeight: 51,
    fontVariant: ['tabular-nums' as const],
  },
  amountAccent:  { color: Colors.success },
  amountLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: Colors.textSecondary,
  },
  amountNoPriceTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  amountNoPriceSub: {
    fontSize: 13,
    fontWeight: '400',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  deltaChip: {
    marginLeft: 8,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.success,
    fontVariant: ['tabular-nums' as const],
  },

  // ── Insight card ───────────────────────────────────────────────────────
  insightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F6F8',
    borderRadius: 14,
    marginHorizontal: Spacing.md,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  insightPill: {
    marginRight: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#E8EDF2',
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    overflow: 'hidden',
  },
  insightBody:   { flex: 1, gap: 3 },
  insightLine1:  { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  insightLine2:  { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  insightReviewBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  insightReviewText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },

  // ── Quick add input ────────────────────────────────────────────────────
  quickAddWrap: {
    paddingHorizontal: Spacing.md,
    paddingTop: 12,
    paddingBottom: 4,
  },
  quickAddInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // ── Progress ───────────────────────────────────────────────────────────
  progressWrap: {
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#E8EDF5',
    overflow: 'hidden',
  },
  progressBar: {
    position: 'absolute',
    top: 0, left: 0,
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  progressBarDone: { backgroundColor: Colors.success },
  progressText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  progressTextNear: { color: Colors.success },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 180 },

  // ── Empty state ────────────────────────────────────────────────────────────
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg,
    paddingHorizontal: 32,
    // paddingBottom biases visual centre upward; larger = higher
    paddingBottom: 120,
  },

  // Illustration container — zero gap to headline
  emptyIllustration: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },

  // Grocery list card — strong visual anchor, barely-there shadow
  listCard: {
    width: 222,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 20,
    elevation: 2,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  listRowEmoji: { fontSize: 14, width: 20 },
  listRowName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#444',
    marginLeft: 6,
  },
  listRowPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  listDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EBEBED',
    marginLeft: 26,
  },
  listTotalLine: {
    height: 1,
    backgroundColor: '#E8E8ED',
    marginTop: 8,
    marginBottom: 8,
  },
  listTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listTotalLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#AAA',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  listTotalAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },

  // Headline
  emptyTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.6,
    lineHeight: 34,
    marginBottom: 8,
  },

  // Subtext
  emptySubtitle: {
    fontSize: 15,
    fontWeight: '400',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 20,
  },

  // Primary CTA — full width, blue, rounded, minimal shadow
  emptyCtaBtn: {
    alignSelf: 'stretch',
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 10,
  },
  emptyCtaText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },

  // Reassurance line — clearly visible, still secondary
  emptyReassurance: {
    fontSize: 12,
    fontWeight: '500',
    color: '#5E636D',
    marginBottom: 24,
  },

  // Single feature chip
  featurePill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  featurePillText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
});


