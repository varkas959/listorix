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
  Keyboard,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Share,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useListStore } from '../../src/store/useListStore';
import { ListItem } from '../../src/components/list/ListItem';
import { Colors } from '../../src/constants/colors';
import { Spacing } from '../../src/constants/spacing';
import { SavedToast } from '../../src/components/ui/SavedToast';
import { NudgeToast } from '../../src/components/ui/NudgeToast';
import { SessionEndSheet } from '../../src/components/ui/SessionEndSheet';
import { ShareListSheet } from '../../src/components/ui/ShareListSheet';
import { useRealtimeItems } from '../../src/hooks/useRealtimeItems';
import { isSavePromptShown } from '../../src/services/storage';
import { parseBulkText } from '../../src/services/VoiceParser';
import { formatAmount, useCurrencySettings } from '../../src/utils/currency';
import { appendLaunchDiagnostic } from '../../src/services/launchDiagnostics';
import { IconShareArrow } from '../../src/components/ui/Icons';
import type { GroceryItem, ParsedItem } from '../../src/types';

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
    const category = item.category?.trim() || 'Other';
    if (!catMap[category]) catMap[category] = { count: 0, spend: 0 };
    catMap[category].count++;
    catMap[category].spend += item.price * (item.count ?? 1);
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
    const name = item.name?.trim() || 'Untitled item';
    const lineTotal = item.price * (item.count ?? 1);
    itemSpendMap[name] = (itemSpendMap[name] ?? 0) + lineTotal;
    itemPriceMap[name] = [...(itemPriceMap[name] ?? []), item.price];
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
  const router = useRouter();
  const { currencySymbol } = useCurrencySettings();
  const hydrated              = useListStore(s => s.hydrated);
  const items                 = useListStore(s => s.items);
  const addItem               = useListStore(s => s.addItem);
  const toggleItem            = useListStore(s => s.toggleItem);
  const clearList             = useListStore(s => s.clearList);
  const lastTripTotal         = useListStore(s => s.lastTripTotal);
  const hasCompletedFirstList = useListStore(s => s.hasCompletedFirstList);
  const groupId               = useListStore(s => s.groupId);
  const groupName             = useListStore(s => s.groupName);
  const groupMembers          = useListStore(s => s.groupMembers);
  const inviteCode            = useListStore(s => s.inviteCode);
  const activeContext         = useListStore(s => s.activeContext);
  const switchContext         = useListStore(s => s.switchContext);
  const leaveGroup            = useListStore(s => s.leaveGroup);
  const groupNotification     = useListStore(s => s.groupNotification);
  const pendingInviteCode     = useListStore(s => s.pendingInviteCode);
  const _activeListId         = useListStore(s => s._activeListId);
  const insets                = useSafeAreaInsets();
  const lastNewId             = useRef<string | null>(null);
  const [shareOpen, setShareOpen]       = useState(false);
  const heroFade    = useRef(new Animated.Value(1)).current;
  const prevContext = useRef(activeContext);
  const hasActiveFamily = activeContext === 'group' && Boolean(groupId);

  const handleDirectFamilyShare = useCallback(async () => {
    if (!groupId) {
      return;
    }
    if (!inviteCode) {
      Alert.alert('Share link unavailable', 'Please try again in a moment.');
      return;
    }

    const joinLink = `https://listorix.com/join/index.html?code=${encodeURIComponent(inviteCode)}`;
    try {
      await Share.share({
        message: `Join my household grocery list on Listorix:\n${joinLink}`,
      });
    } catch {
      // no-op: user may cancel the system share sheet
    }
  }, [groupId, inviteCode]);

  const handleLeaveHousehold = useCallback(() => {
    Alert.alert(
      'Leave Household?',
      'You’ll lose access to shared items.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveGroup();
            } catch {
              Alert.alert('Could not leave household', 'Please try again in a moment.');
            }
          },
        },
      ],
    );
  }, [leaveGroup]);

  const openFamilyMenu = useCallback(() => {
    if (!hasActiveFamily) return;
    router.push('/household');
  }, [hasActiveFamily, router]);

  useEffect(() => {
    appendLaunchDiagnostic(
      'home_mount',
      `hydrated=${hydrated ? 'yes' : 'no'} ctx=${activeContext} items=${items.length} group=${groupId ?? 'none'}`
    ).catch(() => undefined);
  }, []);

  useEffect(() => {
    appendLaunchDiagnostic(
      'home_state',
      `hydrated=${hydrated ? 'yes' : 'no'} ctx=${activeContext} items=${items.length} group=${groupId ?? 'none'} share=${shareOpen ? 'open' : 'closed'}`
    ).catch(() => undefined);
  }, [hydrated, activeContext, items.length, groupId, shareOpen]);

  useEffect(() => {
    if (!pendingInviteCode || shareOpen) return;
    setShareOpen(true);
  }, [pendingInviteCode, shareOpen]);

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

  if (!hydrated) {
    return (
      <View style={[styles.screen, styles.loadingScreen]}>
        <View style={[styles.loadingCard, { marginTop: insets.top + 24 }]}>
          <View style={styles.loadingBarShort} />
          <View style={styles.loadingBarTall} />
          <View style={styles.loadingBarWide} />
        </View>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        {/* Header — empty state */}
        <View style={[styles.header, styles.emptyHeader, { paddingTop: insets.top + 4 }]}>
          <View style={styles.headerTopRow}>
            <ContextSwitcher
              activeContext={activeContext}
              groupId={groupId}
              groupNotification={groupNotification}
              onSwitch={switchContext}
              onSharePress={() => setShareOpen(true)}
            />
            <View style={styles.headerIcons}>
              {hasActiveFamily && (
                <>
                  <TouchableOpacity
                    style={styles.headerIconBtn}
                    onPress={handleDirectFamilyShare}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <IconShareArrow size={16} color={Colors.primary} strokeWidth={2} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.headerIconBtn}
                    onPress={openFamilyMenu}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.menuDots}>⋯</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
        {shareOpen && (
          <ShareListSheet visible={shareOpen} onClose={() => setShareOpen(false)} />
        )}
        <ActionFirstEmptyState
          insetTop={8}
          onAddItems={addItem}
        />
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
      {shareOpen && (
        <ShareListSheet visible={shareOpen} onClose={() => setShareOpen(false)} />
      )}

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
            {hasActiveFamily && (
              <>
                <TouchableOpacity
                  style={styles.headerIconBtn}
                  onPress={handleDirectFamilyShare}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <IconShareArrow size={16} color={Colors.primary} strokeWidth={2} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerIconBtn}
                  onPress={openFamilyMenu}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.menuDots}>⋯</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => Alert.alert('Delete List', 'This will permanently delete all current items from this list.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => clearList() },
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

        <View style={styles.flatListCard}>
          {items.map((item, index) => (
            <React.Fragment key={item.id}>
              {index > 0 && <View style={styles.flatListDivider} />}
              <ListItem
                item={item}
                onToggle={handleToggle}
                isNew={item.id === lastNewId.current}
                isFirst={index === 0}
              />
            </React.Fragment>
          ))}
        </View>
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
    if (switching) return;
    if (ctx === activeContext) return;
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
    maxWidth: 174,
    minHeight: 38,
    padding: 2,
    borderRadius: 20,
    backgroundColor: '#F6F8FB',
    borderWidth: 1,
    borderColor: '#E6EBF2',
    position: 'relative',
  },
  thumb: {
    position: 'absolute',
    top: 2,
    left: 2,
    bottom: 2,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  segment: {
    flex: 1,
    minHeight: 34,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  segmentText: {
    fontSize: 12.5,
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

function ActionFirstEmptyState({
  insetTop,
  onAddItems,
}: {
  insetTop: number;
  onAddItems: (item: ParsedItem) => void;
}) {
  const inputRef = React.useRef<TextInput>(null);
  const [text, setText] = React.useState('');
  const [keyboardOpen, setKeyboardOpen] = React.useState(false);

  const parsedItems = React.useMemo(
    () => (text.trim() ? parseBulkText(text) : []),
    [text],
  );

  const hasParsedItems = parsedItems.length > 0;

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      const onChange = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
        const screenHeight = Dimensions.get('window').height;
        const keyboardHeight = Math.max(0, screenHeight - event.endCoordinates.screenY);
        setKeyboardOpen(keyboardHeight > 0);
      });
      const onHide = Keyboard.addListener('keyboardWillHide', () => {
        setKeyboardOpen(false);
      });
      return () => {
        onChange.remove();
        onHide.remove();
      };
    }

    const onShow = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardOpen(true);
    });
    const onHide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardOpen(false);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  function handleAddItems() {
    if (!hasParsedItems) return;
    parsedItems.forEach((item) => onAddItems(item));
    setText('');
    inputRef.current?.blur();
    Keyboard.dismiss();
  }

  function dismissInput() {
    inputRef.current?.blur();
    Keyboard.dismiss();
  }

  const ctaLabel = `Add ${parsedItems.length} ${parsedItems.length === 1 ? 'item' : 'items'}`;

  return (
    <Pressable
      style={[
        styles.empty,
        { paddingTop: insetTop, paddingBottom: keyboardOpen ? 12 : 128 },
      ]}
      onPress={dismissInput}
    >
      <KeyboardAvoidingView
        style={styles.emptyContent}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
      >
        <View style={styles.emptyIllustration}>
          <TouchableOpacity
            style={styles.primaryInputCard}
            activeOpacity={1}
            onPress={() => inputRef.current?.focus()}
          >
            <TextInput
              ref={inputRef}
              style={styles.emptyInput}
              value={text}
              onChangeText={setText}
              multiline
              autoFocus
              placeholder={'Add items (one per line)\n\nmilk\n1kg sugar\nbiscuits'}
              placeholderTextColor="#B5BFCC"
              textAlignVertical="top"
              autoCapitalize="sentences"
              autoCorrect={false}
              selectionColor={Colors.primary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.emptyBottomArea}>
          {hasParsedItems && (
            <TouchableOpacity
              style={styles.emptyCtaBtn}
              onPress={handleAddItems}
              activeOpacity={0.88}
            >
              <Text style={styles.emptyCtaText}>{ctaLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  loadingScreen: {
    paddingHorizontal: Spacing.md,
  },
  loadingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 20,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  loadingBarShort: {
    width: 112,
    height: 12,
    borderRadius: 999,
    backgroundColor: '#E9EEF4',
  },
  loadingBarTall: {
    width: 164,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EEF3F8',
  },
  loadingBarWide: {
    width: '100%',
    height: 14,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },

  // ── Header ─────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: Colors.bg,
  },
  emptyHeader: {
    paddingBottom: 6,
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
  menuDots: {
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: -2,
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
  flatListCard: {
    marginHorizontal: Spacing.md,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 4,
  },
  flatListDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EBEBED',
    marginLeft: 50,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 180 },

  // ── Empty state ────────────────────────────────────────────────────────────
  empty: {
    flex: 1,
    backgroundColor: Colors.bg,
    paddingHorizontal: 18,
    paddingBottom: 128,
  },
  emptyContent: {
    flex: 1,
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    paddingTop: 4,
  },
  emptyIllustration: {
    width: '100%',
    marginBottom: 12,
  },
  primaryInputCard: {
    width: '100%',
    minHeight: 214,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7ECF3',
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
    elevation: 2,
  },

  // Grocery list card — strong visual anchor, barely-there shadow
  notePreview: {
    width: 244,
    backgroundColor: '#F4F6F9',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5EAF1',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 10,
  },
  notePreviewCard: {
    width: '100%',
    backgroundColor: '#F4F6F9',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5EAF1',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.03,
    shadowRadius: 14,
    elevation: 1,
  },
  notePreviewCardFocused: {
    borderColor: '#C9D8EA',
    shadowOpacity: 0.06,
  },
  notePreviewTopBar: {
    minHeight: 26,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notePreviewHandle: {
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D6DEE8',
  },
  noteDismissBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#E8EEF6',
  },
  noteDismissText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4C5D72',
    letterSpacing: -0.1,
  },
  noteDismissSpacer: {
    width: 44,
    height: 1,
  },
  emptyInput: {
    minHeight: 160,
    paddingHorizontal: 0,
    paddingVertical: 0,
    fontSize: 18,
    lineHeight: 30,
    fontWeight: '400',
    color: '#2C3440',
    letterSpacing: -0.2,
    textAlignVertical: 'top',
  },
  notePreviewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  notePreviewPlaceholder: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
    color: '#95A0AF',
  },
  notePreviewCursor: {
    width: 2,
    height: 16,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  listRowEmoji: { fontSize: 14, width: 20 },
  notePreviewText: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '500',
    color: '#2C3440',
    letterSpacing: -0.2,
  },
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
    backgroundColor: '#E1E7EF',
    marginLeft: 0,
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

  emptyBottomArea: {
    marginTop: 'auto',
    paddingTop: 8,
  },

  emptyCtaBtn: {
    alignSelf: 'stretch',
    width: '100%',
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 4,
  },
  emptyCtaText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  emptySecondaryCta: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#EEF3F8',
    borderWidth: 1,
    borderColor: '#E1E8F0',
  },
  emptySecondaryCtaText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#516173',
    letterSpacing: -0.1,
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

/*
  const handleDirectFamilyShare = useCallback(async () => {
    if (!groupId || !inviteCode) {
      setShareOpen(true);
      return;
    }

    const joinLink = `https://listorix.com/join/index.html?code=${encodeURIComponent(inviteCode)}`;
    try {
      await Share.share({
        message: `Join my household grocery list on Listorix:\n${joinLink}`,
      });
    } catch {
      // no-op: user may cancel the system share sheet
    }
  }, [groupId, inviteCode]);

  const handleLeaveHousehold = useCallback(() => {
    Alert.alert(
      'Leave Household?',
      'You’ll lose access to shared items.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveGroup();
            } catch {
              Alert.alert('Could not leave household', 'Please try again in a moment.');
            }
          },
        },
      ],
    );
  }, [leaveGroup]);

  const openFamilyMenu = useCallback(() => {
    if (!hasActiveFamily) return;

    const viewMembers = () => setShareOpen(true);
    const leaveFamily = () => handleLeaveHousehold();

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['View members', 'Leave household', 'Cancel'],
          cancelButtonIndex: 2,
          destructiveButtonIndex: 1,
          title: 'Family',
        },
        (buttonIndex) => {
          if (buttonIndex === 0) viewMembers();
          if (buttonIndex === 1) leaveFamily();
        },
      );
      return;
    }

    Alert.alert('Family', undefined, [
      { text: 'View members', onPress: viewMembers },
      { text: 'Leave household', style: 'destructive', onPress: leaveFamily },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [hasActiveFamily, handleLeaveHousehold]);
*/
