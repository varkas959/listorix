import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';

interface Props {
  message: string;
  visible: boolean;
  onHide:  () => void;
}

const HOLD_MS = 2800;

/**
 * Subtle nudge — slides up from bottom of screen, much quieter than SavedToast.
 * Used for light guidance: "Nice. Keep going" / "Most people add 8–10 items"
 */
export function NudgeToast({ message, visible, onHide }: Props) {
  const slideY  = useRef(new Animated.Value(32)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    slideY.setValue(32);
    opacity.setValue(0);

    Animated.parallel([
      Animated.spring(slideY,  { toValue: 0, useNativeDriver: true, tension: 150, friction: 9 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideY,  { toValue: 32, duration: 220, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0,  duration: 180, useNativeDriver: true }),
      ]).start(() => onHide());
    }, HOLD_MS);

    return () => clearTimeout(t);
  }, [visible, message]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.pill, { opacity, transform: [{ translateY: slideY }] }]}
      pointerEvents="none"
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    backgroundColor: 'rgba(26,26,46,0.82)',   // dark, unobtrusive
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    zIndex: 190,
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: 0.1,
  },
});
