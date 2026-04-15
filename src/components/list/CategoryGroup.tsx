import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { GroceryItem } from '../../types';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { ListItem } from './ListItem';
import { IconChevronDown } from '../ui/Icons';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
  category:     string;
  items:        GroceryItem[];
  onToggle:     (id: string) => void;
  newItemId?:   string | null;
  highlighted?: boolean;
  onLayout?:    (y: number) => void;
  isFirstGroup?: boolean;
}

export const CategoryGroup = React.memo(function CategoryGroup({
  category, items, onToggle, newItemId, highlighted, isFirstGroup = false,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const chevronAnim = useRef(new Animated.Value(0)).current;

  // Header highlight flash when insight chip is tapped
  const highlightAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (highlighted) {
      Animated.sequence([
        Animated.timing(highlightAnim, { toValue: 1, duration: 180, useNativeDriver: false }),
        Animated.delay(600),
        Animated.timing(highlightAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
      ]).start();
    }
  }, [highlighted]);

  function toggleCollapse() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed(c => {
      const next = !c;
      Animated.timing(chevronAnim, {
        toValue:  next ? -0.5 : 0,
        duration: 240,
        useNativeDriver: true,
      }).start();
      return next;
    });
  }

  const chevronRotate = chevronAnim.interpolate({
    inputRange:  [-0.5, 0],
    outputRange: ['-90deg', '0deg'],
  });

  return (
    <View style={styles.container}>
      {/* Category header */}
      <TouchableOpacity onPress={toggleCollapse} activeOpacity={0.7}>
        <View style={styles.header}>
          <Text style={styles.categoryName}>
            {category} ({items.length})
          </Text>
          <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
            <IconChevronDown size={12} color={Colors.textTertiary} />
          </Animated.View>
        </View>
      </TouchableOpacity>

      {/* Grouped card — all items in one card with hairline dividers */}
      {!collapsed && (
        <View style={styles.groupCard}>
          {items.map((item, idx) => (
            <React.Fragment key={item.id}>
              {idx > 0 && <View style={styles.divider} />}
              <ListItem
                item={item}
                onToggle={onToggle}
                isNew={item.id === newItemId}
                isFirst={isFirstGroup && idx === 0}
              />
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
},
// Custom equality — only re-render when items in THIS category actually changed.
// Without this, every toggle re-renders ALL CategoryGroups because `grouped`
// in the parent always produces new array references.
(prev, next) => {
  if (prev.category    !== next.category)    return false;
  if (prev.highlighted !== next.highlighted) return false;
  if (prev.isFirstGroup !== next.isFirstGroup) return false;
  if (prev.newItemId   !== next.newItemId)   return false;
  if (prev.items.length !== next.items.length) return false;
  for (let i = 0; i < prev.items.length; i++) {
    if (prev.items[i] !== next.items[i]) return false;
  }
  return true; // nothing changed — skip re-render
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: 3,
    paddingBottom: 4,
  },
  categoryName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    letterSpacing: 0.2,
  },

  // Single card wrapping all items in this category
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    marginHorizontal: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 4,
  },

  // Hairline separator aligned with text content
  // Left offset = paddingHorizontal(14) + emojiWidth(24) + gap(12) = 50
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EBEBED',
    marginLeft: 50,
  },
});
