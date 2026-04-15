import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { IconPen, IconMic, IconScan, IconPlus, IconClose } from './Icons';
import { useListStore } from '../../store/useListStore';

interface Props {
  onVoice:  () => void;
  onManual: () => void;
  onScan:   () => void;
}

const ICON_COLOR = Colors.primary;

export interface FABHandle {
  open: () => void;
}

export const FAB = forwardRef<FABHandle, Props>(function FAB({ onVoice, onManual, onScan }, ref) {
  const { bottom: safeBottom } = useSafeAreaInsets();
  const isEmpty = useListStore(s => s.items.length === 0);
  const [open, setOpen] = useState(false);

  const rotation     = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const fabScale     = useRef(new Animated.Value(1)).current;
  const optionAnims  = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  const DURATION = 200;
  const STAGGER  = 35;

  useImperativeHandle(ref, () => ({ open: expand }));

  function expand() {
    setOpen(true);
    Animated.parallel([
      Animated.timing(rotation,     { toValue: 1, duration: DURATION, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 1, duration: DURATION, useNativeDriver: true }),
      ...optionAnims.map((anim, i) =>
        Animated.timing(anim, {
          toValue: 1, duration: DURATION, delay: i * STAGGER, useNativeDriver: true,
        })
      ),
    ]).start();
  }

  function close(then?: () => void) {
    Animated.parallel([
      Animated.timing(rotation,     { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
      ...optionAnims.map((anim, i) =>
        Animated.timing(anim, {
          toValue: 0, duration: 140, delay: i * 20, useNativeDriver: true,
        })
      ),
    ]).start(() => { setOpen(false); then?.(); });
  }

  function handleOption(action: () => void) {
    action();
    close();
  }

  const rotate = rotation.interpolate({
    inputRange: [0, 1], outputRange: ['0deg', '45deg'],
  });

  // Items ordered bottom-to-top (index 0 = closest to FAB)
  // Rendered in reverse so "Type manually" sits nearest the FAB
  const items = [
    {
      label: isEmpty ? 'Start your list' : 'Type manually',
      sub:   isEmpty ? 'Type manually'   : null,
      Icon:  IconPen,
      primary: true,
      action: onManual,
    },
    {
      label: 'Voice input',
      sub:   null,
      Icon:  IconMic,
      primary: false,
      action: onVoice,
    },
    {
      label: 'Scan receipt',
      sub:   null,
      Icon:  IconScan,
      primary: false,
      action: onScan,
    },
  ];

  return (
    <>
      {open && (
        <Animated.View
          style={[styles.backdrop, { opacity: backdropAnim }]}
          pointerEvents="auto"
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
        </Animated.View>
      )}

      <View
        style={[styles.container, { bottom: safeBottom + 20 }]}
        pointerEvents="box-none"
      >
        {/* Render in reverse so scan is top, type manually is bottom (nearest FAB) */}
        {[...items].reverse().map((item, reversedIdx) => {
          const i = items.length - 1 - reversedIdx;
          const anim = optionAnims[i];
          const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

          return (
            <Animated.View
              key={item.label}
              style={[
                styles.optionWrap,
                { opacity: anim, transform: [{ translateY }] },
              ]}
              pointerEvents={open ? 'auto' : 'none'}
            >
              <Pressable
                style={[styles.optionBtn, item.primary && styles.optionBtnPrimary]}
                onPress={() => handleOption(item.action)}
                android_ripple={{ color: 'rgba(47,128,237,0.08)' }}
              >
                <item.Icon size={18} color={ICON_COLOR} strokeWidth={1.8} />
                <View style={styles.optionTextWrap}>
                  <Text style={[styles.optionLabel, item.primary && styles.optionLabelPrimary]}>
                    {item.label}
                  </Text>
                  {item.sub && (
                    <Text style={styles.optionSub}>{item.sub}</Text>
                  )}
                </View>
              </Pressable>
            </Animated.View>
          );
        })}

        {/* FAB */}
        <Pressable
          onPress={() => open ? close() : expand()}
          onPressIn={() =>
            Animated.timing(fabScale, { toValue: 0.90, duration: 60, useNativeDriver: true }).start()
          }
          onPressOut={() =>
            Animated.timing(fabScale, { toValue: 1, duration: 100, useNativeDriver: true }).start()
          }
        >
          <Animated.View style={[styles.fab, { transform: [{ scale: fabScale }] }]}>
            <Animated.View style={{ transform: [{ rotate }] }}>
              {open
                ? <IconClose size={20} color="#fff" strokeWidth={2.5} />
                : <IconPlus  size={22} color="#fff" strokeWidth={2.5} />}
            </Animated.View>
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
    zIndex: 100,
  },

  container: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    zIndex: 110,
    gap: 10,
  },

  // ── Option row ──────────────────────────────────────────────────────────────
  optionWrap: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    borderRadius: 20,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 20,
    minWidth: 210,
    overflow: 'hidden',
  },
  optionBtnPrimary: {
    backgroundColor: '#F4F8FF',
  },
  optionTextWrap: {
    gap: 1,
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
    letterSpacing: -0.1,
  },
  optionLabelPrimary: {
    fontWeight: '700',
    color: '#1A1A2E',
  },
  optionSub: {
    fontSize: 11,
    color: Colors.textTertiary,
  },

  // ── FAB ─────────────────────────────────────────────────────────────────────
  fab: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 4,
  },
});
