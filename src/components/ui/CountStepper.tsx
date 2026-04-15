import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';

interface Props {
  count:       number;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?:   boolean;
}

export function CountStepper({ count, onIncrement, onDecrement, disabled }: Props) {
  const atMin = count <= 1 || !!disabled;
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.btn}
        onPress={onDecrement}
        disabled={atMin}
        hitSlop={{ top: 6, bottom: 6, left: 8, right: 4 }}
        activeOpacity={0.5}
      >
        <Text style={[styles.symbol, atMin && styles.symbolDim]}>−</Text>
      </TouchableOpacity>

      <View style={styles.countWrap}>
        <Text style={styles.count}>{count}</Text>
      </View>

      <TouchableOpacity
        style={styles.btn}
        onPress={onIncrement}
        disabled={disabled}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 8 }}
        activeOpacity={0.5}
      >
        <Text style={[styles.symbol, disabled && styles.symbolDim]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    borderWidth:    1,
    borderColor:    '#E3E6EA',      // ~25% lighter than before — recedes behind content
    borderRadius:   8,
    overflow:       'hidden',
  },
  btn: {
    width:           30,
    height:          30,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: '#fff',
  },
  countWrap: {
    width:           28,
    height:          30,
    alignItems:      'center',
    justifyContent:  'center',
    borderLeftWidth:  1,
    borderRightWidth: 1,
    borderColor:     '#E3E6EA',     // matches outer border — uniform, quiet
    backgroundColor: '#fff',
  },
  symbol: {
    fontSize:   16,
    fontWeight: '600',
    color:      Colors.primary,
    lineHeight: 19,
    includeFontPadding: false,
  },
  symbolDim: { opacity: 0.3 },
  count: {
    fontSize:    13,
    fontWeight:  '700',
    color:       Colors.primary,
    fontVariant: ['tabular-nums'],
  },
});
