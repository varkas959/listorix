import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Spacing, Radius } from '../../constants/spacing';
import { formatAmount, useCurrencySettings } from '../../utils/currency';
import { saveListTemplate } from '../../services/storage';
import type { GroceryItem } from '../../types';

interface Props {
  visible:       boolean;
  totalSpent:    number;
  lastTripTotal: number;
  items:         GroceryItem[];
  onClose:       () => void;
  onStartNew:    () => void;
}

export function SessionEndSheet({ visible, totalSpent, lastTripTotal, items, onClose, onStartNew }: Props) {
  const insets  = useSafeAreaInsets();
  const [repeated, setRepeated] = useState(false);
  const { currencySymbol } = useCurrencySettings();

  const diff    = totalSpent - lastTripTotal;
  const overBy  = Math.abs(diff);
  const isOver  = diff > 0;
  const hasDiff = overBy >= 5;

  async function handleRepeat() {
    await saveListTemplate(items);
    setRepeated(true);
    setTimeout(onClose, 1400);
  }

  function handleSkip() {
    setRepeated(false);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleSkip}
    >
      <Pressable style={styles.backdrop} onPress={handleSkip} />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.handle} />

        {/* ── Spending summary ─────────────────────────────────── */}
        <Text style={styles.emoji}>🛒</Text>

        <Text style={styles.spent}>
          You spent{' '}
          <Text style={styles.spentAmount}>{currencySymbol}{formatAmount(totalSpent)}</Text>
          {' '}today
        </Text>

        {hasDiff && (
          <Text style={[styles.vsLast, isOver ? styles.vsOver : styles.vsUnder]}>
            {currencySymbol}{formatAmount(overBy)} {isOver ? 'more' : 'less'} than your last trip
          </Text>
        )}

        {/* ── Repeat CTA ───────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.repeatBtn, repeated && styles.repeatBtnDone]}
          onPress={repeated ? undefined : handleRepeat}
          activeOpacity={0.85}
        >
          <Text style={styles.repeatText}>
            {repeated ? '✓  List saved for next time!' : 'Repeat this list next time in one tap'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.reminder}>
          We'll remind you when it's time to shop again
        </Text>

        {/* ── Divider ──────────────────────────────────────────── */}
        <View style={styles.divider} />

        {/* ── Actions ──────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.startNewBtn}
          onPress={() => { onStartNew(); }}
          activeOpacity={0.85}
        >
          <Text style={styles.startNewText}>Start New List</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skip} onPress={handleSkip} activeOpacity={0.6}>
          <Text style={styles.skipText}>Keep this list</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing.lg,
    paddingTop: 16,
    alignItems: 'center',
    gap: 8,
  },
  handle: {
    width: 40, height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 6,
  },

  emoji: {
    fontSize: 38,
    marginBottom: 2,
  },
  spent: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  spentAmount: {
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  vsLast: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    marginBottom: 4,
  },
  vsOver: {
    color: Colors.warning,
  },
  vsUnder: {
    color: Colors.success,
  },

  repeatBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  repeatBtnDone: {
    backgroundColor: Colors.success,
    shadowColor: Colors.success,
  },
  repeatText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  reminder: {
    fontSize: 11,
    color: Colors.textTertiary,
    fontWeight: '400',
    textAlign: 'center',
  },

  divider: {
    width: '100%',
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },

  startNewBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  startNewText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  skip: {
    paddingVertical: 10,
  },
  skipText: {
    fontSize: 13,
    color: Colors.textTertiary,
    fontWeight: '500',
  },
});

