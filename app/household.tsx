import React from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useListStore } from '../src/store/useListStore';
import { useAuthStore } from '../src/store/useAuthStore';
import { Colors } from '../src/constants/colors';

function MemberAvatar({ displayName }: { displayName: string | null }) {
  const initials = displayName
    ? displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );
}

export default function HouseholdScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const groupId = useListStore((s) => s.groupId);
  const groupMembers = useListStore((s) => s.groupMembers);
  const leaveGroup = useListStore((s) => s.leaveGroup);
  const removeGroupMember = useListStore((s) => s.removeGroupMember);

  React.useEffect(() => {
    if (!groupId) {
      router.back();
    }
  }, [groupId, router]);

  const currentMember = groupMembers.find((m) => m.userId === user?.id);
  const isAdmin = currentMember?.role === 'admin';

  const handleLeave = React.useCallback(() => {
    Alert.alert(
      'Leave Household?',
      'You’ll lose access to shared items.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveGroup();
              router.replace('/(tabs)');
            } catch {
              Alert.alert('Could not leave household', 'Please try again in a moment.');
            }
          },
        },
      ],
    );
  }, [leaveGroup, router]);

  const handleRemove = React.useCallback(async (memberId: string, memberName: string | null) => {
    Alert.alert(
      `Remove ${memberName ?? 'member'}?`,
      'They will lose access to the live household list right away.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await removeGroupMember(memberId);
            if (result !== 'ok') {
              Alert.alert('Could not remove member', 'Please try again in a moment.');
            }
          },
        },
      ],
    );
  }, [removeGroupMember]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Household</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.membersTitle}>{`Members (${groupMembers.length})`}</Text>

        {groupMembers.map((member) => {
          const isYou = member.userId === user?.id;
          return (
            <View key={member.userId} style={styles.memberRow}>
              <View style={styles.memberMain}>
                <MemberAvatar displayName={member.displayName} />
                <View style={styles.memberMeta}>
                  <Text style={styles.memberName}>
                    {isYou ? 'You' : (member.displayName ?? 'Member')}
                  </Text>
                  <Text style={styles.memberRole}>{member.role === 'admin' ? 'Admin' : 'Member'}</Text>
                </View>
              </View>
              {isAdmin && !isYou ? (
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => handleRemove(member.userId, member.displayName)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}

        <View style={styles.separator} />
        <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave} activeOpacity={0.75}>
          <Text style={styles.leaveText}>Leave household</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 24,
    color: Colors.textPrimary,
    lineHeight: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 32,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  membersTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  memberMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary + '20',
    borderWidth: 2,
    borderColor: Colors.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  memberMeta: {
    flex: 1,
    gap: 2,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  memberRole: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  removeBtn: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.danger + '45',
    backgroundColor: '#FFF6F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.danger,
  },
  separator: {
    height: 1,
    marginTop: 20,
    marginBottom: 14,
    backgroundColor: Colors.border,
  },
  leaveBtn: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.danger + '55',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  leaveText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.danger,
  },
});

