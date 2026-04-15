import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../../src/constants/colors';
import { Spacing, Radius } from '../../src/constants/spacing';
import { supabase } from '../../src/services/supabase';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import { useCurrencySettings } from '../../src/utils/currency';

WebBrowser.maybeCompleteAuthSession();

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/** Smooth sinusoidal float — no pauses, no jank */
function useFloat(phaseDelay = 0, distance = 7, duration = 2000) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation;
    const t = setTimeout(() => {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: -distance,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: distance,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
    }, phaseDelay);
    return () => { clearTimeout(t); loop?.stop(); };
  }, []);
  return anim;
}

export default function OnboardingScreen() {
  const insets    = useSafeAreaInsets();
  const isOnline  = useNetworkStatus();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleBusy,  setAppleBusy]  = useState(false);
  const [error,      setError]      = useState('');
  const { currencySymbol } = useCurrencySettings();

  // Floating animations — each card starts at a different phase
  const float1 = useFloat(0,    7, 1800);
  const float2 = useFloat(600,  6, 2200);
  const float3 = useFloat(300,  8, 2000);

  async function handleGoogle() {
    setError('');
    setGoogleBusy(true);
    try {
      // In Expo Go use the exp:// URL; in production builds use the app scheme
      const redirectUri = __DEV__
        ? Linking.createURL('/auth/callback')
        : 'listorix://auth/callback';

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
        },
      });

      if (oauthError || !data.url) {
        throw oauthError ?? new Error('No OAuth URL');
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

      if (result.type === 'success') {
        const url = result.url;
        const code = new URL(url).searchParams.get('code');
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else {
          const hash   = url.includes('#') ? url.split('#')[1] : '';
          const params = new URLSearchParams(hash);
          const accessToken  = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (accessToken && refreshToken) {
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          }
        }
      }
    } catch (err) {
      console.error('[auth] Google error:', err);
      setError('Google sign-in unavailable. Use email instead.');
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handleApple() {
    setError('');
    setAppleBusy(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken!,
      });
      if (signInError) throw signInError;
      // onAuthStateChange in useAuthStore handles navigation
    } catch (e: unknown) {
      if (e instanceof Error && 'code' in e && (e as { code: string }).code === 'ERR_REQUEST_CANCELED') return;
      // Log full error so we can diagnose exactly what went wrong
      console.error('[auth] Apple error:', JSON.stringify(e, null, 2));
      if (e instanceof Error) console.error('[auth] Apple error message:', e.message);
      setError('Apple sign-in failed. Try another method.');
    } finally {
      setAppleBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 24 }]}>

      {/* ── Illustration area ──────────────────────────────────────────── */}
      <View style={[styles.illustrationArea, { paddingTop: insets.top + 16 }]}>

        {/* Central white card with basket */}
        <View style={styles.basketCard}>
          <BasketIllustration />
        </View>

        {/* Floating item card — middle left */}
        <Animated.View style={[styles.itemCard, styles.itemCard1, { transform: [{ translateY: float1 }] }]}>
          <Text style={styles.emoji}>🍌</Text>
          <View>
            <Text style={styles.itemName}>Bananas</Text>
            <Text style={styles.itemPrice}>{currencySymbol}40</Text>
          </View>
        </Animated.View>

        {/* Floating item card — bottom left */}
        <Animated.View style={[styles.itemCard, styles.itemCard2, { transform: [{ translateY: float2 }] }]}>
          <Text style={styles.emoji}>🫒</Text>
          <View>
            <Text style={styles.itemName}>Olive Oil</Text>
            <Text style={styles.itemPrice}>{currencySymbol}350</Text>
          </View>
        </Animated.View>

        {/* Floating item card — bottom right */}
        <Animated.View style={[styles.itemCard, styles.itemCard3, { transform: [{ translateY: float3 }] }]}>
          <Text style={styles.emoji}>🧀</Text>
          <View>
            <Text style={styles.itemName}>Paneer</Text>
            <Text style={styles.itemPrice}>{currencySymbol}80</Text>
          </View>
        </Animated.View>
      </View>

      {/* ── Copy ─────────────────────────────────────────────────────────── */}
      <View style={styles.copyArea}>
        <Text style={styles.appName} numberOfLines={1} adjustsFontSizeToFit>Groceries on your terms</Text>
        <Text style={styles.supporting}>Add items. Track spending. Adjust as you shop.</Text>
      </View>

      {/* ── Auth buttons ─────────────────────────────────────────────────── */}
      <View style={styles.authArea}>
        {!isOnline && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>No internet connection</Text>
          </View>
        )}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Continue with Google */}
        <TouchableOpacity
          style={[styles.socialBtn, (!isOnline || googleBusy) && styles.btnDisabled]}
          onPress={handleGoogle}
          activeOpacity={0.88}
          disabled={!isOnline || googleBusy}
        >
          {googleBusy ? (
            <ActivityIndicator color={Colors.textPrimary} size="small" />
          ) : (
            <>
              <GoogleColorG />
              <Text style={styles.socialBtnText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Continue with Apple — iOS only, required by App Store */}
        {Platform.OS === 'ios' && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={26}
            style={styles.appleBtn}
            onPress={handleApple}
          />
        )}

        {/* OR divider */}
        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>or</Text>
          <View style={styles.orLine} />
        </View>

        {/* Continue with Email */}
        <TouchableOpacity
          style={styles.emailBtn}
          onPress={() => router.push('/auth/email')}
          activeOpacity={0.88}
        >
          <Text style={styles.emailBtnText}>Continue with Email</Text>
        </TouchableOpacity>

        {/* Footer */}
        <Text style={styles.footer}>
          {'By continuing, you agree to our '}
          <Text
            style={styles.footerLink}
            onPress={() => router.push('/legal/terms')}
          >
            Terms
          </Text>
          {' and '}
          <Text
            style={styles.footerLink}
            onPress={() => router.push('/legal/privacy')}
          >
            Privacy Policy
          </Text>
        </Text>
      </View>
    </View>
  );
}

// ── Google 4-colour G icon ──────────────────────────────────────────────────
// Exact Google G logo using official SVG paths
function GoogleColorG() {
  return (
    <Svg width={22} height={22} viewBox="0 0 48 48">
      {/* Blue */}
      <Path fill="#4285F4" d="M43.6 20.5H24v7h11.3c-1.1 5.4-5.9 9-11.3 9-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.3-5.3C33.8 7.1 29.1 5 24 5 13.5 5 5 13.5 5 24s8.5 19 19 19c10 0 18.5-7.3 18.5-19 0-1.2-.1-2.4-.3-3.5z" />
      {/* Green */}
      <Path fill="#34A853" d="M6.3 14.7l6.2 4.5C14 15.5 18.7 12 24 12c3 0 5.7 1.1 7.8 2.9l5.3-5.3C33.8 7.1 29.1 5 24 5c-7.7 0-14.3 4.4-17.7 10.7z" />
      {/* Yellow */}
      <Path fill="#FBBC04" d="M24 43c5 0 9.7-1.7 13.2-4.5l-6.1-5c-1.9 1.3-4.4 2-7.1 2-5.4 0-10-3.6-11.7-8.5l-6.2 4.8C9.7 38.6 16.3 43 24 43z" />
      {/* Red */}
      <Path fill="#EA4335" d="M43.6 20.5H24v7h11.3c-.5 2.6-2 4.9-4.1 6.5l6.1 5C40.8 35.6 44 30.2 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </Svg>
  );
}

// ── Basket illustration — SVG shopping basket ──────────────────────────────

function BasketIllustration() {
  return (
    <Svg width={130} height={110} viewBox="0 0 130 110">
      {/* Teal arch handles */}
      <Path
        d="M38 56 Q38 12 65 12 Q92 12 92 56"
        stroke="#1AABA8"
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />
      {/* Basket body */}
      <Path
        d="M14 54 L116 54 L106 100 Q104 106 98 106 L32 106 Q26 106 24 100 Z"
        fill="#F4703A"
      />
      {/* Vertical weave lines */}
      <Path d="M42 54 L36 106" stroke="#D4581E" strokeWidth="1.5" opacity="0.55"/>
      <Path d="M65 54 L65 106" stroke="#D4581E" strokeWidth="1.5" opacity="0.55"/>
      <Path d="M88 54 L94 106" stroke="#D4581E" strokeWidth="1.5" opacity="0.55"/>
      {/* Horizontal band */}
      <Path d="M17 76 L113 76" stroke="#D4581E" strokeWidth="1.5" opacity="0.45"/>
      {/* Top rim */}
      <Path
        d="M12 54 L118 54"
        stroke="#C94E18"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const ILLUS_H = SCREEN_H * 0.40;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.surface,
  },

  // ── Illustration ────────────────────────────────────────────────────────
  illustrationArea: {
    height: ILLUS_H,
    backgroundColor: '#E8EDFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
  },

  // Central basket (no card background)
  basketCard: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Floating item cards
  itemCard: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 5,
  },
  itemCard1: { top: '38%', left: 10 },
  itemCard2: { bottom: 22, left: 10 },
  itemCard3: { bottom: 18, right: 8 },

  emoji: {
    fontSize: 22,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  itemPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: 1,
  },

  // ── Copy ────────────────────────────────────────────────────────────────
  copyArea: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 28,
    paddingBottom: 8,
    gap: 8,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  supporting: {
    fontSize: 13,
    fontWeight: '400',
    color: Colors.textTertiary,
    lineHeight: 20,
  },

  // ── Auth ────────────────────────────────────────────────────────────────
  authArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: 12,
  },
  errorText: {
    fontSize: 13,
    color: Colors.danger,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Shared social button (Google + Apple manual fallback)
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    backgroundColor: '#fff',
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  socialBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },

  // Apple button — native component, pill shaped
  appleBtn: {
    height: 52,
    width: '100%',
    borderRadius: 26,
  },

  // OR divider
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  orText: {
    fontSize: 13,
    color: Colors.textTertiary,
    fontWeight: '500',
  },

  // Email button — primary filled, pill shaped
  emailBtn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 5,
  },
  emailBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },

  btnDisabled: {
    opacity: 0.45,
  },

  offlineBanner: {
    backgroundColor: '#FFF3CD',
    borderRadius: Radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  offlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#856404',
  },

  footer: {
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: Spacing.md,
    paddingBottom: 4,
  },
  footerLink: {
    color: Colors.primary,
    fontWeight: '600',
  },
});


