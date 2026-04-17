import React, { useState } from 'react';
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
import { setStorePreference } from '../src/services/storage';

const GLOBAL_STORE_OPTIONS = [
  { key: 'local', label: 'Local store', emoji: '🏪', sub: 'Neighbourhood shop, market, etc.' },
  { key: 'supermarket', label: 'Supermarket', emoji: '🛒', sub: 'Large grocery chain, warehouse club, etc.' },
  { key: 'online', label: 'Online', emoji: '📦', sub: 'Delivery app, online grocer, marketplace' },
] as const;

export default function OnboardStoreScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);

  async function handleContinue() {
    if (selected) await setStorePreference(selected);
    router.replace('/(tabs)');
  }

  async function handleSkip() {
    router.replace('/(tabs)');
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Where do you usually shop?</Text>
        <Text style={styles.sub}>We'll tailor prices and insights based on this</Text>
      </View>

      {/* Option tiles */}
      <View style={styles.options}>
        {GLOBAL_STORE_OPTIONS.map(opt => {
          const active = selected === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.tile, active && styles.tileActive]}
              onPress={() => setSelected(opt.key)}
              activeOpacity={0.75}
            >
              <Text style={styles.tileEmoji}>{opt.emoji}</Text>
              <View style={styles.tileText}>
                <Text style={[styles.tileLabel, active && styles.tileLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={styles.tileSub}>{opt.sub}</Text>
              </View>
              {/* Selection indicator */}
              <View style={[styles.radio, active && styles.radioActive]}>
                {active && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Spacer */}
      <View style={{ flex: 1 }} />

      {/* CTA */}
      <TouchableOpacity
        style={[styles.cta, !selected && styles.ctaDisabled]}
        onPress={handleContinue}
        activeOpacity={selected ? 0.85 : 1}
      >
        <Text style={styles.ctaText}>Continue</Text>
      </TouchableOpacity>

      {/* Skip */}
      <TouchableOpacity style={styles.skip} onPress={handleSkip} activeOpacity={0.6}>
        <Text style={styles.skipText}>Skip for now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    marginBottom: 32,
    gap: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '400',
  },

  options: {
    gap: 12,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: Colors.surface,
  },
  tileActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySubtle,
  },
  tileEmoji: {
    fontSize: 26,
  },
  tileText: {
    flex: 1,
    gap: 2,
  },
  tileLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  tileLabelActive: {
    color: Colors.primary,
  },
  tileSub: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: '400',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },

  cta: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 5,
    marginBottom: 12,
  },
  ctaDisabled: {
    backgroundColor: Colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  skip: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textTertiary,
  },
});
