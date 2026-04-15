import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../src/constants/colors';
import { Spacing, Radius } from '../../src/constants/spacing';
import { useAuthStore } from '../../src/store/useAuthStore';

export default function EmailAuthScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp, authError, clearAuthError } = useAuthStore();

  const [mode,     setMode]     = useState<'signin' | 'signup'>('signin');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [busy,     setBusy]     = useState(false);

  const passwordRef = useRef<TextInput>(null);

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) return;
    setBusy(true);
    clearAuthError();
    const ok = mode === 'signin'
      ? await signIn(email.trim(), password)
      : await signUp(email.trim(), password);
    setBusy(false);
    // Navigation handled automatically by route guard in _layout.tsx
  }

  function toggleMode() {
    clearAuthError();
    setMode(m => (m === 'signin' ? 'signup' : 'signin'));
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.surface }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.screen,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        {/* Title */}
        <View style={styles.titleArea}>
          <Text style={styles.title}>
            {mode === 'signin' ? 'Welcome back' : 'Create account'}
          </Text>
          <Text style={styles.subtitle}>
            {mode === 'signin'
              ? 'Sign in with your email address'
              : 'Start saving on groceries today'}
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor={Colors.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            value={email}
            onChangeText={setEmail}
            editable={!busy}
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <TextInput
            ref={passwordRef}
            style={styles.input}
            placeholder="Password  (min 6 characters)"
            placeholderTextColor={Colors.textTertiary}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            value={password}
            onChangeText={setPassword}
            editable={!busy}
          />

          {authError ? (
            <Text style={styles.errorText}>{authError}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.cta, busy && styles.ctaBusy]}
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={busy}
          >
            {busy
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.ctaText}>
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                </Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={toggleMode} style={styles.toggleWrap} activeOpacity={0.7}>
            <Text style={styles.toggleText}>
              {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <Text style={styles.toggleLink}>
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Your data is private and only accessible to you.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    gap: 28,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primary,
  },
  titleArea: {
    gap: 6,
    marginTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontWeight: '400',
  },
  form: {
    gap: 12,
  },
  input: {
    backgroundColor: Colors.bg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  errorText: {
    fontSize: 13,
    color: Colors.danger,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  cta: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaBusy: {
    opacity: 0.75,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  toggleWrap: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  toggleText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  toggleLink: {
    color: Colors.primary,
    fontWeight: '700',
  },
  footer: {
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
});
