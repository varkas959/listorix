import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TextInput,
  StyleSheet, Pressable, ActivityIndicator, Animated, ScrollView,
  Platform, KeyboardAvoidingView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useListStore } from '../../store/useListStore';
import { useAuthStore } from '../../store/useAuthStore';
import { Colors } from '../../constants/colors';
import { Spacing, Radius } from '../../constants/spacing';
import { IconClose, IconUsers } from './Icons';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ShareListSheet({ visible, onClose }: Props) {
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { user } = useAuthStore();

  const groupId      = useListStore(s => s.groupId);
  const groupMembers = useListStore(s => s.groupMembers);
  const pendingInviteCode = useListStore(s => s.pendingInviteCode);
  const setPendingInviteCode = useListStore(s => s.setPendingInviteCode);
  const createGroup  = useListStore(s => s.createGroup);
  const joinGroup    = useListStore(s => s.joinGroup);
  const removeGroupMember = useListStore(s => s.removeGroupMember);

  const [joinCode,    setJoinCode]    = useState('');
  const [joining,     setJoining]     = useState(false);
  const [creating,    setCreating]    = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [joinError,   setJoinError]   = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const sheetSlide      = useRef(new Animated.Value(500)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const closeTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      sheetSlide.setValue(500);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(sheetSlide, { toValue: 0, tension: 120, friction: 14, useNativeDriver: true }),
      ]).start();
    }
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || groupId || !pendingInviteCode) return;
    setJoinCode(pendingInviteCode);
    setJoinError(null);
  }, [visible, groupId, pendingInviteCode]);

  // Safe close: always calls onClose within 400ms even if animation stalls.
  // This prevents the invisible Modal from blocking all touches.
  function animateClose(then: () => void) {
    // Safety valve — if animation callback never fires, force close after 400ms
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => { then(); }, 400);

    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sheetSlide, { toValue: 500, duration: 220, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      then();
    });
  }

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    const result = await createGroup();
    setCreating(false);
    if (result === 'schema_missing') {
      setCreateError('Household setup is missing in Supabase. Run the household migration, then try again.');
      return;
    }
    if (result !== 'ok') {
      setCreateError('Could not create household. Check your internet and try again.');
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 8) { setJoinError('Enter the 8-character code'); return; }
    setJoining(true);
    setJoinError(null);
    const result = await joinGroup(code);
    setJoining(false);
    if (result === 'ok') {
      setJoinCode('');
      setPendingInviteCode(null);
      animateClose(onClose);
    } else if (result === 'not_found') {
      setJoinError('Code not found — double-check and try again');
    } else {
      setJoinError('Something went wrong. Try again.');
    }
  }

  const currentMember = groupMembers.find(member => member.userId === user?.id);
  const isAdmin = currentMember?.role === 'admin';

  function handleRemoveMember(member: typeof groupMembers[number]) {
    Alert.alert(
      `Remove ${member.displayName ?? 'member'}?`,
      'They will lose access to the live household list right away. Their personal list stays intact, and past shared trips remain visible in history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setRemovingUserId(member.userId);
              const result = await removeGroupMember(member.userId);
              if (result !== 'ok') {
                Alert.alert('Could not remove member', 'Please try again in a moment.');
              }
            } finally {
              setRemovingUserId(null);
            }
          },
        },
      ]
    );
  }

  // Member avatar
  function MemberAvatar({ displayName }: { displayName: string | null }) {
    const initials = displayName
      ? displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
      : '?';
    return (
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
    );
  }

  // ── Shared inner sheet structure (NOT a component — just a render helper)
  // IMPORTANT: Do NOT extract this into a separate component function defined
  // inside this component. Doing so causes React to unmount/remount the Modal
  // on every render, leaving invisible overlays that block all touches.
  const sheetInner = (content: React.ReactNode) => (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => animateClose(onClose)}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Backdrop — tap to dismiss */}
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents="box-none"
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => animateClose(onClose)} />
        </Animated.View>

        {/* Sheet */}
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 24, transform: [{ translateY: sheetSlide }] },
          ]}
        >
          <View style={styles.handle} />
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <IconUsers size={18} color={Colors.primary} />
              <Text style={styles.title}>Household</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => animateClose(onClose)}>
              <IconClose size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {content}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );

  // ─── Branch A: Not signed in ─────────────────────────────────────────────────
  if (!user) {
    return sheetInner(
      <View style={styles.centeredState}>
        <Text style={styles.stateEmoji}>🔒</Text>
        <Text style={styles.stateTitle}>Sign in to share</Text>
        <Text style={styles.stateBody}>
          Create an account to shop with your family in real-time.
        </Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => { animateClose(() => { onClose(); router.replace('/auth'); }); }}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Branch B: User is in a group ────────────────────────────────────────────
  if (groupId) {
    return sheetInner(
      <View style={styles.groupSheetContent}>
        <ScrollView
          style={styles.groupScroll}
          contentContainerStyle={styles.groupScrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
        {/* Member list */}
        {groupMembers.length > 0 && (
          <View style={styles.membersSection}>
            <Text style={styles.sectionLabel}>MEMBERS</Text>
            <Text style={styles.membersLabel}>
              {groupMembers.length} {groupMembers.length === 1 ? 'member' : 'members'}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.membersList}>
              {groupMembers.map(m => (
                <View key={m.userId} style={styles.memberRow}>
                  <View style={styles.memberMain}>
                    <MemberAvatar displayName={m.displayName} />
                    <View style={styles.memberMeta}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {m.userId === user.id ? 'You' : (m.displayName ?? 'Household member')}
                      </Text>
                      <Text style={styles.memberRole}>
                        {m.role === 'admin' ? 'Admin' : 'Member'}
                      </Text>
                    </View>
                  </View>
                  {isAdmin && m.userId !== user.id ? (
                    <TouchableOpacity
                      style={[
                        styles.removeMemberBtn,
                        removingUserId === m.userId && { opacity: 0.6 },
                      ]}
                      onPress={() => handleRemoveMember(m)}
                      disabled={removingUserId === m.userId}
                      activeOpacity={0.7}
                    >
                      {removingUserId === m.userId ? (
                        <ActivityIndicator size="small" color={Colors.danger} />
                      ) : (
                        <Text style={styles.removeMemberText}>Remove</Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.memberPill}>
                      <Text style={styles.memberPillText}>
                        {m.userId === user.id ? 'You' : m.role === 'admin' ? 'Admin' : 'Member'}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        </ScrollView>
      </View>
    );
  }

  // ─── Branch C: Signed in, no group yet ───────────────────────────────────────
  return sheetInner(
    <>
      {/* Create household card */}
      <View style={styles.createCard}>
        <Text style={styles.createEmoji}>👨‍👩‍👧‍👦</Text>
        <Text style={styles.createTitle}>Shop together, live</Text>
        <Text style={styles.createBody}>
          Create a household — your family joins with a code and everyone sees the same list in real-time.
        </Text>
        <TouchableOpacity
          style={[styles.primaryBtn, creating && { opacity: 0.7 }]}
          onPress={handleCreate}
          disabled={creating}
          activeOpacity={0.85}
        >
          {creating
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.primaryBtnText}>Create Household</Text>
          }
        </TouchableOpacity>
        {createError && <Text style={styles.errorText}>{createError}</Text>}
      </View>

      {/* Divider */}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>Already have a code?</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Join by code */}
      <View style={styles.joinSection}>
        {pendingInviteCode ? (
          <Text style={styles.linkHint}>
            Join link detected. Your family code is ready below.
          </Text>
        ) : null}
        <View style={styles.joinRow}>
          <TextInput
            style={[styles.joinInput, joinError ? styles.joinInputError : null]}
            value={joinCode}
            onChangeText={t => { setJoinCode(t.toUpperCase()); setJoinError(null); }}
            placeholder="ABC12345"
            placeholderTextColor={Colors.textTertiary}
            maxLength={8}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.joinBtn, joining && { opacity: 0.7 }]}
            onPress={handleJoin}
            disabled={joining}
            activeOpacity={0.85}
          >
            {joining
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.joinBtnText}>Join</Text>
            }
          </TouchableOpacity>
        </View>
        {joinError && <Text style={styles.errorText}>{joinError}</Text>}
      </View>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
    paddingHorizontal: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 16,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },

  // ── Centered state (not signed in) ──────────────────────────────────────────
  centeredState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  stateEmoji: { fontSize: 36 },
  stateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  stateBody: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },

  // ── Primary button ───────────────────────────────────────────────────────────
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    marginTop: 4,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  // ── Group name ───────────────────────────────────────────────────────────────
  groupSheetContent: {
    maxHeight: 500,
    minHeight: 260,
    flexShrink: 1,
  },
  groupScroll: {
    flex: 1,
    minHeight: 0,
  },
  groupScrollContent: {
    paddingBottom: 10,
    flexGrow: 1,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textTertiary,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },

  // ── Invite code card ─────────────────────────────────────────────────────────
  codeCard: {
    backgroundColor: Colors.primarySubtle,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  codeLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  codeHelper: {
    fontSize: 12,
    lineHeight: 17,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  shareCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginTop: 4,
  },
  shareCodeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },

  // ── Members ──────────────────────────────────────────────────────────────────
  membersSection: {
    marginBottom: 8,
    gap: 8,
  },
  membersLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  membersList: {
    maxHeight: 210,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary + '20',
    borderWidth: 2,
    borderColor: Colors.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primary,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  memberMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  memberMeta: {
    flex: 1,
    gap: 2,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  memberRole: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  memberPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.bg,
  },
  memberPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  removeMemberBtn: {
    minWidth: 78,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.danger + '40',
    backgroundColor: '#FFF5F5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  removeMemberText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.danger,
  },

  // ── Leave button ─────────────────────────────────────────────────────────────
  // ── Create household card ────────────────────────────────────────────────────
  createCard: {
    backgroundColor: Colors.primarySubtle,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    padding: 20,
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  createEmoji: { fontSize: 36, lineHeight: 44 },
  createTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  createBody: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Divider ──────────────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 11,
    color: Colors.textTertiary,
    fontWeight: '600',
  },

  // ── Join ─────────────────────────────────────────────────────────────────────
  joinSection: { gap: 8 },
  linkHint: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  joinRow: {
    flexDirection: 'row',
    gap: 10,
  },
  joinInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 4,
    backgroundColor: Colors.bg,
    textAlign: 'center',
  },
  joinInputError: { borderColor: Colors.danger },
  joinBtn: {
    paddingHorizontal: 22,
    paddingVertical: 13,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    justifyContent: 'center',
  },
  joinBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  errorText: {
    fontSize: 12,
    color: Colors.danger,
    fontWeight: '500',
    textAlign: 'center',
  },
});
