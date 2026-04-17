import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TextInput,
  StyleSheet, Pressable, Share, ActivityIndicator, Animated, ScrollView,
  Platform, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useListStore } from '../../store/useListStore';
import { useAuthStore } from '../../store/useAuthStore';
import { Colors } from '../../constants/colors';
import { Spacing, Radius } from '../../constants/spacing';
import { IconClose, IconUsers, IconShareArrow } from './Icons';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ShareListSheet({ visible, onClose }: Props) {
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { user } = useAuthStore();

  const groupId      = useListStore(s => s.groupId);
  const groupName    = useListStore(s => s.groupName);
  const inviteCode   = useListStore(s => s.inviteCode);
  const groupMembers = useListStore(s => s.groupMembers);
  const createGroup  = useListStore(s => s.createGroup);
  const joinGroup    = useListStore(s => s.joinGroup);
  const leaveGroup   = useListStore(s => s.leaveGroup);

  const [joinCode,    setJoinCode]    = useState('');
  const [joining,     setJoining]     = useState(false);
  const [creating,    setCreating]    = useState(false);
  const [leaving,     setLeaving]     = useState(false);
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
      animateClose(onClose);
    } else if (result === 'not_found') {
      setJoinError('Code not found — double-check and try again');
    } else {
      setJoinError('Something went wrong. Try again.');
    }
  }

  async function handleLeave() {
    setLeaving(true);
    await leaveGroup();
    setLeaving(false);
    animateClose(onClose);
  }

  async function handleShareCode() {
    if (!inviteCode) return;
    Share.share({
      message: `Join my household grocery list on Listorix!\n\nOpen the app → Family → enter this code:\n\n${inviteCode}`,
    });
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
  if (groupId && inviteCode) {
    return sheetInner(
      <>
        {/* Group name */}
        <View style={styles.groupNameRow}>
          <Text style={styles.groupNameLabel}>HOUSEHOLD</Text>
          <Text style={styles.groupNameValue}>{groupName ?? 'My Household'}</Text>
        </View>

        {/* Invite code card */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Invite code — share this with family</Text>
          <Text style={styles.codeValue}>{inviteCode}</Text>
          <TouchableOpacity
            style={styles.shareCodeBtn}
            onPress={handleShareCode}
            activeOpacity={0.85}
          >
            <IconShareArrow size={14} color="#fff" />
            <Text style={styles.shareCodeBtnText}>Share invite code</Text>
          </TouchableOpacity>
        </View>

        {/* Member list */}
        {groupMembers.length > 0 && (
          <View style={styles.membersSection}>
            <Text style={styles.membersLabel}>
              {groupMembers.length} {groupMembers.length === 1 ? 'member' : 'members'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.avatarRow}>
              {groupMembers.map(m => (
                <View key={m.userId} style={styles.avatarWrap}>
                  <MemberAvatar displayName={m.displayName} />
                  <Text style={styles.avatarName} numberOfLines={1}>
                    {m.displayName ?? 'You'}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Leave button */}
        <TouchableOpacity
          style={[styles.leaveBtn, leaving && { opacity: 0.6 }]}
          onPress={handleLeave}
          disabled={leaving}
          activeOpacity={0.7}
        >
          {leaving
            ? <ActivityIndicator size="small" color={Colors.danger} />
            : <Text style={styles.leaveBtnText}>Leave household</Text>
          }
        </TouchableOpacity>
      </>
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
    marginBottom: 20,
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
    marginBottom: 20,
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
  groupNameRow: {
    marginBottom: 16,
    gap: 2,
  },
  groupNameLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textTertiary,
    letterSpacing: 1.2,
  },
  groupNameValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.4,
  },

  // ── Invite code card ─────────────────────────────────────────────────────────
  codeCard: {
    backgroundColor: Colors.primarySubtle,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    padding: 20,
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  codeLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  codeValue: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 6,
    fontVariant: ['tabular-nums' as const],
  },
  shareCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 11,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  shareCodeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },

  // ── Members ──────────────────────────────────────────────────────────────────
  membersSection: {
    marginBottom: 20,
    gap: 10,
  },
  membersLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  avatarRow: {
    flexDirection: 'row',
  },
  avatarWrap: {
    alignItems: 'center',
    marginRight: 12,
    gap: 4,
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
  avatarName: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
    maxWidth: 50,
    textAlign: 'center',
  },

  // ── Leave button ─────────────────────────────────────────────────────────────
  leaveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.danger + '50',
    backgroundColor: Colors.surface,
    height: 44,
  },
  leaveBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.danger,
  },

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
