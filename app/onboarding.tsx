import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../src/constants/colors';
import { Spacing, Radius } from '../src/constants/spacing';
import { setOnboarded } from '../src/services/storage';
import { IconCart } from '../src/components/ui/Icons';

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  async function handleStart() {
    await setOnboarded();
    router.replace('/(tabs)');
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Top spacer */}
      <View style={styles.spacer} />

      {/* Hero illustration area */}
      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <IconCart size={56} color={Colors.primary} />
        </View>
      </View>

      {/* Copy */}
      <View style={styles.copy}>
        <Text style={styles.title}>
          Stop overspending{'\n'}on groceries
        </Text>
        <Text style={styles.subtitle}>
          See your total before you reach the billing counter
        </Text>
        <Text style={styles.supporting}>
          Know what you'll spend. Adjust as you shop.
        </Text>
      </View>

      {/* CTA */}
      <View style={styles.ctaWrap}>
        <TouchableOpacity
          style={styles.cta}
          onPress={handleStart}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>Start my first list</Text>
        </TouchableOpacity>
        <Text style={styles.micro}>Takes less than 30 seconds</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
  },
  spacer: {
    flex: 1,
  },

  hero: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },

  copy: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  supporting: {
    fontSize: 13,
    fontWeight: '400',
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },

  ctaWrap: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 40,
  },
  cta: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 16,
    paddingHorizontal: 48,
    width: '100%',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  micro: {
    fontSize: 11,
    fontWeight: '400',
    color: Colors.textTertiary,
  },
});
