import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Alert,
  Share,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Switch,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Colors } from '../../src/constants/colors';
import { Spacing, Radius, Shadow } from '../../src/constants/spacing';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useListStore } from '../../src/store/useListStore';
import { getProfile, updateProfile } from '../../src/services/api';
import {
  loadHistory,
  getStorePreference, setStorePreference,
  getNotificationsEnabled, setNotificationsEnabled,
  getLocalBudget, setLocalBudget,
  clearAllLocalData,
} from '../../src/services/storage';
import { getTranslations } from '../../src/i18n';
import { supabase } from '../../src/services/supabase';
import {
  loadFeatureIdeas,
  submitFeatureIdea,
  toggleFeatureIdeaVote,
  type FeatureIdea,
  type FeatureIdeaStatus,
} from '../../src/services/featureIdeas';
import {
  requestNotificationPermission,
  scheduleWeeklyReminder,
  cancelWeeklyReminder,
  areNotificationsPermitted,
} from '../../src/services/NotificationService';
import type { Profile } from '../../src/types';
import { formatAmount, useCurrencySettings } from '../../src/utils/currency';

const STORE_OPTIONS = [
  { key: 'local',       label: 'Local store',  sub: 'Neighbourhood shop, market, etc.' },
  { key: 'supermarket', label: 'Supermarket',  sub: 'Large grocery chain, warehouse club, etc.' },
  { key: 'online',      label: 'Online',        sub: 'Delivery app, online grocer, marketplace' },
];

const SUPPORT_EMAIL = 'support@listorix.com';

function openSupportEmail(subject: string, body?: string) {
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
  Linking.openURL(mailto).catch(() => undefined);
}

// ── Budget input modal ────────────────────────────────────────────────────────
function BudgetModal({
  visible,
  current,
  onSave,
  onClose,
  label,
}: {
  visible: boolean;
  current: string;
  onSave: (v: string) => void;
  onClose: () => void;
  label: string;
}) {
  const [val, setVal] = useState(current);
  const { currencySymbol } = useCurrencySettings();
  useEffect(() => { setVal(current); }, [current, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{label}</Text>
          <View style={styles.budgetInputRow}>
            <Text style={styles.budgetPrefix}>{currencySymbol}</Text>
            <TextInput
              style={styles.budgetInput}
              value={val}
              onChangeText={setVal}
              keyboardType="numeric"
              placeholder="e.g. 5000"
              placeholderTextColor={Colors.textTertiary}
              autoFocus
              maxLength={7}
            />
          </View>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancel} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSave}
              onPress={() => { onSave(val); onClose(); }}
            >
              <Text style={styles.modalSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Feedback modal ────────────────────────────────────────────────────────────
function FeedbackModal({
  visible,
  userId,
  onClose,
  onEmailFallback,
}: {
  visible: boolean;
  userId: string | undefined;
  onClose: () => void;
  onEmailFallback: (message: string, rating: number) => void;
}) {
  const [rating,      setRating]  = useState(0);
  const [message,     setMessage] = useState('');
  const [submitting,  setSubmit]  = useState(false);

  function reset() { setRating(0); setMessage(''); }

  async function handleSubmit() {
    if (!message.trim()) {
      Alert.alert('Add a message', 'Please write a few words before submitting.');
      return;
    }
    setSubmit(true);
    try {
      const { error } = await supabase.from('feedback').insert({
        user_id: userId ?? null,
        rating:  rating > 0 ? rating : null,
        message: message.trim(),
      });
      if (error) throw error;
      Alert.alert('Thank you!', 'Your feedback has been received.');
      reset();
      onClose();
    } catch {
      Alert.alert(
        'Could not send in-app feedback',
        'You can still send this message to support by email.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Email Support',
            onPress: () => onEmailFallback(message.trim(), rating),
          },
        ],
      );
    } finally {
      setSubmit(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Send Feedback</Text>

          {/* Star rating */}
          <View style={styles.starsRow}>
            {[1,2,3,4,5].map(star => (
              <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.7}>
                <Text style={[styles.star, star <= rating && styles.starFilled]}>★</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Message */}
          <TextInput
            style={styles.feedbackInput}
            value={message}
            onChangeText={setMessage}
            placeholder="Tell us what you think or report an issue…"
            placeholderTextColor={Colors.textTertiary}
            multiline
            numberOfLines={4}
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{message.length}/500</Text>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancel} onPress={() => { reset(); onClose(); }}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSave, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <Text style={styles.modalSaveText}>{submitting ? 'Sending…' : 'Submit'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
function statusMeta(status: FeatureIdeaStatus): { label: string; toneStyle: object; textStyle: object } {
  switch (status) {
    case 'planned':
      return {
        label: 'Planned',
        toneStyle: styles.ideaStatusPlanned,
        textStyle: styles.ideaStatusTextPlanned,
      };
    case 'in_progress':
      return {
        label: 'In progress',
        toneStyle: styles.ideaStatusInProgress,
        textStyle: styles.ideaStatusTextInProgress,
      };
    default:
      return {
        label: 'Open',
        toneStyle: styles.ideaStatusOpen,
        textStyle: styles.ideaStatusTextOpen,
      };
  }
}

function stableIdeaHash(id: string): number {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) % 997;
  }
  return hash;
}

function IdeasModal({
  visible,
  onClose,
  userId,
}: {
  visible: boolean;
  onClose: () => void;
  userId?: string;
}) {
  const [ideas, setIdeas] = useState<FeatureIdea[]>([]);
  const [votedIdeaIds, setVotedIdeaIds] = useState<string[]>([]);
  const [ideaTitle, setIdeaTitle] = useState('');
  const [ideaDescription, setIdeaDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const syncIdeas = useCallback(async () => {
    const shouldShowBlockingLoader = ideas.length === 0 && !hasLoadedOnce;
    if (shouldShowBlockingLoader) {
      setLoading(true);
    }
    try {
      const state = await loadFeatureIdeas(userId);
      setIdeas(state.ideas);
      setVotedIdeaIds(state.votedIdeaIds);
      setHasLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  }, [hasLoadedOnce, ideas.length, userId]);

  useEffect(() => {
    if (!visible) return;
    syncIdeas();
  }, [visible, syncIdeas]);

  const orderedIdeas = [...ideas].sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.title.localeCompare(b.title);
  });

  const displayVoteCounts = new Map<string, number>();
  let previousDisplay = 50;
  orderedIdeas.forEach((idea, index) => {
    if (idea.votes < 10) {
      const value = Math.max(1, idea.votes);
      displayVoteCounts.set(idea.id, Math.min(value, previousDisplay - 1 || value));
      previousDisplay = displayVoteCounts.get(idea.id) ?? previousDisplay;
      return;
    }

    if (idea.votes < 50) {
      const value = Math.min(idea.votes, previousDisplay - 1);
      const nextValue = Math.max(10, value);
      displayVoteCounts.set(idea.id, nextValue);
      previousDisplay = nextValue;
      return;
    }

    const tierFloor = Math.max(10, 49 - index * 4);
    const tierCeiling = Math.max(tierFloor, previousDisplay - 1);
    const span = Math.max(1, Math.min(4, tierCeiling - tierFloor + 1));
    const offset = stableIdeaHash(idea.id) % span;
    const nextValue = Math.max(tierFloor, tierCeiling - offset);
    displayVoteCounts.set(idea.id, nextValue);
    previousDisplay = nextValue;
  });

  const showLoadingState = ideas.length === 0 && (loading || (visible && !hasLoadedOnce));

  async function handleVote(ideaId: string) {
    try {
      const next = await toggleFeatureIdeaVote(ideaId, userId);
      setIdeas(next.ideas);
      setVotedIdeaIds(next.votedIdeaIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'VOTE_FAILED';
      if (message === 'AUTH_REQUIRED') {
        Alert.alert('Sign in required', 'Sign in to vote on ideas from the Listorix community.');
        return;
      }
      Alert.alert('Could not vote', 'Please try again in a moment.');
    }
  }

  async function handleSubmitIdea() {
    if (!ideaTitle.trim()) {
      Alert.alert('Add an idea', 'Write a short feature idea before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitFeatureIdea({
        title: ideaTitle,
        description: ideaDescription,
      }, userId);
      setIdeas(result.state.ideas);
      setVotedIdeaIds(result.state.votedIdeaIds);
      setIdeaTitle('');
      setIdeaDescription('');
      Alert.alert(
        result.merged ? 'Vote added' : 'Idea added',
        result.merged
          ? 'That idea already existed, so your vote was added to it.'
          : 'Your idea is now on the Listorix board.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SUBMIT_FAILED';
      if (message === 'AUTH_REQUIRED') {
        Alert.alert('Sign in required', 'Sign in to submit ideas so we can count them globally.');
        return;
      }
      Alert.alert('Could not add idea', 'Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.ideasOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          style={styles.ideasSheetWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.ideasSheet}>
            <View style={styles.ideasHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ideasTitle}>Community Ideas</Text>
                <Text style={styles.ideasSubtitle}>
                  Vote on ideas and suggest what Listorix should build next.
                </Text>
              </View>
              <TouchableOpacity style={styles.ideasCloseBtn} onPress={onClose} activeOpacity={0.8}>
                <Text style={styles.ideasCloseText}>{'\u00D7'}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.ideasScroll}
              contentContainerStyle={styles.ideasScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.ideaList}>
                {showLoadingState ? (
                  <Text style={styles.ideaLoading}>Loading ideas...</Text>
                ) : (
                  orderedIdeas.map(idea => {
                    const hasVoted = votedIdeaIds.includes(idea.id);
                    const meta = statusMeta(idea.status);

                    return (
                      <View key={idea.id} style={styles.ideaRow}>
                        <TouchableOpacity
                          style={[styles.ideaVotePill, hasVoted && styles.ideaVotePillActive]}
                          onPress={() => handleVote(idea.id)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.ideaVoteArrow, hasVoted && styles.ideaVoteArrowActive]}>^</Text>
                          <Text style={[styles.ideaVoteCount, hasVoted && styles.ideaVoteCountActive]}>
                            {displayVoteCounts.get(idea.id) ?? 1}
                          </Text>
                        </TouchableOpacity>

                        <View style={styles.ideaBody}>
                          <View style={styles.ideaTitleRow}>
                            <Text style={styles.ideaTitleText}>{idea.title}</Text>
                            <View style={[styles.ideaStatusPill, meta.toneStyle]}>
                              <Text style={[styles.ideaStatusText, meta.textStyle]}>{meta.label}</Text>
                            </View>
                          </View>
                          <Text style={styles.ideaDescriptionText}>{idea.description}</Text>
                          <Text style={styles.ideaMetaText}>
                            {hasVoted ? 'You voted for this' : 'Tap vote to support this idea'}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>

              {!showLoadingState && (
                <View style={styles.ideaComposer}>
                  <Text style={styles.ideaComposerTitle}>Share a new idea</Text>
                  <TextInput
                    style={styles.ideaComposerInput}
                    value={ideaTitle}
                    onChangeText={setIdeaTitle}
                    placeholder="What should Listorix build next?"
                    placeholderTextColor={Colors.textTertiary}
                    maxLength={80}
                  />
                  <TextInput
                    style={[styles.ideaComposerInput, styles.ideaComposerTextarea]}
                    value={ideaDescription}
                    onChangeText={setIdeaDescription}
                    placeholder="Optional: add a little context"
                    placeholderTextColor={Colors.textTertiary}
                    multiline
                    numberOfLines={3}
                    maxLength={180}
                    textAlignVertical="top"
                  />
                  <TouchableOpacity
                    style={[styles.ideaComposerButton, submitting && styles.ideaComposerButtonDisabled]}
                    onPress={handleSubmitIdea}
                    disabled={submitting}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.ideaComposerButtonText}>
                      {submitting ? 'Adding...' : 'Add idea'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default function ProfileScreen() {
  const insets    = useSafeAreaInsets();
  const router    = useRouter();
  const { user, signOut } = useAuthStore();
  const clearList = useListStore(s => s.clearList);

  const [profile,         setProfile]         = useState<Profile | null>(null);
  const [notifEnabled,    setNotifEnabled]     = useState(true);
  const [localBudget,     setLocalBudgetState] = useState<number | null>(null);
  const [budgetModal,     setBudgetModal]      = useState(false);
  const [budgetDraft,     setBudgetDraft]      = useState('');
  const [feedbackModal,   setFeedbackModal]    = useState(false);
  const [ideasModal,      setIdeasModal]       = useState(false);
  const { currencyCode, currencySymbol, locale } = useCurrencySettings();

  const t = getTranslations('en');

  function emailFeedbackFallback(feedbackMessage: string, feedbackRating: number) {
    const ratingLine = feedbackRating > 0 ? `Rating: ${feedbackRating}/5\n\n` : '';
    openSupportEmail(
      'Listorix Feedback',
      `${ratingLine}${feedbackMessage}`.trim(),
    );
  }

  // ── Load all preferences ──────────────────────────────────────────────────
  async function loadPrefs() {
    const [notif, bud, permitted] = await Promise.all([
      getNotificationsEnabled(),
      getLocalBudget(),
      areNotificationsPermitted(),
    ]);
    // If OS permission was revoked externally, reflect that in the toggle
    const effectiveNotif = notif && permitted;
    if (notif && !permitted) await setNotificationsEnabled(false);
    setNotifEnabled(effectiveNotif);
    setLocalBudgetState(bud);

    if (user) {
      const p = await getProfile(user.id);
      if (p) setProfile(p);
    } else {
      setProfile(null);  // clear stale profile data on sign-out
    }
  }

  useEffect(() => { loadPrefs(); }, [user]);
  useFocusEffect(useCallback(() => { loadPrefs(); }, [user]));

  // ── Derived display values ────────────────────────────────────────────────
  const displayName  = profile?.displayName ?? user?.email?.split('@')[0] ?? '—';
  // Avatar: prefer first letter of email so it's always stable across name changes
  const avatarLetter = user ? (user.email?.[0] ?? displayName[0] ?? '?').toUpperCase() : '?';
  // Pick a colour from a fixed palette — same letter always gets same colour
  const AVATAR_PALETTE = [
    '#2F80ED','#27AE60','#9B59B6','#E67E22',
    '#16A085','#E91E8C','#C2884B','#E74C3C',
  ];
  const avatarColor = AVATAR_PALETTE[avatarLetter.charCodeAt(0) % AVATAR_PALETTE.length];
  // Detect Google provider
  const isGoogle = user?.app_metadata?.provider === 'google';
  const effectiveBudget = profile?.budget ?? localBudget;
  const budgetLabel  = effectiveBudget != null ? `${currencySymbol}${formatAmount(effectiveBudget)}` : t.notSet;
  const storeLabel   = profile?.storePreference
    ?? (await_getStore())
    ?? t.notSet;

  // sync store label from AsyncStorage for non-supabase path
  const [storeVal, setStoreVal] = useState<string>(t.notSet);
  useEffect(() => {
    getStorePreference().then(s => {
      if (s) {
        const found = STORE_OPTIONS.find(o => o.key === s);
        setStoreVal(found?.label ?? s);
      } else if (profile?.storePreference) {
        const found = STORE_OPTIONS.find(o => o.key === profile.storePreference);
        setStoreVal(found?.label ?? profile.storePreference ?? t.notSet);
      }
    });
  }, [profile]);


  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleStore() {
    Alert.alert(
      t.defaultStore,
      undefined,
      [
        ...STORE_OPTIONS.map(opt => ({
          text: `${opt.label}  —  ${opt.sub}`,
          onPress: async () => {
            await setStorePreference(opt.key);
            setStoreVal(opt.label);
            if (user) await updateProfile(user.id, { storePreference: opt.key });
          },
        })),
        { text: t.cancel, style: 'cancel' as const },
      ],
    );
  }

  function handleBudget() {
    setBudgetDraft(effectiveBudget != null ? String(effectiveBudget) : '');
    setBudgetModal(true);
  }

  async function saveBudget(raw: string) {
    const num = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    const amount = isNaN(num) ? null : num;
    await setLocalBudget(amount);
    setLocalBudgetState(amount);
    if (user && amount != null) await updateProfile(user.id, { budget: amount });
  }

  async function handleExportHistory() {
    try {
      const trips = await loadHistory();
      if (trips.length === 0) {
        Alert.alert('No history', 'Complete a shopping trip first to export history.');
        return;
      }

      // Build CSV
      const header = `Date,Items,Total (${currencyCode})\n`;
      const rows = trips.map(trip => {
        const date = new Date(trip.date).toLocaleDateString(locale, {
          day: '2-digit', month: 'short', year: 'numeric',
        });
        const itemList = trip.items.map(i => i.name).join(' | ');
        return `"${date}","${itemList}",${trip.total}`;
      });
      const csv = header + rows.join('\n');

      await Share.share({
        message: csv,
        title: 'Listorix Shopping History',
      });
    } catch (e) {
      Alert.alert('Export failed', 'Could not export history. Please try again.');
    }
  }

  function handleClearAllLists() {
    Alert.alert(
      'Clear all lists?',
      'This will remove all items from your current list. Your history will be kept.',
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearList();
            Alert.alert('Done', 'Your list has been cleared.');
          },
        },
      ],
    );
  }

  async function handleNotifications() {
    const next = !notifEnabled;

    if (next) {
      // Turning ON — request permission first
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert(
          'Permission Required',
          'Please enable notifications in Settings → Listorix → Notifications.',
          [{ text: 'OK' }],
        );
        return; // Keep toggle off
      }
      await scheduleWeeklyReminder();
      await setNotificationsEnabled(true);
      setNotifEnabled(true);
      Alert.alert(
        '🔔 Reminders on',
        'You\'ll get a reminder every Saturday at 10 AM to plan your grocery list.',
      );
    } else {
      // Turning OFF — cancel scheduled notifications
      await cancelWeeklyReminder();
      await setNotificationsEnabled(false);
      setNotifEnabled(false);
    }
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'All your lists, history and insights will be deleted forever.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      // Delete all user data then the account via Supabase function
                      const { error } = await supabase.rpc('delete_user');
                      if (error) throw error;
                      await clearAllLocalData();
                      await signOut();
                    } catch (e) {
                      Alert.alert(
                        'Could not delete account',
                        'Please email support and we will help delete your account.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Email Support',
                            onPress: () => openSupportEmail('Delete my Listorix account'),
                          },
                        ],
                      );
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }

  async function handleSignOut() {
    Alert.alert(
      t.signOut,
      'Your local list is safely stored. You can sign back in anytime.',
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.signOut,
          style: 'destructive',
          onPress: async () => {
            await signOut();
            // No explicit navigation — route guard handles state change.
            // User stays on profile tab which re-renders with signed-out view.
          },
        },
      ],
    );
  }

  // ── Menu sections ─────────────────────────────────────────────────────────
  const SECTIONS = [
    {
      title: t.preferences,
      items: [
        { label: t.defaultStore,  value: storeVal,    onPress: handleStore,  arrow: true },
        { label: t.monthlyBudget, value: budgetLabel, onPress: handleBudget, arrow: true },
      ],
    },
    {
      title: t.data,
      items: [
        { label: t.exportHistory,  value: '',   onPress: handleExportHistory, danger: false, arrow: true },
      ],
    },
    {
      title: t.account,
      items: [
        {
          label: t.notifications,
          value: '',
          onPress: handleNotifications,
          toggle: true,
          toggleValue: notifEnabled,
        },
        { label: t.version, value: '1.0.0', onPress: undefined, arrow: false },
        ...(user
          ? [
              { label: t.signOut,        value: 'Local list stays on device', onPress: handleSignOut,       danger: true,  arrow: true },
              { label: 'Delete Account', value: 'Permanently removes all data', onPress: handleDeleteAccount, danger: true, arrow: true },
            ]
          : [{ label: 'Sign In', value: 'Sync across devices', onPress: () => router.push('/auth' as any), danger: false, arrow: true }]
        ),
      ],
    },
    {
      title: 'Support',
      items: [
        {
          label: 'Vote on ideas and suggest',
          value: '',
          onPress: () => setIdeasModal(true),
          arrow: true,
        },
        {
          label: 'Send Feedback',
          value: '',
          onPress: () => setFeedbackModal(true),
          arrow: true,
        },
        {
          label: 'Contact Support',
          value: SUPPORT_EMAIL,
          onPress: () => openSupportEmail('Support Request - Listorix'),
          arrow: true,
        },
      ],
    },
    {
      title: t.legal,
      items: [
        {
          label: t.termsOfService,
          value: '',
          onPress: () => router.push('/legal/terms' as any),
          arrow: true,
        },
        {
          label: t.privacyPolicy,
          value: '',
          onPress: () => router.push('/legal/privacy' as any),
          arrow: true,
        },
      ],
    },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <BudgetModal
        visible={budgetModal}
        current={budgetDraft}
        onSave={saveBudget}
        onClose={() => setBudgetModal(false)}
        label={t.monthlyBudget}
      />
      <FeedbackModal
        visible={feedbackModal}
        userId={user?.id}
        onEmailFallback={emailFeedbackFallback}
        onClose={() => setFeedbackModal(false)}
      />
      <IdeasModal
        visible={ideasModal}
        userId={user?.id}
        onClose={() => setIdeasModal(false)}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>{t.profile}</Text>

        {/* Avatar card */}
        <View style={[styles.avatarCard, Shadow.card]}>
          {/* Circle with ring */}
          <View style={[styles.avatarRing, { borderColor: `${avatarColor}40` }]}>
            <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
              <Text style={styles.avatarText}>{avatarLetter}</Text>
            </View>
            {/* Google badge */}
            {isGoogle && (
              <View style={styles.avatarBadge}>
                <Text style={styles.avatarBadgeText}>G</Text>
              </View>
            )}
          </View>

          <View style={{ flex: 1 }}>
            {user ? (
              <>
                <Text style={styles.userName}>{displayName}</Text>
                <Text style={styles.userSub} numberOfLines={1}>{user.email}</Text>
                {isGoogle && (
                  <View style={styles.providerPill}>
                    <Text style={styles.providerPillText}>Google account</Text>
                  </View>
                )}
              </>
            ) : (
              <>
                <Text style={styles.userName}>Guest</Text>
                <Text style={styles.userSub}>Sign in to sync your list</Text>
              </>
            )}
          </View>
        </View>

        {/* Menu sections */}
        {SECTIONS.map(section => (
          <View key={section.title}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={[styles.menuCard, Shadow.card]}>
              {section.items.map((item, i) => (
                <TouchableOpacity
                  key={item.label}
                  style={[
                    styles.menuRow,
                    i < section.items.length - 1 && styles.menuRowBorder,
                  ]}
                  activeOpacity={item.onPress ? 0.55 : 1}
                  onPress={item.onPress}
                  disabled={!item.onPress}
                >
                  <Text style={[styles.menuLabel, (item as any).danger && styles.menuLabelDanger]}>
                    {item.label}
                  </Text>

                  {/* Toggle switch */}
                  {(item as any).toggle ? (
                    <Switch
                      value={(item as any).toggleValue}
                      onValueChange={item.onPress}
                      trackColor={{ false: Colors.border, true: Colors.primary }}
                      thumbColor="#fff"
                    />
                  ) : item.value ? (
                    <Text style={styles.menuValue}>{item.value}</Text>
                  ) : (item as any).arrow ? (
                    <Text style={styles.menuChevron}>›</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// Dummy to avoid TS error for async in render — getStorePreference is called in useEffect
function await_getStore(): string | null { return null; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.md, gap: 16, paddingBottom: 140 },

  pageTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },

  // ── Avatar card ────────────────────────────────────────────────────────────
  avatarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 14,
  },
  // Outer ring — same hue as avatar, very faint
  avatarRing: {
    width: 68, height: 68, borderRadius: 34,
    borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center',
  },
  avatar: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  // Google (or future provider) badge on the bottom-right of the ring
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarBadgeText: { fontSize: 11, fontWeight: '800', color: '#4285F4' },
  userName: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  userSub:  { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  providerPill: {
    marginTop: 5, alignSelf: 'flex-start',
    backgroundColor: '#EEF4FF',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },
  providerPillText: { fontSize: 10, fontWeight: '600', color: Colors.primary },

  // ── Sections ───────────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: Colors.textTertiary,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 6, paddingHorizontal: 4,
  },
  menuCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 14,
  },
  menuRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  menuLabel:        { fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
  menuLabelDanger:  { color: Colors.danger },
  menuValue:        { fontSize: 14, color: Colors.textSecondary },
  menuChevron:      { fontSize: 20, color: Colors.textTertiary },

  // ── Budget modal ───────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: 16,
  },
  modalTitle: {
    fontSize: 17, fontWeight: '700', color: Colors.textPrimary,
    textAlign: 'center',
  },
  budgetInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.bg, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderWidth: 1.5, borderColor: Colors.primary,
    gap: 4,
  },
  budgetPrefix: { fontSize: 20, fontWeight: '700', color: Colors.primary },
  budgetInput:  {
    flex: 1, fontSize: 20, fontWeight: '600', color: Colors.textPrimary,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancel: {
    flex: 1, paddingVertical: 12,
    borderRadius: Radius.md, backgroundColor: Colors.bg,
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  modalSave: {
    flex: 1, paddingVertical: 12,
    borderRadius: Radius.md, backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // ── Feedback modal ─────────────────────────────────────────────────────────
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  star: {
    fontSize: 32,
    color: Colors.border,
  },
  starFilled: {
    color: '#FBBF24',
  },
  feedbackInput: {
    backgroundColor: Colors.bg,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textPrimary,
    minHeight: 100,
  },
  charCount: {
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'right',
    marginTop: -8,
  },

  ideasOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  ideasSheetWrap: {
    width: '100%',
  },
  ideasSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: Spacing.md,
    paddingBottom: 12,
    minHeight: '88%',
    maxHeight: '96%',
  },
  ideasHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  ideasTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  ideasSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSecondary,
  },
  ideasCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F6FB',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ideasCloseText: {
    fontSize: 20,
    lineHeight: 20,
    color: Colors.textSecondary,
    marginTop: -1,
  },
  ideasScroll: {
    flex: 1,
  },
  ideasScrollContent: {
    paddingBottom: 8,
    gap: 10,
  },
  ideaComposer: {
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E6EEF8',
    gap: 10,
  },
  ideaComposerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  ideaComposerInput: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#D9E2EF',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  ideaComposerTextarea: {
    minHeight: 84,
  },
  ideaComposerButton: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  ideaComposerButtonDisabled: {
    opacity: 0.6,
  },
  ideaComposerButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  ideaList: {
    gap: 8,
  },
  ideaLoading: {
    paddingVertical: 18,
    textAlign: 'center',
    color: Colors.textSecondary,
    fontSize: 14,
  },
  ideaRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  ideaVotePill: {
    width: 52,
    minHeight: 60,
    borderRadius: 16,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 1,
  },
  ideaVotePillActive: {
    backgroundColor: '#E8F1FF',
  },
  ideaVoteArrow: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  ideaVoteArrowActive: {
    color: Colors.primary,
  },
  ideaVoteCount: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  ideaVoteCountActive: {
    color: Colors.primary,
  },
  ideaBody: {
    flex: 1,
    gap: 4,
  },
  ideaTitleRow: {
    gap: 6,
  },
  ideaTitleText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 19,
  },
  ideaDescriptionText: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textSecondary,
  },
  ideaMetaText: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  ideaStatusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  ideaStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  ideaStatusOpen: {
    backgroundColor: '#EEF2F7',
  },
  ideaStatusTextOpen: {
    color: '#5B6472',
  },
  ideaStatusPlanned: {
    backgroundColor: '#E7F1FF',
  },
  ideaStatusTextPlanned: {
    color: '#2F80ED',
  },
  ideaStatusInProgress: {
    backgroundColor: '#EAF8EE',
  },
  ideaStatusTextInProgress: {
    color: '#2E9E5B',
  },
});
