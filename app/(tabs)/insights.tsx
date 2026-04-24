import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Dimensions, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { Colors, CategoryColors } from '../../src/constants/colors';
import { Spacing, Shadow } from '../../src/constants/spacing';
import { useAuthStore } from '../../src/store/useAuthStore';
import { getTripHistory, type RemoteTrip } from '../../src/services/api';
import { loadHistory, getDeletedTripIds } from '../../src/services/storage';
import type { TripSummary } from '../../src/types';
import { formatAmount, formatMonth, useCurrencySettings } from '../../src/utils/currency';

const SCREEN_W = Dimensions.get('window').width;
const CARD_W   = SCREEN_W - Spacing.md * 2;
const RED      = '#E53E3E';
const GREEN    = '#27AE60';
const AMBER    = '#D97706';
const BG       = '#F7F8FA';

type InsightsRangeKey = 'this_month' | 'last_month' | 'last_3_months' | 'all_time';

const RANGE_OPTIONS: { key: InsightsRangeKey; label: string }[] = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_3_months', label: 'Last 3 months' },
  { key: 'all_time', label: 'All time' },
];

// ── Data helpers ──────────────────────────────────────────────────────────────

function getCatTotals(trips: TripSummary[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const trip of trips)
    for (const item of trip.items) {
      const amt = item.price * (item.count ?? 1);
      if (amt > 0) t[item.category] = (t[item.category] ?? 0) + amt;
    }
  return t;
}

/** Average monthly spend from ALL complete months (excludes current month). */
function getUsualMonthlySpend(trips: TripSummary[]): number | null {
  const now = new Date();
  const currKey = `${now.getFullYear()}-${now.getMonth()}`;
  const byMonth: Record<string, number> = {};
  for (const trip of trips) {
    const d = new Date(trip.date);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    if (k !== currKey) byMonth[k] = (byMonth[k] ?? 0) + trip.total;
  }
  const vals = Object.values(byMonth);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

function getMonthlyData(trips: RemoteTrip[], locale: string) {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d   = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const lbl = d.toLocaleDateString(locale, { month: 'short' });
    const amt = trips
      .filter(t => { const td = new Date(t.completedAt); return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth(); })
      .reduce((s, t) => s + t.total, 0);
    return { label: lbl, amount: amt, isCurrent: i === 5 };
  });
}

interface ScoredInsight {
  text: string;
  score: number;  // higher = more important, shown first
}

/**
 * Generates every possible insight from the data, scores each one by
 * signal strength, deduplicates by subject, and returns the top 3.
 *
 * Priority tiers (reflected in base score):
 *   P1 200+  — category dominance (where the bulk of money goes)
 *   P2 140+  — item-level outliers (expensive, surprising)
 *   P3  80+  — behavioural patterns (frequency, habits)
 *   P4  20+  — general context (avg trip, diversity)
 */
function computeRankedHighlights(
  trips: TripSummary[],
  catSorted: { cat: string; amount: number }[],
  currencySymbol: string,
): string[] {
  if (trips.length === 0 || catSorted.length === 0) return [];

  const candidates: ScoredInsight[] = [];
  const allItems   = trips.flatMap(t => t.items);
  const grandTotal = catSorted.reduce((s, c) => s + c.amount, 0);

  // ── P1: Category dominance ───────────────────────────────────────────────

  const topCat = catSorted[0];
  if (grandTotal > 0) {
    const topPct = Math.round((topCat.amount / grandTotal) * 100);
    // Only surface if it truly dominates (≥ 30 %)
    if (topPct >= 30) {
      candidates.push({
        text:  `${topCat.cat} makes up ${topPct}% of your total spend — the single biggest slice.`,
        score: 200 + topPct,           // 230–300 for 30–100 %
      });
    }

    // Top-2 concentration
    if (catSorted.length >= 2) {
      const top2Pct = Math.round(((catSorted[0].amount + catSorted[1].amount) / grandTotal) * 100);
      if (top2Pct >= 65) {
        candidates.push({
          text:  `${catSorted[0].cat} and ${catSorted[1].cat} together make up ${top2Pct}% of spending.`,
          score: 200 + top2Pct * 0.4,   // 226–240
        });
      }
    }
  }

  // ── P2: Item outliers ────────────────────────────────────────────────────

  // Build per-item price stats
  const itemPriceMap: Record<string, number[]> = {};
  for (const item of allItems)
    if (item.price > 0)
      itemPriceMap[item.name] = [...(itemPriceMap[item.name] ?? []), item.price];

  const itemStats = Object.entries(itemPriceMap).map(([name, prices]) => ({
    name,
    avg:    Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
    max:    Math.max(...prices),
    min:    Math.min(...prices),
    count:  prices.length,
  })).sort((a, b) => b.avg - a.avg);

  // Median item price — used to judge "outlier-ness"
  const sortedAvgs = [...itemStats].sort((a, b) => a.avg - b.avg);
  const medianPrice = sortedAvgs[Math.floor(sortedAvgs.length / 2)]?.avg ?? 1;

  if (itemStats[0]) {
    const ratio = itemStats[0].avg / Math.max(medianPrice, 1);
    if (ratio >= 3) {
      // True outlier — costs 3× the typical item
      candidates.push({
        text:  `${itemStats[0].name} costs ${currencySymbol}${itemStats[0].avg} — ${Math.round(ratio)}× your typical item price.`,
        score: 140 + ratio * 5,         // 155+ for big outliers
      });
    } else {
      candidates.push({
        text:  `${itemStats[0].name} is your most expensive item at ${currencySymbol}${itemStats[0].avg} on average.`,
        score: 140 + Math.min(itemStats[0].avg / 10, 20),
      });
    }
  }

  // Item with high price variance (you're paying different amounts each time)
  const variantItems = itemStats.filter(i => i.count >= 2 && i.max - i.min >= 20);
  if (variantItems[0]) {
    const spread = variantItems[0].max - variantItems[0].min;
    candidates.push({
      text:  `${variantItems[0].name} price varies — you've paid between ${currencySymbol}${variantItems[0].min} and ${currencySymbol}${variantItems[0].max}.`,
      score: 140 + spread * 0.3,
    });
  }

  // ── P3: Behavioural patterns ─────────────────────────────────────────────

  // Trip-level frequency
  const tripFreq: Record<string, number> = {};
  for (const trip of trips) {
    const seen = new Set<string>();
    for (const item of trip.items)
      if (!seen.has(item.name)) { seen.add(item.name); tripFreq[item.name] = (tripFreq[item.name] ?? 0) + 1; }
  }
  const sortedFreq = Object.entries(tripFreq).sort((a, b) => b[1] - a[1]);

  // Most frequent item
  if (sortedFreq[0] && trips.length >= 2) {
    const [fname, fcount] = sortedFreq[0];
    const fpct  = Math.round((fcount / trips.length) * 100);
    const favg  = itemPriceMap[fname]
      ? Math.round(itemPriceMap[fname].reduce((s, p) => s + p, 0) / itemPriceMap[fname].length)
      : 0;
    const priceNote = favg > 0 ? ` at ~${currencySymbol}${favg} each time` : '';
    candidates.push({
      text:  `${fname} is in ${fcount} of your ${trips.length} trips (${fpct}%)${priceNote}.`,
      score: 80 + fpct * 0.4,           // 80–120
    });
  }

  // "Always together" — two items that co-occur in most trips
  if (trips.length >= 3 && sortedFreq.length >= 2) {
    const [a] = sortedFreq[0];
    const [b] = sortedFreq[1];
    const coCount = trips.filter(t => {
      const names = new Set(t.items.map(i => i.name));
      return names.has(a) && names.has(b);
    }).length;
    const coPct = Math.round((coCount / trips.length) * 100);
    if (coPct >= 60) {
      candidates.push({
        text:  `${a} and ${b} appear together in ${coPct}% of your trips.`,
        score: 80 + coPct * 0.3,
      });
    }
  }

  // Habitual high-cost item (frequent AND expensive)
  const habitual = itemStats.find(i => {
    const f = tripFreq[i.name] ?? 0;
    return f >= Math.ceil(trips.length * 0.5) && i.avg >= 50;
  });
  if (habitual) {
    const hFreq = tripFreq[habitual.name];
    const hPct  = Math.round((hFreq / trips.length) * 100);
    candidates.push({
      text:  `${habitual.name} is a recurring cost — bought in ${hPct}% of trips at ${currencySymbol}${habitual.avg} each.`,
      score: 90 + hPct * 0.3 + habitual.avg * 0.1,
    });
  }

  // ── P4: General context ──────────────────────────────────────────────────

  // Average trip value
  if (trips.length >= 2) {
    const avgTrip = Math.round(trips.reduce((s, t) => s + t.total, 0) / trips.length);
    candidates.push({ text: `Your average trip costs ${currencySymbol}${formatAmount(avgTrip)}.`, score: 20 });
  }

  // Category breadth
  if (catSorted.length >= 5) {
    candidates.push({
      text:  `You shop across ${catSorted.length} categories.`,
      score: 10,
    });
  }

  // ── Rank + deduplicate ───────────────────────────────────────────────────

  // Sort descending by score
  candidates.sort((a, b) => b.score - a.score);

  // Deduplicate: skip any insight whose first "subject word" already appeared
  // (prevents two insights both leading with e.g. "Paneer" or "Dairy")
  const usedSubjects = new Set<string>();
  const final: string[] = [];

  for (const c of candidates) {
    if (final.length >= 3) break;
    // Subject = first word of the sentence (item name or category name)
    const subject = c.text.split(/\s+/)[0];
    if (!usedSubjects.has(subject)) {
      usedSubjects.add(subject);
      final.push(c.text);
    }
  }

  return final;
}

function localToRemote(t: TripSummary): RemoteTrip {
  return { id: t.id, completedAt: t.date, total: t.total, itemCount: t.items.length, categories: [...new Set(t.items.map(i => i.category))] };
}

function getRangeBounds(range: InsightsRangeKey, now: Date): { start: Date | null; end: Date | null } {
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (range) {
    case 'this_month':
      return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) };
    case 'last_month':
      return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
    case 'last_3_months':
      return { start: new Date(year, month - 2, 1), end: new Date(year, month + 1, 1) };
    default:
      return { start: null, end: null };
  }
}

function isWithinRange(timestamp: number, range: InsightsRangeKey, now: Date): boolean {
  const { start, end } = getRangeBounds(range, now);
  if (!start || !end) return true;
  return timestamp >= start.getTime() && timestamp < end.getTime();
}

function getRangeLabel(range: InsightsRangeKey, locale: string, now: Date): string {
  switch (range) {
    case 'this_month':
      return now.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    case 'last_month':
      return new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString(locale, {
        month: 'long',
        year: 'numeric',
      });
    case 'last_3_months':
      return 'Last 3 months';
    default:
      return 'All time';
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const { currencySymbol, locale } = useCurrencySettings();
  const insets   = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [localTrips,  setLocalTrips]  = useState<TripSummary[]>([]);
  const [mergedTrips, setMergedTrips] = useState<RemoteTrip[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [selectedRange, setSelectedRange] = useState<InsightsRangeKey>('this_month');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        setLoading(true);
        const [allLocal, deletedIds] = await Promise.all([
          loadHistory(),
          getDeletedTripIds(),
        ]);
        // Filter out deleted trips so insights match history tab
        const local        = allLocal.filter(t => !deletedIds.has(t.id));
        const deletedLocal = allLocal.filter(t =>  deletedIds.has(t.id));
        if (!cancelled) setLocalTrips(local);

        const localR = local.map(localToRemote);
        if (user) {
          const remote  = await getTripHistory(user.id);
          const seen    = new Set<string>();
          const deduped = localR.filter(t => { const k = `${new Date(t.completedAt).toDateString()}-${t.total}`; if (seen.has(k)) return false; seen.add(k); return true; });
          const merged  = [...deduped];
          for (const r of remote) {
            if (deletedIds.has(r.id)) continue;
            const rDay = new Date(r.completedAt).toDateString();
            if (deduped.some(l => new Date(l.completedAt).toDateString() === rDay && Math.abs(l.total - r.total) <= 5)) continue;
            // Also skip if it matches a deleted local trip (remote IDs differ from local IDs)
            if (deletedLocal.some(l => new Date(l.date).toDateString() === rDay && Math.abs(l.total - r.total) <= 5)) continue;
            merged.push(r);
          }
          if (!cancelled) setMergedTrips(merged.sort((a, b) => b.completedAt - a.completedAt));
        } else {
          if (!cancelled) setMergedTrips(localR);
        }
        if (!cancelled) setLoading(false);
      }
      load();
      return () => { cancelled = true; };
    }, [user]),
  );

  // ── Derived ──────────────────────────────────────────────────────────────────
  const now  = new Date();
  const rangeLabel = getRangeLabel(selectedRange, locale, now);
  const filteredLocalTrips = localTrips.filter(t => isWithinRange(t.date, selectedRange, now));
  const filteredMergedTrips = mergedTrips.filter(t => isWithinRange(t.completedAt, selectedRange, now));
  const currTotal  = filteredMergedTrips.reduce((s, t) => s + t.total, 0);

  // Top category in the selected period — for the primary card pill
  const currCat      = getCatTotals(filteredLocalTrips);
  const topCatEntry  = Object.entries(currCat).sort((a, b) => b[1] - a[1])[0];
  const topCatName   = topCatEntry ? topCatEntry[0] : null;
  const topCatAmount = topCatEntry ? Math.round(topCatEntry[1]) : 0;

  // Category totals in the selected range
  const catMap    = getCatTotals(filteredLocalTrips);
  const catSorted = Object.entries(catMap).map(([cat, amount]) => ({ cat, amount: Math.round(amount) })).sort((a, b) => b.amount - a.amount);
  const maxCatAmt = catSorted[0]?.amount ?? 1;

  // Monthly trend — only show if ≥ 3 months have data inside the selected range
  const monthlyData    = getMonthlyData(filteredMergedTrips, locale);
  const monthsWithData = monthlyData.filter(d => d.amount > 0).length;
  const showTrend      = monthsWithData >= 3;
  const maxMonth       = Math.max(...monthlyData.map(d => d.amount), 1);
  const trendPct       = monthlyData[4].amount > 0
    ? Math.round(((monthlyData[5].amount - monthlyData[4].amount) / monthlyData[4].amount) * 100)
    : null;

  // Spending highlights — ranked by signal strength, top 3
  const highlights = computeRankedHighlights(filteredLocalTrips, catSorted, currencySymbol);

  // Quick stats
  const totalSpend = filteredMergedTrips.reduce((s, t) => s + t.total, 0);
  const totalItems = filteredMergedTrips.reduce((s, t) => s + t.itemCount, 0);
  const avgSpend   = filteredMergedTrips.length > 0 ? Math.round(totalSpend / filteredMergedTrips.length) : 0;

  if (loading) return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
    </View>
  );

  if (localTrips.length === 0 && mergedTrips.length === 0) return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.center}>
        <Text style={styles.emptyEmoji}>📊</Text>
        <Text style={styles.emptyTitle}>No data yet</Text>
        <Text style={styles.emptyBody}>Complete your first shopping trip and insights will appear here.</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>

        <Text style={styles.pageTitle}>Spending Insights</Text>
        <View style={styles.rangePillsWrap}>
          {RANGE_OPTIONS.map((option) => {
            const active = option.key === selectedRange;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.rangePill, active && styles.rangePillActive]}
                onPress={() => setSelectedRange(option.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.rangePillText, active && styles.rangePillTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── SECTION 1: Primary Insight ───────────────────────────────────── */}
        {currTotal > 0 && (
          <PrimaryCard
            currTotal={currTotal}
            topCatName={topCatName}
            topCatAmount={topCatAmount}
            currencySymbol={currencySymbol}
            locale={locale}
            rangeLabel={rangeLabel}
            selectedRange={selectedRange}
          />
        )}

        {/* ── SECTION 2: Category Spending ─────────────────────────────────── */}
        {catSorted.length > 0 && (
          <View style={styles.card}>
            <SectionHeader emoji="🗂" title="Where your money goes" />
            {catSorted.slice(0, 7).map((d, i) => (
              <CategoryRow key={d.cat} cat={d.cat} amount={d.amount} maxAmount={maxCatAmt} isTop={i === 0} currencySymbol={currencySymbol} />
            ))}
          </View>
        )}

        {/* ── SECTION 3: Monthly Trend (only if ≥ 3 months) ───────────────── */}
        {showTrend && (
          <View style={styles.card}>
            <View style={styles.row}>
              <SectionHeader emoji="📈" title="Monthly trend" />
              {trendPct !== null && (
                <View style={[styles.badge, trendPct > 0 ? styles.badgeRed : styles.badgeGreen]}>
                  <Text style={[styles.badgeText, { color: trendPct > 0 ? RED : GREEN }]}>
                    {trendPct > 0 ? '↑' : '↓'} {Math.abs(trendPct)}% vs last month
                  </Text>
                </View>
              )}
            </View>
            <MonthlyChart data={monthlyData} maxVal={maxMonth} />
          </View>
        )}

        {/* ── SECTION 4: Spending Highlights (edge-to-edge) ────────────────── */}
        {highlights.length > 0 && (
          <View style={styles.highlightsBlock}>
            <View style={styles.highlightsHeader}>
              <SectionHeader emoji="✨" title="Spending highlights" />
            </View>
            {highlights.map((text, i) => (
              <View key={i} style={[
                styles.highlightRow,
                i < highlights.length - 1 && styles.highlightRowBorder,
              ]}>
                <Text style={i === 0 ? styles.highlightTextPrimary : styles.highlightTextSecondary}>
                  {text}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── SECTION 5: Quick Stats (neutral, compact) ────────────────────── */}
        <View style={styles.statsRow}>
          {[
            { label: 'Total Trips',  value: String(filteredMergedTrips.length) },
            { label: 'Avg / Trip',   value: `${currencySymbol}${formatAmount(avgSpend)}` },
            { label: 'Items Bought', value: String(totalItems)          },
          ].map(s => (
            <View key={s.label} style={[styles.statCard, Shadow.card]}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ emoji, title }: { emoji: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconCircle}>
        <Text style={styles.sectionEmoji}>{emoji}</Text>
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
  );
}

function PrimaryCard({ currTotal, topCatName, topCatAmount, currencySymbol, locale, rangeLabel, selectedRange }: {
  currTotal: number;
  topCatName: string | null;
  topCatAmount: number;
  currencySymbol: string;
  locale: string;
  rangeLabel: string;
  selectedRange: InsightsRangeKey;
}) {
  const catColor = topCatName ? (CategoryColors[topCatName] ?? Colors.primary) : Colors.primary;
  const subLabel = selectedRange === 'all_time' ? 'spent across your full history' : `spent in ${rangeLabel}`;
  return (
    <View style={styles.primaryCard}>
      <View style={styles.primaryIconRow}>
        <Text style={styles.primaryEmoji}>🧾</Text>
        <Text style={styles.primaryMonth}>{rangeLabel}</Text>
      </View>
      <Text style={styles.primaryHeadline}>
        {currencySymbol}{formatAmount(currTotal)}
      </Text>
      <Text style={styles.primarySubLabel}>{subLabel}</Text>
      {topCatName && topCatAmount > 0 && (
        <View style={[styles.primaryCatPill, { backgroundColor: `${catColor}18`, borderColor: `${catColor}40` }]}>
          <View style={[styles.primaryCatDot, { backgroundColor: catColor }]} />
          <View>
            <Text style={[styles.primaryCatText, { color: catColor }]}>
              Most of your money is going to {topCatName}
            </Text>
            <Text style={styles.primaryCatSub}>
              {currencySymbol}{formatAmount(topCatAmount)} out of {currencySymbol}{formatAmount(currTotal)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function CategoryRow({ cat, amount, maxAmount, isTop, currencySymbol }: {
  cat: string; amount: number; maxAmount: number; isTop: boolean; currencySymbol: string;
}) {
  const pct      = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
  const catColor = CategoryColors[cat] ?? Colors.primary;
  return (
    <View style={styles.catRow}>
      <View style={styles.catNameWrap}>
        <Text style={[styles.catName, isTop && styles.catNameBold]} numberOfLines={1}>{cat}</Text>
        {isTop && (
          <View style={[styles.topTag, { backgroundColor: `${catColor}20` }]}>
            <Text style={[styles.topTagText, { color: catColor }]}>Highest</Text>
          </View>
        )}
      </View>
      <View style={styles.catBarTrack}>
        <View style={[
          styles.catBarFill,
          { width: `${Math.max(pct, 2)}%`, backgroundColor: catColor, opacity: isTop ? 1 : 0.45 },
        ]} />
      </View>
      <Text style={[styles.catAmt, isTop && styles.catAmtBold, isTop && { color: catColor }]}>{currencySymbol}{formatAmount(amount)}</Text>
    </View>
  );
}

const BAR_H = 110;
const BAR_W = 30;

function MonthlyChart({ data, maxVal }: {
  data: { label: string; amount: number; isCurrent: boolean }[];
  maxVal: number;
}) {
  const cw  = CARD_W - Spacing.md * 2;
  const gap = (cw - data.length * BAR_W) / (data.length + 1);
  return (
    <Svg width={cw} height={BAR_H + 30} style={{ alignSelf: 'center', marginTop: 4 }}>
      {data.map((d, i) => {
        const barH = d.amount > 0 ? Math.max((d.amount / maxVal) * BAR_H, 4) : 3;
        const x = gap + i * (BAR_W + gap);
        const y = BAR_H - barH;
        return (
          <React.Fragment key={d.label}>
            <Rect x={x} y={y} width={BAR_W} height={barH} rx={7}
              fill={d.isCurrent ? Colors.primary : '#DCE8F7'}
              opacity={d.amount > 0 ? 1 : 0.4}
            />
            {d.amount > 0 && (
              <SvgText x={x + BAR_W / 2} y={y - 5} textAnchor="middle" fontSize={9} fontWeight="700"
                fill={d.isCurrent ? Colors.primary : '#9CA3AF'}>
                {d.amount >= 1000 ? `${(d.amount / 1000).toFixed(1)}k` : String(d.amount)}
              </SvgText>
            )}
            <SvgText x={x + BAR_W / 2} y={BAR_H + 18} textAnchor="middle" fontSize={10}
              fill={d.isCurrent ? Colors.primary : '#9CA3AF'}
              fontWeight={d.isCurrent ? '700' : '400'}>
              {d.label}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: BG },
  scroll:  { flex: 1 },
  content: { padding: Spacing.md, gap: 14 },

  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: 8 },
  emptyEmoji: { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  emptyBody:  { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  emptyTitleSmall: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  emptyBodySmall:  { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },

  pageTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.4, marginBottom: 2 },
  rangePillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 2 },
  rangePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3E8EF',
  },
  rangePillActive: {
    backgroundColor: '#EAF3FF',
    borderColor: '#BFD7FF',
  },
  rangePillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  rangePillTextActive: {
    color: Colors.primary,
  },

  // Section header (emoji icon + title)
  sectionHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIconCircle:{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center' },
  sectionEmoji:     { fontSize: 14 },

  // Primary card
  primaryCard:     { backgroundColor: '#EEF4FF', borderRadius: 18, padding: Spacing.md, gap: 4, ...Shadow.card },
  primaryIconRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  primaryEmoji:    { fontSize: 20 },
  primaryMonth:    { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  primaryHeadline: { fontSize: 32, fontWeight: '800', letterSpacing: -1, color: Colors.primary, fontVariant: ['tabular-nums'] },
  primarySubLabel: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  primaryCatPill:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, alignSelf: 'stretch', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, borderWidth: 1 },
  primaryCatDot:   { width: 7, height: 7, borderRadius: 4, marginTop: 3 },
  primaryCatText:  { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  primaryCatSub:   { fontSize: 11, fontWeight: '500', color: Colors.textSecondary, marginTop: 1 },

  // Generic card
  card:      { backgroundColor: '#fff', borderRadius: 18, padding: Spacing.md, gap: 10, ...Shadow.card },
  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },

  // Trend badge
  badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeRed:   { backgroundColor: '#FEE2E2' },
  badgeGreen: { backgroundColor: '#D1FAE5' },
  badgeText:  { fontSize: 11, fontWeight: '700' },

  // Category rows
  catRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catNameWrap:{ width: 90, flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  catName:    { fontSize: 12, fontWeight: '500', color: Colors.textSecondary },
  catNameBold:{ fontWeight: '700', color: Colors.textPrimary },
  topTag:     { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  topTagText: { fontSize: 9, fontWeight: '700' },
  catBarTrack:{ flex: 1, height: 8, backgroundColor: '#F0F2F5', borderRadius: 4, overflow: 'hidden' },
  catBarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4, opacity: 0.4 },
  catBarTop:  { opacity: 1 },
  catAmt:     { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, width: 54, textAlign: 'right', fontVariant: ['tabular-nums'] },
  catAmtBold: { fontWeight: '800', color: Colors.textPrimary },

  // Spending highlights — edge-to-edge
  highlightsBlock:       { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', ...Shadow.card },
  highlightsHeader:      { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: 8 },
  highlightRow:          { paddingHorizontal: Spacing.md, paddingVertical: 14 },
  highlightRowBorder:    { borderBottomWidth: 1, borderBottomColor: '#F0F2F5' },
  highlightTextPrimary:  { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, lineHeight: 21 },
  highlightTextSecondary:{ fontSize: 13, fontWeight: '400', color: Colors.textSecondary, lineHeight: 19 },

  // Quick stats — neutral, compact
  statsRow:  { flexDirection: 'row', gap: 8 },
  statCard:  { flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 10, fontWeight: '500', color: Colors.textTertiary, textAlign: 'center' },
});



