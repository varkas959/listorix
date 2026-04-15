import React, {
  useState, useRef, useEffect, useCallback, useMemo, memo,
} from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Keyboard, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useListStore } from '../src/store/useListStore';
import {
  getParsedItemMergeKey,
  mergeParsedItems,
  parseBulkText,
} from '../src/services/VoiceParser';
import { Colors } from '../src/constants/colors';
import { Spacing } from '../src/constants/spacing';
import type { ParsedItem } from '../src/types';

interface PreviewItem {
  item: ParsedItem;
  sourceLineIndex: number;
}

export default function AddItemsScreen() {
  const router  = useRouter();
  const addItem = useListStore(s => s.addItem);
  const insets  = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [text, setText]             = useState('');
  const [parsedText, setParsedText] = useState('');
  const [kbHeight, setKbHeight]     = useState(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const subs = [
      Keyboard.addListener('keyboardWillShow', (e) => setKbHeight(e.endCoordinates.height)),
      Keyboard.addListener('keyboardDidShow',  (e) => setKbHeight(e.endCoordinates.height)),
      Keyboard.addListener('keyboardWillHide',  () => setKbHeight(0)),
      Keyboard.addListener('keyboardDidHide',   () => setKbHeight(0)),
    ];
    // Focus after listeners are ready
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    return () => { clearTimeout(t); subs.forEach(s => s.remove()); };
  }, []);

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
    return text.split('\n')
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
    if (!final.length) return;
    final.forEach((item, i) => setTimeout(() => addItem(item), i * 40));
    router.back();
  }, [text, addItem, router]);

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

  return (
    <View style={[
      styles.screen,
      {
        paddingTop: insets.top + 10,
        paddingBottom: kbHeight > 0 ? kbHeight + 10 : insets.bottom + 10,
      },
    ]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Add items</Text>
          <Text style={styles.subtitle}>One item per line</Text>
        </View>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.75}
        >
          <Text style={styles.closeBtnText}>x</Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable middle: textarea + chips */}
      <ScrollView
        style={styles.scrollArea}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.textareaWrap}>
          <TextInput
            ref={inputRef}
            style={styles.textarea}
            value={text}
            onChangeText={handleTextChange}
            multiline
            autoFocus={false}
            placeholder="Add items (one per line)"
            placeholderTextColor="#C0C4CC"
            textAlignVertical="top"
            autoCapitalize="sentences"
            autoCorrect={false}
            selectionColor={Colors.primary}
            scrollEnabled
          />
        </View>
        {hasItems && (
          <ParsedChips parsed={previewItems.map(entry => entry.item)} onRemove={removeChip} />
        )}
      </ScrollView>

      {/* Button — outside scroll, always visible */}
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
    <TouchableOpacity
      style={styles.chip}
      onPress={() => onRemove(index)}
      activeOpacity={0.65}
    >
      <Text style={styles.chipText} numberOfLines={1}>
        {item.qty ? `${item.name} · ${item.qty}` : item.name}
      </Text>
      <Text style={styles.chipX}>×</Text>
    </TouchableOpacity>
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerCopy: {
    gap: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: -0.1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F7FB',
    borderWidth: 1,
    borderColor: '#EDF1F5',
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  scrollArea: {
    flex: 1,
    marginBottom: 12,
  },
  textareaWrap: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
    elevation: 1,
  },
  textarea: {
    minHeight: 180,
    maxHeight: 280,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    fontSize: 18,
    color: Colors.textPrimary,
    lineHeight: 29,
    letterSpacing: -0.2,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#F4F8FE',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E3EDF9',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#5A86BC',
  },
  chipX: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7FA3CD',
    lineHeight: 14,
  },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 3,
  },
  addBtnOff: {
    backgroundColor: '#EEF1F4',
    shadowOpacity: 0,
    elevation: 0,
  },
  addBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },
  addBtnTextOff: {
    color: '#B0B4BC',
  },
});
