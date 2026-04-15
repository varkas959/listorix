import React, { useEffect, useRef } from 'react';
import { Animated, Text, View, StyleSheet } from 'react-native';
import { useListStore } from '../../store/useListStore';
import { Colors } from '../../constants/colors';
import { useCurrencySettings } from '../../utils/currency';

const HOLD_MS   = 2600;
const SLIDE_PX  = 36;

export function SavedToast() {
  const event      = useListStore(s => s.lastSavedEvent);
  const clearEvent = useListStore(s => s.clearSavedEvent);
  const { currencySymbol } = useCurrencySettings();

  // Line 1 — amount saved
  const slideY1  = useRef(new Animated.Value(SLIDE_PX)).current;
  const opacity1 = useRef(new Animated.Value(0)).current;

  // Line 2 — category insight, staggered 120ms after line 1
  const slideY2  = useRef(new Animated.Value(SLIDE_PX)).current;
  const opacity2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!event) return;

    // Reset
    slideY1.setValue(SLIDE_PX);  opacity1.setValue(0);
    slideY2.setValue(SLIDE_PX);  opacity2.setValue(0);

    // Slide in line 1
    Animated.parallel([
      Animated.spring(slideY1,  { toValue: 0, useNativeDriver: true, tension: 170, friction: 9 }),
      Animated.timing(opacity1, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();

    // Slide in line 2 — 120ms later
    const t1 = setTimeout(() => {
      Animated.parallel([
        Animated.spring(slideY2,  { toValue: 0, useNativeDriver: true, tension: 170, friction: 9 }),
        Animated.timing(opacity2, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    }, 120);

    // Slide both out after hold
    const t2 = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideY1,  { toValue: SLIDE_PX, duration: 220, useNativeDriver: true }),
        Animated.timing(opacity1, { toValue: 0,         duration: 180, useNativeDriver: true }),
        Animated.timing(slideY2,  { toValue: SLIDE_PX, duration: 220, useNativeDriver: true }),
        Animated.timing(opacity2, { toValue: 0,         duration: 180, useNativeDriver: true }),
      ]).start(() => {
        clearEvent();
      });
    }, HOLD_MS);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [event?.id]);

  if (!event) return null;

  const showCategory = event.newCategoryPct > 0;

  return (
    <View style={styles.wrapper} pointerEvents="none">
      {/* Line 1: Bought for ₹120 */}
      <Animated.View
        style={[
          styles.pill,
          { opacity: opacity1, transform: [{ translateY: slideY1 }] },
        ]}
      >
        <Text style={styles.icon}>✓</Text>
        <Text style={styles.line1}>
          {'Bought for '}
          <Text style={styles.amount}>{currencySymbol}{event.amount}</Text>
        </Text>
      </Animated.View>

      {/* Line 2: Dairy is 35% of remaining spend */}
      {showCategory && (
        <Animated.View
          style={[
            styles.pill,
            styles.pill2,
            { opacity: opacity2, transform: [{ translateY: slideY2 }] },
          ]}
        >
          <Text style={styles.line2}>
            <Text style={styles.catName}>{event.category}</Text>
            {' is '}
            <Text style={styles.pct}>{event.newCategoryPct}%</Text>
            {' of remaining spend'}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 110,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 6,
    zIndex: 200,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 28,
    gap: 8,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 8,
  },
  pill2: {
    backgroundColor: '#1A6B40',   // darker green — visually distinct from line 1
    paddingVertical: 8,
  },
  icon: {
    fontSize: 15,
  },
  line1: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  amount: {
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  line2: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.90)',
  },
  catName: {
    fontWeight: '700',
    color: '#fff',
  },
  pct: {
    fontWeight: '800',
    color: '#fff',
  },
});

