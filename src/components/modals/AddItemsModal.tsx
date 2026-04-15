import React, {
  useState, useRef, useEffect, useCallback, useMemo, memo,
} from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Animated, Keyboard, Easing, Platform,
} from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useListStore } from '../../store/useListStore';
import { parseBulkText } from '../../services/VoiceParser';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { IconClose } from '../ui/Icons';
import type { ParsedItem } from '../../types';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const SHEET_HIDDEN_Y = 300;
const SHEET_OPEN_MS = 180;
const SHEET_CLOSE_MS = 180;
const REVEAL_DELAY_MS = Platform.OS === 'ios' ? 45 : 0;

export function AddItemsModal({ visible, onClose }: Props) {
  const addItem = useListStore(s => s.addItem);
  const insets  = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const sheetSlide      = useRef(new Animated.Value(SHEET_HIDDEN_Y)).current;
  const sheetOpacity    = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [text, setText]         = useState('');
  const [parsedText, setParsedText] = useState('');
  const [parsed, setParsed]     = useState<ParsedItem[]>([]);
  const [kbHeight, setKbHeight] = useState(0);
  const [active, setActive]     = useState(false); // controls pointerEvents
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef    = useRef(false);
  const revealedRef   = useRef(false);

  const clearRevealTimer = useCallback(() => {
    if (revealTimer.current) {
      clearTimeout(revealTimer.current);
      revealTimer.current = null;
    }
  }, []);

  const resetSheetState = useCallback(() => {
    sheetSlide.stopAnimation();
    sheetOpacity.stopAnimation();
    backdropOpacity.stopAnimation();
    sheetSlide.setValue(SHEET_HIDDEN_Y);
    sheetOpacity.setValue(0);
    backdropOpacity.setValue(0);
    revealedRef.current = false;
  }, [backdropOpacity, sheetOpacity, sheetSlide]);

  const revealSheet = useCallback(() => {
    if (!visible || closingRef.current || revealedRef.current) return;

    revealedRef.current = true;
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 1, duration: 130, useNativeDriver: true }),
      Animated.timing(sheetOpacity, {
        toValue: 1,
        duration: 90,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetSlide, {
        toValue: 0,
        duration: SHEET_OPEN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, sheetOpacity, sheetSlide, visible]);

  const runCloseAnimation = useCallback((notifyParent: boolean) => {
    if (!active || closingRef.current) return;

    closingRef.current = true;
    clearRevealTimer();
    revealedRef.current = false;
    inputRef.current?.blur();
    Keyboard.dismiss();

    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(sheetOpacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(sheetSlide, {
        toValue: SHEET_HIDDEN_Y,
        duration: SHEET_CLOSE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setText('');
      setParsedText('');
      setParsed([]);
      setKbHeight(0);
      setActive(false);
      closingRef.current = false;
      resetSheetState();
      if (notifyParent) onClose();
    });
  }, [active, backdropOpacity, clearRevealTimer, onClose, resetSheetState, sheetOpacity, sheetSlide]);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      setActive(true);
      setKbHeight(0);
      resetSheetState();
      inputRef.current?.focus();
    } else if (active) {
      runCloseAnimation(false);
    }
  }, [active, resetSheetState, runCloseAnimation, visible]);

  // Keyboard drives the animation — sheet rises with keyboard
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKbHeight(e.endCoordinates.height);
      if (visible) {
        clearRevealTimer();
        revealTimer.current = setTimeout(revealSheet, REVEAL_DELAY_MS);
      }
    });
    const didShowSub = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates.height));
    const hideSub    = Keyboard.addListener(hideEvent, () => {
      clearRevealTimer();
      setKbHeight(0);
    });
    return () => {
      clearRevealTimer();
      showSub.remove();
      didShowSub.remove();
      hideSub.remove();
    };
  }, [clearRevealTimer, revealSheet, visible]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      clearRevealTimer();
    };
  }, [clearRevealTimer]);

  const handleClose = useCallback(() => {
    runCloseAnimation(true);
  }, [runCloseAnimation]);

  const handleTextChange = useCallback((t: string) => {
    setText(t);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!t.trim()) { setParsedText(''); setParsed([]); return; }
    debounceTimer.current = setTimeout(() => {
      requestAnimationFrame(() => setParsedText(t));
    }, 150);
  }, []);

  useEffect(() => {
    if (!parsedText.trim()) { setParsed([]); return; }
    const id = requestAnimationFrame(() => setParsed(parseBulkText(parsedText)));
    return () => cancelAnimationFrame(id);
  }, [parsedText]);

  const validLineIndices = useMemo(() => {
    return text.split('\n')
      .map((line, idx) => (line.trim().length > 0 ? idx : -1))
      .filter(idx => idx >= 0);
  }, [text]);

  const hasItems = parsed.length > 0;

  const handleAdd = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const final = parseBulkText(text);
    if (!final.length) return;
    final.forEach((item, i) => setTimeout(() => addItem(item), i * 40));
    handleClose();
  }, [text, addItem, handleClose]);

  const removeChip = useCallback((chipIndex: number) => {
    const lineIdx = validLineIndices[chipIndex];
    if (lineIdx === undefined) return;
    const lines = text.split('\n');
    const next  = lines.filter((_, i) => i !== lineIdx).join('\n');
    setText(next);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => requestAnimationFrame(() => setParsedText(next)), 150);
    inputRef.current?.focus();
  }, [text, validLineIndices]);

  const btnLabel = hasItems
    ? `Add ${parsed.length} ${parsed.length === 1 ? 'item' : 'items'}`
    : 'Add items';

  const bottomPad = kbHeight > 0 ? kbHeight + 10 : insets.bottom + 10;

  // Always rendered — never unmounts so TextInput is always focusable
  return (
    <View
      style={[StyleSheet.absoluteFillObject, { zIndex: active ? 999 : -1 }]}
      pointerEvents={active ? 'auto' : 'none'}
    >
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents={active ? 'auto' : 'none'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={handleClose} activeOpacity={1} />
      </Animated.View>

      {/* Sheet — slides up with keyboard */}
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: bottomPad, opacity: sheetOpacity, transform: [{ translateY: sheetSlide }] },
        ]}
      >
        <SafeAreaView style={{ flex: 1 }}>
          {/* Header */}
          <View style={styles.header}>
            <View />
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <IconClose size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Scrollable: textarea + chips */}
          <ScrollView style={styles.scrollArea} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.textareaWrap}>
              <TextInput
                ref={inputRef}
                style={styles.textarea}
                value={text}
                onChangeText={handleTextChange}
                multiline
                placeholder="Add items (one per line)"
                placeholderTextColor="#C0C4CC"
                textAlignVertical="top"
                autoCapitalize="sentences"
                autoCorrect={false}
                selectionColor={Colors.primary}
              />
            </View>
            {hasItems && <ParsedChips parsed={parsed} onRemove={removeChip} />}
          </ScrollView>

          {/* Sticky button */}
          <TouchableOpacity
            style={[styles.addBtn, !hasItems && styles.addBtnOff]}
            onPress={handleAdd}
            disabled={!hasItems}
            activeOpacity={0.85}
          >
            <Text style={[styles.addBtnText, !hasItems && styles.addBtnTextOff]}>
              {btnLabel}
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

// ── Chips ──────────────────────────────────────────────────────────────────────

const ParsedChips = memo(function ParsedChips({
  parsed, onRemove,
}: { parsed: ParsedItem[]; onRemove: (i: number) => void }) {
  return (
    <View style={styles.chipsWrap}>
      {parsed.map((item, i) => (
        <Chip key={i} item={item} index={i} onRemove={onRemove} />
      ))}
    </View>
  );
});

const Chip = memo(function Chip({
  item, index, onRemove,
}: { item: ParsedItem; index: number; onRemove: (i: number) => void }) {
  return (
    <TouchableOpacity style={styles.chip} onPress={() => onRemove(index)} activeOpacity={0.65}>
      <Text style={styles.chipText} numberOfLines={1}>
        {item.qty ? `${item.name} · ${item.qty}` : item.name}
      </Text>
      <Text style={styles.chipX}>×</Text>
    </TouchableOpacity>
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0, top: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 14,
  },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  scrollArea: { flex: 1, marginBottom: 10 },
  textareaWrap: {
    backgroundColor: '#F7F8FA',
    borderRadius: 12,
    marginBottom: 10,
  },
  textarea: {
    minHeight: 180,
    maxHeight: 280,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 17,
    color: Colors.textPrimary,
    lineHeight: 27,
    letterSpacing: -0.2,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.primary + '0E',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  chipText: { fontSize: 12, fontWeight: '500', color: Colors.primary },
  chipX: { fontSize: 14, color: Colors.primary, opacity: 0.6, lineHeight: 16 },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18, shadowRadius: 8, elevation: 4,
  },
  addBtnOff: { backgroundColor: '#F0F1F3', shadowOpacity: 0, elevation: 0 },
  addBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.2 },
  addBtnTextOff: { color: '#B0B4BC' },
});
