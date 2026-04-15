/**
 * AddItemModal — pre-mounted, inline (NO React Native <Modal>).
 *
 * The component lives in the app tree at all times. When visible=false the
 * sheet is offscreen (translateY: 500) and pointerEvents="none".
 *
 * When visible flips to true:
 *   1. focus() fires SYNCHRONOUSLY in useEffect — keyboard starts on the
 *      very same frame before any animation occupies the UI thread.
 *   2. Sheet slides up quickly (120ms easeOut) while keyboard animates.
 *   3. Backdrop fades in.
 *   4. InteractionManager ungates chip strip after everything settles.
 *
 * Result: keyboard is visibly opening by the time the sheet finishes
 * sliding — identical to Notes / WhatsApp behaviour.
 */

import React, {
  useState, useRef, useEffect, useCallback, useMemo, memo,
} from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Pressable, Animated,
  InteractionManager, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useListStore } from '../../store/useListStore';
import {
  getParsedItemMergeKey,
  mergeParsedItems,
  parseBulkText,
} from '../../services/VoiceParser';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { IconClose } from '../ui/Icons';
import type { ParsedItem } from '../../types';

interface Props {
  visible:  boolean;
  onClose:  () => void;
}

interface PreviewItem {
  item: ParsedItem;
  sourceLineIndex: number;
}

const OFFSCREEN = 500;   // translateY when hidden
const DURATION  = 120;   // ms — fast easeOut, not a slow spring

export function AddItemModal({ visible, onClose }: Props) {
  const addItem  = useListStore(s => s.addItem);
  const insets   = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [text, setText]             = useState('');
  const [parsedText, setParsedText] = useState('');
  const [chipsReady, setChipsReady] = useState(false);

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetY          = useRef(new Animated.Value(OFFSCREEN)).current;
  // Keeps sheet invisible until the open animation begins — prevents
  // the native-layer flash that happens before translateY commits.
  const sheetOpacity    = useRef(new Animated.Value(0)).current;
  const debounceTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionTask = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);

  useEffect(() => {
    if (visible) {
      // ── Step 1: focus FIRST — keyboard starts opening immediately ────────
      inputRef.current?.focus();

      // ── Step 2: snap sheet to position quickly ────────────────────────────
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1, duration: DURATION, useNativeDriver: true,
        }),
        Animated.timing(sheetOpacity, {
          toValue: 1, duration: 60, useNativeDriver: true,   // snap visible instantly
        }),
        Animated.timing(sheetY, {
          toValue: 0, duration: DURATION,
          easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
      ]).start();

      // ── Step 3: ungate chips after interaction (animation + keyboard) ─────
      setChipsReady(false);
      interactionTask.current = InteractionManager.runAfterInteractions(() => {
        setChipsReady(true);
      });
    } else {
      // Dismiss — slide away, blur, reset
      inputRef.current?.blur();
      interactionTask.current?.cancel();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(sheetOpacity,    { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(sheetY, {
          toValue: OFFSCREEN, duration: 180,
          easing: Easing.in(Easing.cubic), useNativeDriver: true,
        }),
      ]).start(() => {
        setText('');
        setParsedText('');
        setChipsReady(false);
      });
    }
  }, [visible]);

  // Textarea → instant update; parsing → debounced 150ms
  const handleTextChange = useCallback((t: string) => {
    setText(t);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!t.trim()) { setParsedText(''); return; }
    debounceTimer.current = setTimeout(() => setParsedText(t), 150);
  }, []);

  const parsed = useMemo<ParsedItem[]>(
    () => (parsedText.trim() ? parseBulkText(parsedText) : []),
    [parsedText],
  );

  const validLineIndices = useMemo(() => {
    const lines = text.split('\n');
    return lines
      .map((line, idx) => (line.trim().length > 0 ? idx : -1))
      .filter(idx => idx >= 0);
  }, [text]);

  const previewItems = useMemo<PreviewItem[]>(() => {
    const grouped = new Map<string, PreviewItem>();
    const fallbackItems: PreviewItem[] = [];

    parsed.forEach((item, idx) => {
      const sourceLineIndex = validLineIndices[idx];
      if (sourceLineIndex === undefined) return;

      const key = getParsedItemMergeKey(item);
      if (!key) {
        fallbackItems.push({ item, sourceLineIndex });
        return;
      }

      const existing = grouped.get(key);
      if (existing) {
        existing.item = mergeParsedItems([existing.item, item])[0];
        return;
      }

      grouped.set(key, { item, sourceLineIndex });
    });

    return [...grouped.values(), ...fallbackItems]
      .sort((a, b) => a.sourceLineIndex - b.sourceLineIndex);
  }, [parsed, validLineIndices]);

  const mergedParsed = useMemo(
    () => mergeParsedItems(parsed),
    [parsed],
  );

  const hasItems = mergedParsed.length > 0;

  const handleAdd = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const final = mergeParsedItems(parseBulkText(text));
    if (final.length === 0) return;
    final.forEach((item, i) => setTimeout(() => addItem(item), i * 40));
    onClose();
  }, [text, addItem, onClose]);

  const removeChip = useCallback((chipIndex: number) => {
    const lineIdx = previewItems[chipIndex]?.sourceLineIndex;
    if (lineIdx === undefined) return;
    const lines = text.split('\n');
    const next  = lines.filter((_, i) => i !== lineIdx).join('\n');
    setText(next);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setParsedText(next), 150);
    inputRef.current?.focus();
  }, [previewItems, text]);

  const btnLabel = hasItems
    ? `Add ${mergedParsed.length} ${mergedParsed.length === 1 ? 'item' : 'items'}`
    : 'Add items';

  // When not visible: pointerEvents="none" so touches fall through to the app
  const pointerEvents = visible ? 'box-none' : 'none';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={pointerEvents}>

      {/* Dim layer — only blocks touches when visible */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <KeyboardAvoidingView
        style={styles.kavContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
            { opacity: sheetOpacity, transform: [{ translateY: sheetY }] },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>Add items</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <IconClose size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

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
              scrollEnabled
            />
          </View>

          {chipsReady && (
            <ParsedChips parsed={previewItems.map(entry => entry.item)} onRemove={removeChip} />
          )}

          <View style={styles.actions}>
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
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── ParsedChips ────────────────────────────────────────────────────────────────

const ParsedChips = memo(function ParsedChips({
  parsed, onRemove,
}: { parsed: ParsedItem[]; onRemove: (i: number) => void }) {
  if (parsed.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.previewScroll}
      contentContainerStyle={styles.previewContent}
      keyboardShouldPersistTaps="always"
    >
      {parsed.map((item, i) => (
        <Chip key={i} item={item} index={i} onRemove={onRemove} />
      ))}
    </ScrollView>
  );
});

const Chip = memo(function Chip({
  item, index, onRemove,
}: { item: ParsedItem; index: number; onRemove: (i: number) => void }) {
  return (
    <TouchableOpacity
      style={styles.previewChip}
      onPress={() => onRemove(index)}
      activeOpacity={0.65}
    >
      <Text style={styles.previewChipText} numberOfLines={1}>
        {item.qty ? `${item.name} · ${item.qty}` : item.name}
      </Text>
      <Text style={styles.previewChipX}>×</Text>
    </TouchableOpacity>
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  kavContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDDDE0',
    alignSelf: 'center',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    marginBottom: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F2F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textareaWrap: {
    marginHorizontal: Spacing.md,
    backgroundColor: '#F7F8FA',
    borderRadius: 12,
    marginBottom: 8,
  },
  textarea: {
    minHeight: 148,
    maxHeight: 230,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 17,
    color: Colors.textPrimary,
    lineHeight: 27,
    letterSpacing: -0.2,
  },
  previewScroll: {
    maxHeight: 36,
    marginBottom: 8,
  },
  previewContent: {
    paddingHorizontal: Spacing.md,
    gap: 6,
    alignItems: 'center',
  },
  previewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary + '0E',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    opacity: 0.85,
  },
  previewChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.primary,
  },
  previewChipX: {
    fontSize: 14,
    color: Colors.primary,
    opacity: 0.6,
    lineHeight: 16,
  },
  actions: {
    paddingHorizontal: Spacing.md,
    paddingTop: 4,
    paddingBottom: 2,
  },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  addBtnOff: {
    backgroundColor: '#F0F1F3',
    shadowOpacity: 0,
    elevation: 0,
  },
  addBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  addBtnTextOff: {
    color: '#B0B4BC',
  },
});
