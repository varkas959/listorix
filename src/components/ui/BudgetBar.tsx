import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useListStore } from '../../store/useListStore';
import { Colors } from '../../constants/colors';
import { Radius, Spacing } from '../../constants/spacing';
import { formatAmount, useCurrencySettings } from '../../utils/currency';

/**
 * Compact budget strip shown below the header when a budget is set.
 * Tapping the ₹ label opens the budget-set modal.
 */
export function BudgetBar({ totalPending }: { totalPending: number }) {
  const budget    = useListStore(s => s.budget);
  const setBudget = useListStore(s => s.setBudget);
  const { currencySymbol } = useCurrencySettings();

  const [modalVisible, setModalVisible] = useState(false);
  const [inputVal,     setInputVal]     = useState('');

  const over      = budget !== null && totalPending > budget;
  const overBy    = budget !== null ? totalPending - budget : 0;
  const underBy   = budget !== null ? budget - totalPending : 0;
  const fillPct   = budget !== null ? Math.min((totalPending / budget) * 100, 100) : 0;

  const barAnim = useRef(new Animated.Value(fillPct)).current;
  useEffect(() => {
    Animated.timing(barAnim, {
      toValue:  fillPct,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [fillPct]);

  function saveBudget() {
    const n = parseFloat(inputVal);
    if (!isNaN(n) && n > 0) setBudget(n);
    setInputVal('');
    setModalVisible(false);
  }

  function clearBudget() {
    setBudget(null);
    setModalVisible(false);
  }

  // Warning threshold: ≥90% of budget used but not yet over
  const nearLimit = budget !== null && !over && fillPct >= 90;

  if (budget === null) {
    return (
      <TouchableOpacity style={styles.setPrompt} onPress={() => setModalVisible(true)} activeOpacity={0.7}>
        <Text style={styles.setPromptText}>+ Set a budget for this trip</Text>
      </TouchableOpacity>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.bar, over && styles.barOver]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}
      >
        <View style={styles.barLabels}>
          {/* Left: status */}
          {over ? (
            <Text style={styles.overText}>{currencySymbol}{formatAmount(overBy)} over budget</Text>
          ) : (
            <Text style={[styles.underText, nearLimit && styles.nearText]}>
              {nearLimit ? `Almost at limit · ${currencySymbol}${formatAmount(underBy)} left` : `${currencySymbol}${formatAmount(underBy)} under budget`}
            </Text>
          )}
          {/* Right: budget amount + edit affordance */}
          <Text style={styles.barBudget}>
            Budget {currencySymbol}{budget != null ? formatAmount(budget) : ''}{' '}
            <Text style={styles.editLink}>edit</Text>
          </Text>
        </View>
        <View style={styles.barTrack}>
          <Animated.View
            style={[
              styles.barFill,
              over && styles.barFillOver,
              nearLimit && styles.barFillNear,
              {
                width: barAnim.interpolate({
                  inputRange:  [0, 100],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      </TouchableOpacity>

      {/* Set/Edit modal */}
      <BudgetModal
        visible={modalVisible}
        value={inputVal}
        current={budget}
        onChange={setInputVal}
        onSave={saveBudget}
        onClear={clearBudget}
        onClose={() => setModalVisible(false)}
      />
    </>
  );
}

function BudgetModal({
  visible, value, current, onChange, onSave, onClear, onClose,
}: {
  visible: boolean; value: string; current: number | null;
  onChange: (s: string) => void; onSave: () => void;
  onClear: () => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kvWrapper}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Set Trip Budget</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChange}
            placeholder={current ? String(current) : 'e.g. 500'}
            placeholderTextColor={Colors.textTertiary}
            keyboardType="numeric"
            autoFocus
          />
          <TouchableOpacity style={styles.saveBtn} onPress={onSave}>
            <Text style={styles.saveBtnText}>Set Budget</Text>
          </TouchableOpacity>
          {current !== null && (
            <TouchableOpacity style={styles.clearBtn} onPress={onClear}>
              <Text style={styles.clearBtnText}>Remove Budget</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  setPrompt: {
    marginHorizontal: Spacing.md,
    marginTop: 6,
    marginBottom: 2,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  setPromptText: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: '500',
  },
  bar: {
    marginHorizontal: Spacing.md,
    marginTop: 6,
    marginBottom: 2,
    gap: 5,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
  },
  barOver: {
    backgroundColor: '#FFF1F1',   // very light red tint — unmissable but not alarming
  },
  barTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  barFillOver: {
    backgroundColor: Colors.danger,
  },
  barFillNear: {
    backgroundColor: Colors.warning,
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  overText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.danger,
    fontVariant: ['tabular-nums'],
  },
  underText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.success,
    fontVariant: ['tabular-nums'],
  },
  nearText: {
    color: Colors.warning,
  },
  barBudget: {
    fontSize: 11,
    color: Colors.textTertiary,
    fontWeight: '400',
    fontVariant: ['tabular-nums'],
  },
  editLink: {
    color: Colors.primary,
    fontWeight: '600',
  },

  // Modal
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  kvWrapper: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.md,
    paddingBottom: 36,
    gap: 12,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center', marginBottom: 6,
  },
  sheetTitle: {
    fontSize: 17, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center',
  },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
    padding: 14, fontSize: 20, fontWeight: '700',
    color: Colors.textPrimary, textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  clearBtn: {
    backgroundColor: Colors.bg, borderRadius: Radius.md,
    paddingVertical: 12, alignItems: 'center',
  },
  clearBtnText: { fontSize: 14, fontWeight: '500', color: Colors.danger },
});

