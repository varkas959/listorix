import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Defs, Filter, FeDropShadow } from 'react-native-svg';
import { Colors } from '../../constants/colors';

// ── Geometry ──────────────────────────────────────────────────────────────────
// Notch in the CENTER — FAB sits in the middle of the nav bar.
//
// ViewBox: 390 × 52
// Arc from (152, 0) to (238, 0) with radius 45.
// FAB center: x = (152+238)/2 = 195.
//
const NAV_PATH   = 'M0,0 H152 A45,45,0,0,1,238,0 H390 V52 H0 Z';
const NAV_WIDTH  = 390;
const NAV_HEIGHT = 52;

// Where the FAB center sits (fraction of screen width)
export const FAB_CENTER_X_FRAC = 195 / 390;  // 0.5

interface TabItem {
  key:   string;
  label: string;
  icon:  (active: boolean) => React.ReactNode;
}

interface Props {
  state:       { index: number; routes: Array<{ name: string; key?: string }> };
  descriptors: Record<string, unknown>;
  navigation:  { emit: Function; navigate: Function };
  tabs:        TabItem[];
  onFabPress:  () => void;
}

// ── TabButton — owns its own Animated.Values ──────────────────────────────────
interface TabButtonProps {
  tab:     TabItem;
  active:  boolean;
  onPress: () => void;
}

function TabButton({ tab, active, onPress }: TabButtonProps) {
  // Icon scale: 0.88 (idle) ↔ 1.0 (active), spring with slight overshoot
  const iconScale  = useRef(new Animated.Value(active ? 1 : 0.88)).current;
  // Dot/pill scale: 0 (hidden) ↔ 1 (visible), faster spring
  const dotScale   = useRef(new Animated.Value(active ? 1 : 0)).current;
  // Press bounce: 1 → 0.82 (compress) → spring back to 1
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(iconScale, {
      toValue: active ? 1.0 : 0.88,
      useNativeDriver: true,
      tension: 180,
      friction: 8,
    }).start();

    Animated.spring(dotScale, {
      toValue: active ? 1 : 0,
      useNativeDriver: true,
      tension: 280,
      friction: 12,
    }).start();
  }, [active]);

  function handlePressIn() {
    Animated.timing(pressScale, {
      toValue: 0.82,
      duration: 60,
      useNativeDriver: true,
    }).start();
  }

  function handlePressOut() {
    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 180,
      friction: 8,
    }).start();
  }

  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {/* Nested scale: outer = press bounce, inner = active scale */}
      <Animated.View style={{ transform: [{ scale: pressScale }] }}>
        <Animated.View style={{ transform: [{ scale: iconScale }] }}>
          {tab.icon(active)}
        </Animated.View>
      </Animated.View>

      <Text style={[styles.label, active && styles.labelActive]}>
        {tab.label}
      </Text>

      {/* Pill indicator — springs in/out instead of appearing instantly */}
      <Animated.View
        style={[
          styles.activePill,
          { transform: [{ scaleX: dotScale }, { scaleY: dotScale }] },
        ]}
      />
    </Pressable>
  );
}

// ── CurvedTabBar ──────────────────────────────────────────────────────────────
export function CurvedTabBar({ state, navigation, tabs }: Props) {
  const insets    = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 4);

  function handlePress(key: string, index: number) {
    const route = state.routes[index];
    const event = navigation.emit({
      type: 'tabPress',
      target: (route as any)?.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigate(key);
    }
  }

  return (
    <View style={[styles.wrapper, { height: NAV_HEIGHT + bottomPad }]}>
      {/* SVG curved bar — sits at the TOP of the wrapper */}
      <Svg
        width="100%"
        height={NAV_HEIGHT}
        viewBox={`0 0 ${NAV_WIDTH} ${NAV_HEIGHT}`}
        preserveAspectRatio="none"
      >
        <Defs>
          <Filter id="navShadow" x="-2%" y="-30%" width="104%" height="160%">
            <FeDropShadow dx="0" dy="-3" stdDeviation="4" floodOpacity="0.13" />
          </Filter>
        </Defs>
        <Path d={NAV_PATH} fill="white" filter="url(#navShadow)" />
      </Svg>

      {/* White fill for home-indicator safe area below the curve */}
      {bottomPad > 0 && (
        <View style={{ height: bottomPad, backgroundColor: '#fff' }} />
      )}

      {/* Tab row — absolutely overlaid on the SVG area */}
      <View style={styles.row}>
        {tabs.slice(0, 2).map((tab, i) => (
          <TabButton
            key={tab.key}
            tab={tab}
            active={state.index === i}
            onPress={() => handlePress(tab.key, i)}
          />
        ))}

        {/* Center spacer — notch gap for the FAB */}
        <View style={styles.notchSpacer} />

        {tabs.slice(2).map((tab, i) => {
          const idx = i + 2;
          return (
            <TabButton
              key={tab.key}
              tab={tab}
              active={state.index === idx}
              onPress={() => handlePress(tab.key, idx)}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  row: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    height: NAV_HEIGHT,
    paddingLeft: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 4,
    gap: 2,
  },
  notchSpacer: {
    width: 90,   // center notch arc width (238-152 = 86, with a bit of padding)
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    color: Colors.textTertiary,
    letterSpacing: 0.2,
  },
  labelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  // 16×3px rounded pill — more modern and visible than the old 4×4 dot
  activePill: {
    width: 16,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.primary,
    marginTop: 1,
  },
});
