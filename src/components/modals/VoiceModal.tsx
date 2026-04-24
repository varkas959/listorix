import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Pressable,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useListStore } from '../../store/useListStore';
import { useAuthStore } from '../../store/useAuthStore';
import { Colors } from '../../constants/colors';
import { Spacing, Radius } from '../../constants/spacing';
import { IconMic, IconClose, IconCheck } from '../ui/Icons';
import { parseTranscript } from '../../services/VoiceParser';
import {
  VOICE_LANGUAGES,
  VOICE_DAILY_LIMIT,
  hasApiKey,
  checkMicPermission,
  requestMicPermission,
  startRecording,
  stopAndTranscribe,
  cancelRecording,
  getVoiceRemaining,
  RateLimitError,
  AuthRequiredError,
} from '../../services/SpeechService';
import type { ParsedItem } from '../../types';

const LANG_STORAGE_KEY = 'listorix:voiceLang';
const IS_BACKEND_READY = hasApiKey();

const LANGUAGE_EXAMPLES: Record<string, string> = {
  en: 'Try: "1 kg rice, 2 milk, tomatoes"',
  hi: 'Try: "1 kilo cheeni, 2 litre doodh"',
  te: 'Try: "1 kilo biyyam, 2 litre paalu"',
  ta: 'Try: "1 kilo arisi, 2 litre paal"',
  kn: 'Try: "1 kilo akki, 2 litre haalu"',
};

type VoiceState = 'permission' | 'idle' | 'listening' | 'processing' | 'result' | 'error';

interface SessionItem extends ParsedItem {
  key: string;
  editing: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function VoiceModal({ visible, onClose }: Props) {
  const addItem = useListStore(s => s.addItem);
  const items   = useListStore(s => s.items);
  const insets  = useSafeAreaInsets();
  const user    = useAuthStore(s => s.user);

  const [voiceState,   setVoiceState]   = useState<VoiceState>('idle');
  const [langIndex,    setLangIndex]    = useState(0);
  const [sessionItems, setSessionItems] = useState<SessionItem[]>([]);
  const [transcript,   setTranscript]   = useState('');
  const [errorMsg,     setErrorMsg]     = useState('');
  const [remaining,    setRemaining]    = useState<number | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [addedCount,   setAddedCount]   = useState(0);
  const [countdown,    setCountdown]    = useState<number | null>(null);

  const micScale       = useRef(new Animated.Value(1)).current;
  const pulseAnim      = useRef(new Animated.Value(1)).current;
  const pulseLoop      = useRef<Animated.CompositeAnimation | null>(null);
  const resultSlide    = useRef(new Animated.Value(300)).current;
  const sheetSlide     = useRef(new Animated.Value(500)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const autoStopTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animate sheet + backdrop in; check mic permission to decide first state
  useEffect(() => {
    if (visible) {
      sheetSlide.setValue(500);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(sheetSlide, { toValue: 0, tension: 120, friction: 14, useNativeDriver: true }),
      ]).start();
      // Check permission status without prompting
      checkMicPermission().then(granted => {
        setVoiceState(granted ? 'idle' : 'permission');
      });
      // Fetch remaining uses upfront
      if (IS_BACKEND_READY) {
        setLoadingUsage(true);
        getVoiceRemaining().then(r => {
          setRemaining(r);
          setLoadingUsage(false);
        });
      }
    }
  }, [visible]);

  const MAX_RECORD_SECONDS = 20;

  const lang = VOICE_LANGUAGES[langIndex];

  // ── Persist language selection ─────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(LANG_STORAGE_KEY).then(val => {
      if (val !== null) {
        const idx = VOICE_LANGUAGES.findIndex(l => l.code === val);
        if (idx >= 0) setLangIndex(idx);
      }
    });
  }, []);

  const selectLang = useCallback((idx: number) => {
    Haptics.selectionAsync();
    setLangIndex(idx);
    AsyncStorage.setItem(LANG_STORAGE_KEY, VOICE_LANGUAGES[idx].code);
  }, []);

  // ── Animations ────────────────────────────────────────────────────────────
  function startPulse() {
    Animated.spring(micScale, {
      toValue: 1.2, tension: 140, friction: 6, useNativeDriver: true,
    }).start();
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.5, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ]),
    );
    pulseLoop.current.start();
  }

  function stopPulse() {
    pulseLoop.current?.stop();
    Animated.spring(micScale, {
      toValue: 1, tension: 180, friction: 8, useNativeDriver: true,
    }).start();
    Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  }

  // ── Auto-stop countdown ───────────────────────────────────────────────────
  function startAutoStop() {
    setCountdown(MAX_RECORD_SECONDS);
    // Tick every second
    countdownTimer.current = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) return null;
        return prev - 1;
      });
    }, 1000);
    // Hard stop at MAX_RECORD_SECONDS
    autoStopTimer.current = setTimeout(() => {
      handleStopListening();
    }, MAX_RECORD_SECONDS * 1000);
  }

  function clearAutoStop() {
    if (autoStopTimer.current)  { clearTimeout(autoStopTimer.current);  autoStopTimer.current  = null; }
    if (countdownTimer.current) { clearInterval(countdownTimer.current); countdownTimer.current = null; }
    setCountdown(null);
  }

  function animateResultIn() {
    resultSlide.setValue(300);
    Animated.spring(resultSlide, {
      toValue: 0, tension: 120, friction: 14, useNativeDriver: true,
    }).start();
  }

  // ── Permission rationale ───────────────────────────────────────────────────
  async function handleAllowMic() {
    const granted = await requestMicPermission();
    if (granted) {
      setVoiceState('idle');
    } else {
      setVoiceState('error');
      setErrorMsg('Microphone access denied. Enable it in Settings → Listorix → Microphone.');
    }
  }

  // ── Start listening ────────────────────────────────────────────────────────
  async function handleStartListening() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setErrorMsg('');
    setSessionItems([]);
    setTranscript('');
    setAddedCount(0);

    if (!user) {
      setVoiceState('error');
      setErrorMsg('Sign in to use voice input.');
      return;
    }

    const granted = await requestMicPermission();
    if (!granted) {
      setVoiceState('error');
      setErrorMsg('Microphone access needed — allow in Settings');
      return;
    }

    if (!IS_BACKEND_READY) {
      // Demo mode
      setVoiceState('listening');
      startPulse();
      startAutoStop();
      setTimeout(() => {
        clearAutoStop();
        stopPulse();
        const demoText = '1 kilo cheeni, 2 litres milk, 500 grams tomatoes, paneer';
        setTranscript(demoText);
        processText(demoText);
      }, 2000);
      return;
    }

    try {
      await startRecording();
      setVoiceState('listening');
      startPulse();
      startAutoStop();
    } catch {
      setVoiceState('error');
      setErrorMsg('Could not start recording. Try again.');
    }
  }

  // ── Stop listening → transcribe ────────────────────────────────────────────
  async function handleStopListening() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearAutoStop();
    stopPulse();
    if (!IS_BACKEND_READY) return;

    setVoiceState('processing');
    try {
      const result = await stopAndTranscribe(lang.code);
      setTranscript(result.text);
      setRemaining(result.remaining);
      processText(result.text);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err instanceof RateLimitError) {
        setVoiceState('error');
        setErrorMsg('Daily voice limit reached (20/day). Try again tomorrow.');
        setRemaining(0);
      } else if (err instanceof AuthRequiredError) {
        setVoiceState('error');
        setErrorMsg(err.message);
      } else {
        setVoiceState('error');
        setErrorMsg(err instanceof Error ? err.message : "Didn't catch that");
      }
    }
  }

  // ── Mic tap ───────────────────────────────────────────────────────────────
  function handleMicTap() {
    if (voiceState === 'listening') {
      handleStopListening();
    } else if (voiceState === 'idle' || voiceState === 'error') {
      handleStartListening();
    }
  }

  // ── Grocery transcript validator ──────────────────────────────────────────
  // Returns false if the text looks like song lyrics, conversation, or
  // any non-grocery speech — preventing accidental additions.
  function isGroceryLikeTranscript(text: string): boolean {
    const words = text.trim().split(/\s+/);
    // Grocery lists are short; songs/conversations are long
    if (words.length > 55) return false;

    // Sentence-like patterns that never appear in grocery lists
    const nonGroceryPatterns = /\b(i am|i was|i will|i have|you are|you were|they are|he is|she is|is the|was the|were the|in the|on the|to the|of the|and the|my love|my heart|your heart|my life|your life|come back|tell me|show me|i love|i hate|i feel|i think|i know|i need|i want|please|sorry|never|always|forever|together|alone|without|because|although|however|therefore|beautiful|wonderful|amazing|fantastic|the song|the music|the beat|the rhythm)\b/i;
    if (nonGroceryPatterns.test(text)) return false;

    // Split on grocery-style separators to check average segment length
    const segments = text.trim()
      .split(/[,.]|\band\b|\bthen\b|\baur\b|\bphir\b|\balso\b/i)
      .map(s => s.trim()).filter(Boolean);
    const avgWords = segments.reduce((sum, s) => sum + s.split(/\s+/).length, 0)
      / Math.max(segments.length, 1);
    // Grocery items are 1–4 words; song lines are much longer
    if (avgWords > 6) return false;

    return true;
  }

  // ── Parse text → session items ─────────────────────────────────────────────
  function processText(text: string) {
    if (!text.trim()) {
      setVoiceState('error');
      setErrorMsg("Didn't catch that — try again");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    // Guard: reject non-grocery speech (songs, conversations, etc.)
    if (!isGroceryLikeTranscript(text)) {
      setVoiceState('error');
      setErrorMsg('Sounds like music or conversation — say grocery items like "milk, rice, tomatoes"');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const parsed = parseTranscript(text);
    if (parsed.length === 0) {
      setVoiceState('error');
      setErrorMsg("Couldn't understand the items. Try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const merged: SessionItem[] = parsed.map((item, i) => ({
      ...item,
      key: `${Date.now()}-${i}`,
      editing: false,
    }));

    setSessionItems(merged);
    setVoiceState('result');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    animateResultIn();
  }

  // ── Add to list ───────────────────────────────────────────────────────────
  function handleAddToList() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    sessionItems.forEach((item, i) => {
      setTimeout(() => {
        addItem({ name: item.name, qty: item.qty, category: item.category });
      }, i * 80);
    });
    setAddedCount(sessionItems.length);
    setTimeout(() => { reset(); onClose(); }, 1200);
  }

  // ── Inline editing ────────────────────────────────────────────────────────
  function toggleEditItem(key: string) {
    setSessionItems(prev =>
      prev.map(item => item.key === key ? { ...item, editing: !item.editing } : item),
    );
  }

  function updateItemName(key: string, val: string) {
    setSessionItems(prev =>
      prev.map(item => item.key === key ? { ...item, name: val } : item),
    );
  }

  function updateItemQty(key: string, val: string) {
    setSessionItems(prev =>
      prev.map(item => item.key === key ? { ...item, qty: val } : item),
    );
  }

  function removeSessionItem(key: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSessionItems(prev => prev.filter(item => item.key !== key));
  }

  // ── Reset / close ─────────────────────────────────────────────────────────
  function reset() {
    clearAutoStop();
    setVoiceState('idle');
    setSessionItems([]);
    setTranscript('');
    setErrorMsg('');
    setAddedCount(0);
    stopPulse();
    // Keep remaining count — already updated from latest API response
  }

  async function handleClose() {
    clearAutoStop();
    if (voiceState === 'listening') cancelRecording(); // fire, don't await
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sheetSlide, { toValue: 500, duration: 220, useNativeDriver: true }),
    ]).start(() => { reset(); onClose(); });
  }

  function handleRetry() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVoiceState('idle');
    setErrorMsg('');
    setTranscript('');
    setTimeout(() => handleStartListening(), 100);
  }

  // ── Status / hint text ────────────────────────────────────────────────────
  function getStatusText(): string {
    if (limitReached && voiceState === 'idle') {
      return `Daily limit reached (${VOICE_DAILY_LIMIT}/${VOICE_DAILY_LIMIT})`;
    }
    switch (voiceState) {
      case 'idle':       return 'Tap the mic and say grocery items';
      case 'listening':  return `Listening… speak in ${lang.script}`;
      case 'processing': return 'Understanding…';
      case 'result':
        return addedCount > 0
          ? `✓ ${addedCount} item${addedCount !== 1 ? 's' : ''} added`
          : `${sessionItems.length} item${sessionItems.length !== 1 ? 's' : ''} found`;
      case 'error':      return errorMsg;
      default:           return '';
    }
  }

  function getHintText(): string | null {
    if (voiceState === 'idle') {
      if (limitReached) return 'Resets at midnight. Try again tomorrow.';
      if (!loadingUsage && remaining !== null) return `${remaining} of ${VOICE_DAILY_LIMIT} uses left today`;
      return LANGUAGE_EXAMPLES[lang.code] ?? LANGUAGE_EXAMPLES.en;
    }
    return null;
  }

  const limitReached = remaining === 0;
  const micDisabled  = voiceState === 'processing' || addedCount > 0 || limitReached;

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        {/* Animated backdrop — fades in independently, no black flash */}
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>
        {/* Sheet slides up independently */}
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: sheetSlide }] }]}>
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Voice Add</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <IconClose size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* ── Permission rationale ──────────────────────────────────── */}
        {voiceState === 'permission' && (
          <View style={styles.permissionScreen}>
            <View style={styles.permissionIconWrap}>
              <IconMic size={36} color={Colors.primary} />
            </View>
            <Text style={styles.permissionTitle}>Allow Microphone Access</Text>
            <Text style={styles.permissionBody}>
              Listorix needs microphone access to listen to you say grocery items.
              Your voice is processed to recognise items — nothing is stored.
            </Text>
            <TouchableOpacity
              style={styles.permissionAllowBtn}
              onPress={handleAllowMic}
              activeOpacity={0.85}
            >
              <Text style={styles.permissionAllowText}>Allow Access</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.permissionDenyBtn}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Text style={styles.permissionDenyText}>Not Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Language chips + mic + all controls — hidden on permission screen */}
        {voiceState !== 'permission' && <>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.langRow}
          style={styles.langScroll}
        >
          {VOICE_LANGUAGES.map((l, i) => (
            <TouchableOpacity
              key={l.code}
              style={[styles.langChip, i === langIndex && styles.langChipActive]}
              onPress={() => selectLang(i)}
              disabled={voiceState === 'listening' || voiceState === 'processing'}
            >
              <Text style={[styles.langChipText, i === langIndex && styles.langChipTextActive]}>
                {l.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.languageMeta}>Voice language: {lang.script}</Text>
        {/* Mic button with pulse ring */}
        <View style={styles.micArea}>
          <Animated.View
            style={[
              styles.micPulseRing,
              { transform: [{ scale: pulseAnim }], opacity: voiceState === 'listening' ? 0.3 : 0 },
            ]}
          />
          <Animated.View style={{ transform: [{ scale: micScale }] }}>
            <TouchableOpacity
              style={[
                styles.micBtn,
                voiceState === 'listening' && styles.micBtnListening,
                micDisabled && styles.micBtnDisabled,
              ]}
              onPress={micDisabled ? undefined : handleMicTap}
              activeOpacity={micDisabled ? 1 : 0.85}
            >
              {voiceState === 'processing'
                ? <ActivityIndicator color="#fff" size="small" />
                : voiceState === 'listening' && countdown !== null && countdown <= 10
                  ? <Text style={styles.countdown}>{countdown}</Text>
                  : <IconMic size={32} color="#fff" />
              }
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Status */}
        <Text style={[
          styles.status,
          (voiceState === 'error' || limitReached) && styles.statusError,
          addedCount > 0 && styles.statusSuccess,
        ]}>
          {getStatusText()}
        </Text>

        {/* Hint */}
        {getHintText() && <Text style={styles.hint}>{getHintText()}</Text>}
        {voiceState === 'idle' && (
          <>
            <Text style={styles.reassurance}>You can say item names in your language.</Text>
            <Text style={styles.reassuranceSecondary}>You can review and edit items before adding.</Text>
          </>
        )}

        {/* Live transcript */}
        {transcript !== '' && voiceState !== 'result' && (
          <Text style={styles.transcript}>"{transcript}"</Text>
        )}

        {/* Retry button */}
        {voiceState === 'error' && remaining !== 0 && (
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        )}

        {/* Result items */}
        {voiceState === 'result' && sessionItems.length > 0 && addedCount === 0 && (
          <Animated.View style={[styles.resultContainer, { transform: [{ translateY: resultSlide }] }]}>
            {transcript !== '' && (
              <Text style={styles.transcriptSmall}>"{transcript}"</Text>
            )}

            <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
              {sessionItems.map(item => (
                <View key={item.key} style={styles.itemCard}>
                  <View style={styles.itemCardCheck}>
                    <IconCheck size={12} color={Colors.primary} />
                  </View>
                  {item.editing ? (
                    <View style={styles.itemEditRow}>
                      <TextInput
                        style={styles.itemEditQty}
                        value={item.qty}
                        onChangeText={v => updateItemQty(item.key, v)}
                        selectTextOnFocus
                      />
                      <TextInput
                        style={styles.itemEditName}
                        value={item.name}
                        onChangeText={v => updateItemName(item.key, v)}
                        selectTextOnFocus
                        autoFocus
                      />
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.itemCardContent}
                      onPress={() => toggleEditItem(item.key)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.itemQtyBold}>{item.qty}</Text>
                      <Text style={styles.itemNameText}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.itemRemoveBtn} onPress={() => removeSessionItem(item.key)}>
                    <IconClose size={14} color={Colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            {remaining !== null && (
              <Text style={styles.remainingText}>
                {remaining} voice use{remaining !== 1 ? 's' : ''} left today
              </Text>
            )}

            <View style={styles.resultActions}>
              <TouchableOpacity style={styles.addToListBtn} onPress={handleAddToList}>
                <Text style={styles.addToListBtnText}>
                  Add {sessionItems.length} item{sessionItems.length !== 1 ? 's' : ''} to list
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.redoBtn} onPress={handleRetry}>
                <Text style={styles.redoBtnText}>Redo</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        </>}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingHorizontal: Spacing.md,
    maxHeight: '85%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },

  langScroll: { marginBottom: 20, flexGrow: 0 },
  langRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 2 },
  langChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg,
  },
  langChipActive: { backgroundColor: Colors.primary },
  langChipText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  langChipTextActive: { color: '#fff' },
  languageMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 12,
  },

  micArea: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 110,
    marginBottom: 12,
  },
  micPulseRing: {
    position: 'absolute',
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: Colors.primary,
  },
  micBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  micBtnListening: { backgroundColor: '#E53935', shadowColor: '#E53935' },
  micBtnDisabled: { backgroundColor: Colors.textTertiary, shadowOpacity: 0, elevation: 0 },
  countdown: { fontSize: 22, fontWeight: '800', color: '#fff' },

  status: {
    fontSize: 15, fontWeight: '600', color: Colors.textPrimary,
    textAlign: 'center', marginBottom: 4,
  },
  statusError: { color: Colors.danger },
  statusSuccess: { color: Colors.success },
  hint: {
    fontSize: 13, color: Colors.textTertiary,
    textAlign: 'center', marginBottom: 8,
  },
  reassurance: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
  },
  reassuranceSecondary: {
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginBottom: 10,
  },
  transcript: {
    fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic',
    textAlign: 'center', marginBottom: 12, paddingHorizontal: 8,
  },
  transcriptSmall: {
    fontSize: 12, color: Colors.textTertiary, fontStyle: 'italic',
    textAlign: 'center', marginBottom: 10,
  },

  retryBtn: {
    alignSelf: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg,
    marginTop: 8,
  },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },

  resultContainer: { marginTop: 8 },
  itemsList: { maxHeight: 220, marginBottom: 8 },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg,
    borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 6, gap: 10,
  },
  itemCardCheck: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.primarySubtle,
    alignItems: 'center', justifyContent: 'center',
  },
  itemCardContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemEditRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemEditQty: {
    width: 60, fontSize: 14, fontWeight: '700', color: Colors.primary,
    borderBottomWidth: 1, borderBottomColor: Colors.primary, paddingVertical: 2,
  },
  itemEditName: {
    flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textPrimary,
    borderBottomWidth: 1, borderBottomColor: Colors.primary, paddingVertical: 2,
  },
  itemQtyBold: { fontSize: 14, fontWeight: '700', color: Colors.primary, minWidth: 40 },
  itemNameText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  itemRemoveBtn: { padding: 4 },

  remainingText: {
    fontSize: 12, color: Colors.textTertiary,
    textAlign: 'center', marginBottom: 8,
  },

  resultActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  addToListBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addToListBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  redoBtn: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  redoBtnText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },

  notice: {
    fontSize: 11, color: Colors.textTertiary,
    textAlign: 'center', marginTop: 8, paddingHorizontal: 8,
  },

  // ── Permission rationale ──────────────────────────────────────────────────
  permissionScreen: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 12,
  },
  permissionIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primarySubtle,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  permissionTitle: {
    fontSize: 18, fontWeight: '800',
    color: Colors.textPrimary, letterSpacing: -0.3,
    textAlign: 'center',
  },
  permissionBody: {
    fontSize: 14, color: Colors.textSecondary,
    lineHeight: 22, textAlign: 'center',
    paddingHorizontal: 8,
  },
  permissionAllowBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  permissionAllowText: {
    fontSize: 15, fontWeight: '700', color: '#fff',
  },
  permissionDenyBtn: {
    paddingVertical: 10, paddingHorizontal: 24,
  },
  permissionDenyText: {
    fontSize: 14, fontWeight: '600', color: Colors.textSecondary,
  },
});
