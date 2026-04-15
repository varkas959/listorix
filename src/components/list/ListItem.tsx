import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  PanResponder,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { GroceryItem } from '../../types';
import { Colors } from '../../constants/colors';
import { useListStore } from '../../store/useListStore';
import { CountStepper } from '../ui/CountStepper';
import { getItemEmoji } from '../../constants/categories';
import { formatAmount, useCurrencySettings } from '../../utils/currency';

const ALL_CATEGORIES = [
  'Vegetables', 'Dairy', 'Fruits', 'Snacks', 'Grains', 'Pulses',
  'Spices', 'Bakery', 'Beverages', 'Oils & Sauces', 'Cleaning', 'Other',
];

interface Props {
  item:     GroceryItem;
  onToggle: (id: string) => void;
  isNew?:   boolean;
  isFirst?: boolean;
}

export const ListItem = React.memo(function ListItem({ item, onToggle, isNew = false, isFirst = false }: Props) {
  const { currencySymbol } = useCurrencySettings();

  // ── Slide-in for new items ────────────────────────────────────────────────
  const slideAnim = useRef(new Animated.Value(isNew ? 1 : 0)).current;
  useEffect(() => {
    if (isNew) {
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, tension: 120, friction: 8,
      }).start();
    }
  }, []);

  // ── Row fade on check ─────────────────────────────────────────────────────
  const rowOpacity  = useRef(new Animated.Value(item.checked ? 0.5 : 1)).current;
  const prevChecked = useRef(item.checked);
  useEffect(() => {
    if (prevChecked.current !== item.checked) {
      prevChecked.current = item.checked;
      Animated.timing(rowOpacity, {
        toValue: item.checked ? 0.45 : 1,
        duration: 220, useNativeDriver: true,
      }).start();
    }
  }, [item.checked]);

  // ── Animated strikethrough ────────────────────────────────────────────────
  const strikeScale       = useRef(new Animated.Value(item.checked ? 1 : 0)).current;
  const prevCheckedStrike = useRef(item.checked);
  useEffect(() => {
    if (prevCheckedStrike.current !== item.checked) {
      prevCheckedStrike.current = item.checked;
      Animated.timing(strikeScale, {
        toValue: item.checked ? 1 : 0,
        duration: 200, delay: item.checked ? 50 : 0, useNativeDriver: true,
      }).start();
    }
  }, [item.checked]);

  // ── Checkbox bounce ───────────────────────────────────────────────────────
  const checkScale = useRef(new Animated.Value(1)).current;
  function handleTap() {
    Animated.sequence([
      Animated.timing(checkScale, { toValue: 0.80, duration: 80, useNativeDriver: true }),
      Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 6 }),
    ]).start();
    onToggle(item.id);
  }

  // ── Swipe-to-delete ───────────────────────────────────────────────────────
  const removeItem  = useListStore(s => s.removeItem);
  const SNAP_OPEN   = -72;
  const swipeX      = useRef(new Animated.Value(0)).current;
  const deleteScale = useRef(new Animated.Value(0)).current;
  const isOpen      = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        const x = Math.max(SNAP_OPEN - 8, Math.min(0, g.dx + (isOpen.current ? SNAP_OPEN : 0)));
        swipeX.setValue(x);
        deleteScale.setValue(Math.min(1, Math.abs(x) / Math.abs(SNAP_OPEN)));
      },
      onPanResponderRelease: (_, g) => {
        const total = g.dx + (isOpen.current ? SNAP_OPEN : 0);
        const open  = total < SNAP_OPEN / 2;
        isOpen.current = open;
        Animated.spring(swipeX,      { toValue: open ? SNAP_OPEN : 0, useNativeDriver: true, tension: 120, friction: 9 }).start();
        Animated.spring(deleteScale, { toValue: open ? 1 : 0,         useNativeDriver: true, tension: 120, friction: 9 }).start();
      },
    })
  ).current;

  function swipeDelete() {
    Animated.parallel([
      Animated.timing(swipeX,     { toValue: -300, duration: 220, useNativeDriver: true }),
      Animated.timing(rowOpacity, { toValue: 0,    duration: 200, useNativeDriver: true }),
    ]).start(() => removeItem(item.id));
  }

  // ── Store actions ─────────────────────────────────────────────────────────
  const updateItemCount    = useListStore(s => s.updateItemCount);
  const updateItemPrice    = useListStore(s => s.updateItemPrice);
  const updateItemCategory = useListStore(s => s.updateItemCategory);

  // ── Inline price input ────────────────────────────────────────────────────
  const [rowPriceVal,  setRowPriceVal]  = useState(item.price > 0 ? String(item.price) : '');
  const rowPriceEditing = useRef(false);
  const rowPriceRef     = useRef<TextInput>(null);

  // Keep display in sync when price changes externally (e.g. edit sheet save)
  useEffect(() => {
    if (!rowPriceEditing.current) {
      setRowPriceVal(item.price > 0 ? String(item.price) : '');
    }
  }, [item.price]);

  function commitRowPrice() {
    rowPriceEditing.current = false;
    const parsed = parseFloat(rowPriceVal);
    if (!isNaN(parsed) && parsed >= 0) {
      updateItemPrice(item.id, parsed);
    } else if (rowPriceVal.trim() === '') {
      updateItemPrice(item.id, 0);
    } else {
      // Invalid — revert display
      setRowPriceVal(item.price > 0 ? String(item.price) : '');
    }
  }

  // ── Edit sheet ────────────────────────────────────────────────────────────
  const [sheetOpen,    setSheetOpen]    = useState(false);
  const [editPrice,    setEditPrice]    = useState('');
  const [editCount,    setEditCount]    = useState(1);
  const [editCategory, setEditCategory] = useState(item.category);
  const sheetAnim    = useRef(new Animated.Value(600)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const priceInputRef = useRef<TextInput>(null);

  function openSheet() {
    if (item.checked) return;
    // Populate edit state before showing
    setEditPrice(item.price > 0 ? String(item.price) : '');
    setEditCount(item.count ?? 1);
    setEditCategory(item.category);
    // Reset position so the sheet always slides in from the bottom
    sheetAnim.setValue(500);
    backdropAnim.setValue(0);
    setSheetOpen(true);
    Animated.parallel([
      Animated.timing(sheetAnim, {
        toValue:  0,
        duration: 210,
        easing:   Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue:  1,
        duration: 180,
        easing:   Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }

  function closeSheet(then?: () => void) {
    priceInputRef.current?.blur();
    Animated.parallel([
      Animated.timing(sheetAnim, {
        toValue:  500,
        duration: 190,
        easing:   Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue:  0,
        duration: 160,
        easing:   Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSheetOpen(false);
      then?.();
    });
  }

  function saveEdit() {
    const parsed = parseFloat(editPrice);
    updateItemPrice(item.id, !isNaN(parsed) && parsed >= 0 ? parsed : 0);
    updateItemCount(item.id, editCount);
    updateItemCategory(item.id, editCategory);
    closeSheet();
  }

  function deleteFromSheet() {
    closeSheet(() => {
      Animated.parallel([
        Animated.timing(swipeX,     { toValue: -300, duration: 220, useNativeDriver: true }),
        Animated.timing(rowOpacity, { toValue: 0,    duration: 200, useNativeDriver: true }),
      ]).start(() => removeItem(item.id));
    });
  }

  const emoji = getItemEmoji(item.name, item.category);

  return (
    <View style={styles.swipeWrapper}>
      {/* Delete bubble (swipe) */}
      <Animated.View style={[styles.deleteBubble, { transform: [{ scale: deleteScale }] }]}>
        <TouchableOpacity style={styles.deleteBubbleInner} onPress={swipeDelete} activeOpacity={0.8}>
          <Text style={styles.deleteBubbleIcon}>🗑</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.card,
          item.checked && styles.cardChecked,
          {
            opacity: isNew
              ? slideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
              : rowOpacity,
            transform: [{
              translateX: isNew
                ? slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 24] })
                : swipeX,
            }],
          },
        ]}
      >
        {/* ── Checkbox ─────────────────────────────────────────────────────── */}
        <TouchableOpacity
          onPress={handleTap}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
          style={styles.checkWrap}
        >
          <Animated.View style={[
            styles.checkCircle,
            item.checked && styles.checkCircleChecked,
            { transform: [{ scale: checkScale }] },
          ]}>
            {item.checked && <Text style={styles.checkMark}>✓</Text>}
          </Animated.View>
        </TouchableOpacity>

        {/* ── Row body: emoji + name (tap→edit sheet) ─────────────────────── */}
        <View style={styles.rowBody}>
          <Text style={styles.emoji}>{emoji}</Text>

          <TouchableOpacity
            style={styles.nameArea}
            onPress={openSheet}
            activeOpacity={item.checked ? 1 : 0.7}
            disabled={item.checked}
          >
            <View style={styles.nameWrap}>
              <Text
                style={[styles.name, item.checked && styles.nameChecked]}
                numberOfLines={2}
              >
                {item.name}
              </Text>
              <Animated.View
                style={[styles.strikethrough, {
                  transform: [
                    { scaleX: strikeScale },
                    { translateX: strikeScale.interpolate({ inputRange: [0, 1], outputRange: [-50, 0] }) },
                  ],
                }]}
              />
            </View>
            {item.qty && item.qty !== '1' && (
              <Text style={[styles.unit, item.checked && styles.unitFaded]} numberOfLines={1}>
                {item.qty}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Inline price ─────────────────────────────────────────────────
             ALWAYS in tree — hidden with opacity when checked to prevent
             layout reflow that causes visible "screen reload" flash.
        ──────────────────────────────────────────────────────────────────── */}
        <View
          style={[styles.inlinePriceBox, item.checked && styles.hiddenKeepLayout]}
          pointerEvents={item.checked ? 'none' : 'auto'}
        >
          {item.checked && item.price > 0 ? (
            <Text style={styles.priceChecked}>
              {currencySymbol}{formatAmount(item.price * (item.count ?? 1))}
            </Text>
          ) : (
            <>
              <Text style={[
                styles.inlinePriceSymbol,
                rowPriceVal === '' && styles.inlinePriceSymbolDim,
              ]}>{currencySymbol}</Text>
              <TextInput
                ref={rowPriceRef}
                style={[
                  styles.inlinePriceInput,
                  rowPriceVal === '' && styles.inlinePriceInputDim,
                ]}
                value={rowPriceVal}
                onChangeText={setRowPriceVal}
                onFocus={() => { rowPriceEditing.current = true; }}
                onBlur={commitRowPrice}
                onSubmitEditing={commitRowPrice}
                keyboardType="numeric"
                returnKeyType="next"
                placeholder="—"
                placeholderTextColor="#C8CDD5"
                underlineColorAndroid="transparent"
              />
            </>
          )}
        </View>

        {/* ── Count stepper — ALWAYS in tree, hidden when checked ─────────── */}
        <View
          style={[
            styles.stepperWrap,
            item.price === 0 && styles.stepperWrapDimmed,
            item.checked && styles.hiddenKeepLayout,
          ]}
          pointerEvents={item.checked ? 'none' : 'auto'}
        >
          <CountStepper
            count={item.count ?? 1}
            onDecrement={() => updateItemCount(item.id, (item.count ?? 1) - 1)}
            onIncrement={() => updateItemCount(item.id, (item.count ?? 1) + 1)}
            disabled={item.price === 0 || item.checked}
          />
        </View>
      </Animated.View>

      {/* ── Edit bottom sheet — always mounted so tap has zero mount delay ── */}
      <Modal
        transparent
        animationType="none"
        visible={sheetOpen}
        onRequestClose={() => closeSheet()}
        statusBarTranslucent
      >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => closeSheet()}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.sheetBackdrop, { opacity: backdropAnim }]} />
          </Pressable>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.sheetContainer}
            pointerEvents="box-none"
          >
            <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetAnim }] }]}>
              <View style={styles.sheetHandle} />
              <Text style={[styles.sheetTitle, styles.sheetTitleStandalone]}>{item.name}</Text>
              <View style={styles.sheetDivider} />

              {/* Price */}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Price</Text>
                <View style={styles.priceInputRow}>
                  <Text style={styles.pricePrefix}>{currencySymbol}</Text>
                  <TextInput
                    ref={priceInputRef}
                    style={styles.priceField}
                    value={editPrice}
                    onChangeText={setEditPrice}
                    keyboardType="numeric"
                    returnKeyType="next"
                    onSubmitEditing={saveEdit}
                    placeholder="0"
                    placeholderTextColor={Colors.textTertiary}
                    selectTextOnFocus
                  />
                </View>
              </View>

              {/* Quantity */}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Quantity</Text>
                <CountStepper
                  count={editCount}
                  onDecrement={() => setEditCount(c => Math.max(1, c - 1))}
                  onIncrement={() => setEditCount(c => c + 1)}
                />
              </View>

              {/* Category */}
              <View style={styles.catSection}>
                <Text style={styles.fieldLabel}>Category</Text>
                <View style={styles.catGrid}>
                  {ALL_CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.catChip, editCategory === cat && styles.catChipActive]}
                      onPress={() => setEditCategory(cat)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.catChipText, editCategory === cat && styles.catChipTextActive]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Actions */}
              <View style={styles.sheetActions}>
                <TouchableOpacity style={styles.deleteActionBtn} onPress={deleteFromSheet} activeOpacity={0.8}>
                  <Text style={styles.deleteActionText}>Delete item</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveActionBtn} onPress={saveEdit} activeOpacity={0.85}>
                  <Text style={styles.saveActionText}>Save</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
      </Modal>

    </View>
  );
});

const styles = StyleSheet.create({
  swipeWrapper: { overflow: 'hidden' },

  // ── Swipe-delete bubble ───────────────────────────────────────────────────
  deleteBubble: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: 64,
    justifyContent: 'center', alignItems: 'center',
  },
  deleteBubbleInner: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center', alignItems: 'center',
  },
  deleteBubbleIcon: { fontSize: 16 },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical:   14,   // extra 2px each side → 1-line rows feel consistent
    minHeight:         58,
    gap:               0,
  },
  cardChecked: { backgroundColor: '#FAFAFA' },

  // ── Checkbox ──────────────────────────────────────────────────────────────
  checkWrap: {
    alignSelf:      'stretch',  // fill card height so centering is vs the full row
    justifyContent: 'center',   // circle is vertically centered inside that height
    alignItems:     'center',
    paddingRight:   2,          // gap between circle edge and emoji
  },
  checkCircle: {
    width:          22,
    height:         22,
    borderRadius:   11,
    borderWidth:    1.5,
    borderColor:    '#D0D5DD',
    alignItems:     'center',
    justifyContent: 'center',
  },
  checkCircleChecked: {
    backgroundColor: Colors.primary,
    borderColor:     Colors.primary,
  },
  checkMark: {
    color:      '#fff',
    fontSize:   11,
    fontWeight: '800',
    lineHeight: 13,
  },

  // ── Row body (emoji + name) ───────────────────────────────────────────────
  rowBody: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
  },

  // ── Emoji ─────────────────────────────────────────────────────────────────
  emoji: { fontSize: 20, lineHeight: 24, marginRight: 8 },

  // ── Name + unit ───────────────────────────────────────────────────────────
  nameArea:    { flex: 1, gap: 2, marginRight: 4, justifyContent: 'center' },
  nameWrap:    { position: 'relative', justifyContent: 'center' },
  name:        { fontSize: 15, fontWeight: '500', color: '#111111', letterSpacing: -0.1 },
  nameChecked: { color: '#AEAEB2' },
  unit:        { fontSize: 13, fontWeight: '400', color: '#666666' },
  unitFaded:   { color: '#C4C8D0' },

  strikethrough: {
    position:        'absolute',
    left:            0,
    right:           0,
    height:          1.5,
    backgroundColor: '#AEAEB2',
    transformOrigin: 'left center',
  },

  // ── Inline price ──────────────────────────────────────────────────────────
  // Fixed-width column so ₹100, ₹50, ₹— all occupy identical horizontal space
  inlinePriceBox: {
    width:         76,          // fixed: enough for ₹9999, reserves same slot every row
    flexDirection: 'row',
    alignItems:    'center',
    marginLeft:    6,
    marginRight:   2,
  },
  inlinePriceSymbol: {
    fontSize:    15,
    fontWeight:  '600',
    color:       '#111',
    fontVariant: ['tabular-nums'],
  },
  inlinePriceSymbolDim: {},             // ₹ never dims
  inlinePriceInput: {
    flex:               1,              // fills remaining width inside the fixed box
    fontSize:           15,
    fontWeight:         '600',
    color:              '#111',
    textAlign:          'left',         // value starts immediately after ₹
    fontVariant:        ['tabular-nums'],
    padding:            0,
    paddingHorizontal:  0,
    includeFontPadding: false,
  },
  inlinePriceInputDim: { color: '#BFC4CC' },

  // Checked: read-only faded total — same fixed column width as unchecked
  // Checked: read-only faded total — renders inside inlinePriceBox (no extra margins)
  priceChecked: {
    fontSize:    14,
    fontWeight:  '400',
    color:       '#C4C8D0',
    fontVariant: ['tabular-nums'],
    textAlign:   'left',
  },

  // ── Hidden but layout-preserving ────────────────────────────────────────
  // Keeps element in the flex layout (same width/height) but invisible.
  // Prevents layout reflow when checking/unchecking items.
  hiddenKeepLayout: { opacity: 0 },

  // ── Stepper wrapper ───────────────────────────────────────────────────────
  stepperWrap:        { marginLeft: 0 },
  stepperWrapDimmed:  { opacity: 0.4 },   // clearly unset, not "broken"

  // ── Edit sheet ────────────────────────────────────────────────────────────
  sheetBackdrop:  { backgroundColor: 'rgba(0,0,0,0.35)' },
  sheetContainer: { flex: 1, justifyContent: 'flex-end' },

  sheet: {
    backgroundColor:      '#FFFFFF',
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    paddingTop:           12,
    paddingHorizontal:    24,
    paddingBottom:        44,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center', marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 17, fontWeight: '700', color: '#1A1A2E',
    flex: 1,
  },
  sheetTitleStandalone: {
    marginBottom: 12,
  },
  sheetDivider: {
    height:          StyleSheet.hairlineWidth,
    backgroundColor: '#F0F1F3',
    marginBottom:    16,
  },

  // Fields
  fieldRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   16,
  },
  fieldLabel: {
    fontSize: 15, fontWeight: '500', color: '#333',
  },
  priceInputRow: {
    flexDirection:     'row',
    alignItems:        'center',
    borderWidth:       1.5,
    borderColor:       '#E5E7EB',
    borderRadius:      10,
    paddingHorizontal: 12,
    minWidth:          110,
    backgroundColor:   '#FAFAFA',
  },
  pricePrefix: {
    fontSize: 16, fontWeight: '600', color: '#333',
    marginRight: 4,
  },
  priceField: {
    flex:        1,
    fontSize:    16,
    fontWeight:  '600',
    color:       '#111',
    paddingVertical: 10,
    fontVariant: ['tabular-nums'],
  },

  // Category chips
  catSection: { marginBottom: 18 },
  catGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           7,
    marginTop:     8,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical:   6,
    borderRadius:      20,
    borderWidth:       1,
    borderColor:       '#E5E7EB',
    backgroundColor:   '#F9FAFB',
  },
  catChipActive: {
    backgroundColor: Colors.primary,
    borderColor:     Colors.primary,
  },
  catChipText:       { fontSize: 13, fontWeight: '500', color: '#444' },
  catChipTextActive: { color: '#fff', fontWeight: '600' },

  // Action buttons — side by side
  sheetActions: {
    flexDirection: 'row',
    gap:           10,
  },
  deleteActionBtn: {
    flex:            1,
    paddingVertical: 14,
    borderRadius:    12,
    borderWidth:     1.5,
    borderColor:     '#FCA5A5',
    alignItems:      'center',
    backgroundColor: '#FFF5F5',
  },
  deleteActionText: { fontSize: 15, fontWeight: '600', color: '#EF4444' },
  saveActionBtn: {
    flex:            1,
    paddingVertical: 14,
    borderRadius:    12,
    backgroundColor: Colors.primary,
    alignItems:      'center',
  },
  saveActionText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

