import React, { useState, useRef, useEffect } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useListStore } from '../../store/useListStore';
import { Colors } from '../../constants/colors';
import { Spacing, Radius } from '../../constants/spacing';
import { IconClose, IconCheck, IconCamera, IconGallery } from '../ui/Icons';
import {
  isBackendReady,
  SCAN_DAILY_LIMIT,
  checkCameraPermission,
  requestCameraPermission,
  requestMediaLibraryPermission,
  pickReceiptImage,
  scanReceipt,
  getScanRemaining,
  RateLimitError,
  NotReceiptError,
} from '../../services/ReceiptService';
import { loadHistory, saveHistory } from '../../services/storage';
import type { GroceryItem, ParsedItem, TripSummary } from '../../types';

const IS_BACKEND_READY = isBackendReady();

type ScanState = 'permission' | 'idle' | 'processing' | 'result' | 'error' | 'saved';

interface SessionItem extends ParsedItem {
  key: string;
  editing: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ScanModal({ visible, onClose }: Props) {
  const addItem = useListStore(s => s.addItem);
  const insets  = useSafeAreaInsets();

  const [scanState,    setScanState]    = useState<ScanState>('idle');
  const [sessionItems, setSessionItems] = useState<SessionItem[]>([]);
  const [errorMsg,     setErrorMsg]     = useState('');
  const [remaining,    setRemaining]    = useState<number | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [addedCount,   setAddedCount]   = useState(0);

  const resultSlide     = useRef(new Animated.Value(300)).current;
  const sheetSlide      = useRef(new Animated.Value(500)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      sheetSlide.setValue(500);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(sheetSlide, { toValue: 0, tension: 120, friction: 14, useNativeDriver: true }),
      ]).start();
      checkCameraPermission().then(granted => {
        setScanState(granted ? 'idle' : 'permission');
      });
      // Fetch remaining scans upfront
      if (IS_BACKEND_READY) {
        setLoadingUsage(true);
        getScanRemaining().then(r => {
          setRemaining(r);
          setLoadingUsage(false);
        });
      }
    }
  }, [visible]);

  async function handleAllowCamera() {
    const granted = await requestCameraPermission();
    if (granted) {
      setScanState('idle');
    } else {
      setScanState('error');
      setErrorMsg('Camera access denied. Enable it in Settings → Listorix → Camera.');
    }
  }

  function animateResultIn() {
    resultSlide.setValue(300);
    Animated.spring(resultSlide, {
      toValue: 0, tension: 120, friction: 14, useNativeDriver: true,
    }).start();
  }

  // ── Capture handler ────────────────────────────────────────────────────────
  async function handleCapture(source: 'camera' | 'gallery') {
    setErrorMsg('');
    setSessionItems([]);
    setAddedCount(0);

    // Request appropriate permission
    if (source === 'camera') {
      const granted = await requestCameraPermission();
      if (!granted) {
        setScanState('error');
        setErrorMsg('Camera access needed \u2014 allow in Settings');
        return;
      }
    } else {
      const granted = await requestMediaLibraryPermission();
      if (!granted) {
        setScanState('error');
        setErrorMsg('Photo library access needed \u2014 allow in Settings');
        return;
      }
    }

    let base64: string | null;
    try {
      base64 = await pickReceiptImage(source);
    } catch (err) {
      setScanState('error');
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not read the image. Try a different photo.',
      );
      return;
    }

    if (!base64) return; // User cancelled

    setScanState('processing');

    if (!IS_BACKEND_READY) {
      // Demo mode
      setTimeout(() => {
        processResult([
          { name: 'Sugar', qty: '1kg', price: 45, category: 'Spices' },
          { name: 'Milk', qty: '2L', price: 90, category: 'Dairy' },
          { name: 'Tomatoes', qty: '500g', price: 40, category: 'Vegetables' },
          { name: 'Paneer', qty: '200g', price: 120, category: 'Dairy' },
        ]);
      }, 2000);
      return;
    }

    try {
      const result = await scanReceipt(base64);
      setRemaining(result.remaining);
      processResult(result.items);
    } catch (err) {
      if (err instanceof NotReceiptError) {
        setScanState('error');
        setErrorMsg('This doesn\'t look like a receipt. Please scan a grocery bill or receipt only.');
      } else if (err instanceof RateLimitError) {
        setScanState('error');
        setErrorMsg('Daily scan limit reached (10/day). Try again tomorrow.');
        setRemaining(0);
      } else {
        setScanState('error');
        setErrorMsg(err instanceof Error ? err.message : "Couldn't read this receipt");
      }
    }
  }

  // ── Process OCR result ─────────────────────────────────────────────────────
  function processResult(parsedItems: ParsedItem[]) {
    if (parsedItems.length === 0) {
      setScanState('error');
      setErrorMsg("Couldn't find any items on this receipt. Try a clearer photo.");
      return;
    }

    const mapped: SessionItem[] = parsedItems.map((item, i) => ({
      ...item,
      key: `${Date.now()}-${i}`,
      editing: false,
    }));

    setSessionItems(mapped);
    setScanState('result');
    animateResultIn();
  }

  // ── Save to Insights ───────────────────────────────────────────────────────
  async function handleSaveToInsights() {
    const groceryItems: GroceryItem[] = sessionItems.map(item => ({
      id:        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name:      item.name,
      qty:       item.qty ?? '',
      price:     item.price ?? 0,
      count:     item.count ?? 1,
      category:  item.category,
      checked:   true,
      createdAt: Date.now(),
    }));

    const total = groceryItems.reduce((sum, item) => sum + item.price * item.count, 0);

    const newTrip: TripSummary = {
      id:    Date.now().toString(),
      date:  Date.now(),
      items: groceryItems,
      total,
    };

    const existing = await loadHistory();
    await saveHistory([newTrip, ...existing]);

    setScanState('saved');
    setTimeout(() => { reset(); onClose(); }, 1500);
  }

  // ── Add to list ────────────────────────────────────────────────────────────
  function handleAddToList() {
    sessionItems.forEach((item, i) => {
      setTimeout(() => {
        addItem({ name: item.name, qty: item.qty, category: item.category, price: item.price });
      }, i * 80);
    });

    setAddedCount(sessionItems.length);

    setTimeout(() => {
      reset();
      onClose();
    }, 1200);
  }

  // ── Inline editing ─────────────────────────────────────────────────────────
  function toggleEditItem(key: string) {
    setSessionItems(prev =>
      prev.map(item =>
        item.key === key ? { ...item, editing: !item.editing } : item,
      ),
    );
  }

  function updateItemName(key: string, newName: string) {
    setSessionItems(prev =>
      prev.map(item =>
        item.key === key ? { ...item, name: newName } : item,
      ),
    );
  }

  function updateItemQty(key: string, newQty: string) {
    setSessionItems(prev =>
      prev.map(item =>
        item.key === key ? { ...item, qty: newQty } : item,
      ),
    );
  }

  function removeSessionItem(key: string) {
    setSessionItems(prev => {
      const next = prev.filter(item => item.key !== key);
      if (next.length === 0) setScanState('idle');
      return next;
    });
  }

  // ── Reset / Close ──────────────────────────────────────────────────────────
  function reset() {
    // Re-check permission so 'permission' screen shows if still denied
    checkCameraPermission().then(granted => setScanState(granted ? 'idle' : 'permission'));
    setSessionItems([]);
    setErrorMsg('');
    setAddedCount(0);
    // Don't reset remaining — keep the count as it is (may have changed after a scan)
  }

  function handleClose() {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sheetSlide, { toValue: 500, duration: 220, useNativeDriver: true }),
    ]).start(() => { reset(); onClose(); });
  }

  function handleRetry() {
    reset();
  }

  // ── Status text ────────────────────────────────────────────────────────────
  function getStatusText(): string {
    switch (scanState) {
      case 'idle':
        return 'Take a clear photo of your receipt';
      case 'processing':
        return 'Reading receipt\u2026';
      case 'result':
        if (addedCount > 0) {
          return `\u2713 ${addedCount} item${addedCount !== 1 ? 's' : ''} added to your list`;
        }
        return `${sessionItems.length} item${sessionItems.length !== 1 ? 's' : ''} found on receipt`;
      case 'saved':
        return '\u2713 Saved to Insights';
      case 'error':
        return errorMsg;
      default:
        return '';
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: sheetSlide }] }]}>
        <View style={styles.handle} />

        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.title}>Scan Receipt</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <IconClose size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* ── Permission rationale ────────────────────────────────────── */}
        {scanState === 'permission' && (
          <View style={styles.permissionScreen}>
            <View style={styles.permissionIconWrap}>
              <IconCamera size={36} color={Colors.primary} />
            </View>
            <Text style={styles.permissionTitle}>Allow Camera Access</Text>
            <Text style={styles.permissionBody}>
              Listorix needs camera access to photograph your receipt and
              automatically extract grocery items. Photos are processed and
              not stored.
            </Text>
            <TouchableOpacity
              style={styles.permissionAllowBtn}
              onPress={handleAllowCamera}
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

        {/* ── Idle: capture buttons ───────────────────────────────────── */}
        {scanState === 'idle' && (() => {
          const limitReached = remaining === 0;
          return (
            <View style={styles.captureArea}>
              {!loadingUsage && remaining !== null && (
                <Text style={[styles.usageText, limitReached && styles.usageTextWarning]}>
                  {limitReached
                    ? `Daily limit reached (${SCAN_DAILY_LIMIT}/${SCAN_DAILY_LIMIT}) — resets at midnight`
                    : `${remaining} of ${SCAN_DAILY_LIMIT} scans left today`}
                </Text>
              )}
              <TouchableOpacity
                style={[styles.captureBtn, limitReached && styles.captureBtnDisabled]}
                onPress={limitReached ? undefined : () => handleCapture('camera')}
                activeOpacity={limitReached ? 1 : 0.85}
              >
                <IconCamera size={24} color="#fff" />
                <Text style={styles.captureBtnText}>Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.galleryBtn, limitReached && styles.galleryBtnDisabled]}
                onPress={limitReached ? undefined : () => handleCapture('gallery')}
                activeOpacity={limitReached ? 1 : 0.85}
              >
                <IconGallery size={20} color={limitReached ? Colors.textTertiary : Colors.textPrimary} />
                <Text style={[styles.galleryBtnText, limitReached && styles.galleryBtnTextDisabled]}>
                  Choose from Gallery
                </Text>
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* ── Processing: loading state ───────────────────────────────── */}
        {scanState === 'processing' && (
          <View style={styles.processingArea}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}

        {/* ── Status text ────────────────────────────────────────────── */}
        <Text
          style={[
            styles.status,
            scanState === 'error' && styles.statusError,
            (addedCount > 0 || scanState === 'saved') && styles.statusSuccess,
          ]}
        >
          {getStatusText()}
        </Text>

        {/* ── Error: retry button ────────────────────────────────────── */}
        {scanState === 'error' && !(remaining === 0) && (
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        )}

        {/* ── Result: parsed items ───────────────────────────────────── */}
        {scanState === 'result' && sessionItems.length > 0 && addedCount === 0 && (
          <Animated.View
            style={[
              styles.resultContainer,
              { transform: [{ translateY: resultSlide }] },
            ]}
          >
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
                        onChangeText={(v) => updateItemQty(item.key, v)}
                        selectTextOnFocus
                      />
                      <TextInput
                        style={styles.itemEditName}
                        value={item.name}
                        onChangeText={(v) => updateItemName(item.key, v)}
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
                      {(item.price ?? 0) > 0 && (
                        <Text style={styles.itemPriceText}>{'\u20B9'}{item.price}</Text>
                      )}
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.itemRemoveBtn}
                    onPress={() => removeSessionItem(item.key)}
                  >
                    <IconClose size={14} color={Colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            {remaining !== null && (
              <Text style={styles.remainingText}>
                {remaining} scan{remaining !== 1 ? 's' : ''} left today
              </Text>
            )}

            <View style={styles.resultActions}>
              <TouchableOpacity style={styles.saveInsightsBtn} onPress={handleSaveToInsights}>
                <Text style={styles.saveInsightsBtnText}>Save to Insights</Text>
              </TouchableOpacity>
              <View style={styles.resultActionsRow}>
                <TouchableOpacity style={styles.addToListBtn} onPress={handleAddToList}>
                  <Text style={styles.addToListBtnText}>
                    Add {sessionItems.length} item{sessionItems.length !== 1 ? 's' : ''} to list
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.redoBtn} onPress={handleRetry}>
                  <Text style={styles.redoBtnText}>Redo</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        )}

        {/* ── Added confirmation ─────────────────────────────────────── */}
        {addedCount > 0 && (
          <View style={styles.addedConfirmation}>
            <Text style={styles.addedText}>
              {addedCount} item{addedCount !== 1 ? 's' : ''} added to your list
            </Text>
          </View>
        )}

        {/* ── Demo notice ────────────────────────────────────────────── */}
        {!IS_BACKEND_READY && scanState === 'idle' && (
          <Text style={styles.notice}>
            Demo mode — connect Supabase + deploy Edge Function for real scanning
          </Text>
        )}
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
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },

  captureArea: {
    gap: 12,
    marginBottom: 20,
  },
  usageText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textTertiary,
    textAlign: 'center',
    marginBottom: 4,
  },
  usageTextWarning: {
    color: Colors.danger,
  },
  captureBtnDisabled: {
    backgroundColor: Colors.textTertiary,
    shadowOpacity: 0,
    elevation: 0,
  },
  galleryBtnDisabled: {
    opacity: 0.5,
  },
  galleryBtnTextDisabled: {
    color: Colors.textTertiary,
  },
  captureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  captureBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  galleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.bg,
    borderRadius: Radius.md,
    paddingVertical: 14,
  },
  galleryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },

  processingArea: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 80,
    marginBottom: 8,
  },

  status: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  statusError: {
    color: Colors.danger,
  },
  statusSuccess: {
    color: Colors.success,
  },

  retryBtn: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg,
    marginTop: 4,
    marginBottom: 8,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },

  resultContainer: {
    marginTop: 4,
  },
  itemsList: {
    maxHeight: 260,
    marginBottom: 8,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    gap: 10,
  },
  itemCardCheck: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemEditRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemEditQty: {
    width: 60,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary,
    paddingVertical: 2,
  },
  itemEditName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary,
    paddingVertical: 2,
  },
  itemQtyBold: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
    minWidth: 40,
  },
  itemNameText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  itemPriceText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  itemRemoveBtn: {
    padding: 4,
  },

  remainingText: {
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginBottom: 8,
  },

  resultActions: {
    gap: 8,
    marginTop: 4,
  },
  saveInsightsBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  saveInsightsBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  resultActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  addToListBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  addToListBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primary,
  },
  redoBtn: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redoBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  addedConfirmation: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  addedText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.success,
  },

  notice: {
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 8,
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
