import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { Colors } from '../../constants/colors';

interface LaunchScreenProps {
  ready: boolean;
  onFinish?: () => void;
}

export function LaunchScreen({ ready, onFinish }: LaunchScreenProps) {
  const [closing, setClosing] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const halo = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const containerScale = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(1)).current;

  const pulseScale = useMemo(
    () => pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }),
    [pulse],
  );
  const pulseOpacity = useMemo(
    () => pulse.interpolate({ inputRange: [0, 1], outputRange: [0.24, 0.08] }),
    [pulse],
  );
  const haloScale = useMemo(
    () => halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }),
    [halo],
  );
  const haloOpacity = useMemo(
    () => halo.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.03] }),
    [halo],
  );
  const shimmerTranslate = useMemo(
    () => shimmer.interpolate({ inputRange: [0, 1], outputRange: [-120, 120] }),
    [shimmer],
  );

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 680,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 680,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    const haloLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, {
          toValue: 1,
          duration: 940,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(halo, {
          toValue: 0,
          duration: 940,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    const shimmerLoop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    );

    pulseLoop.start();
    haloLoop.start();
    shimmerLoop.start();

    return () => {
      pulseLoop.stop();
      haloLoop.stop();
      shimmerLoop.stop();
    };
  }, [pulse, halo, shimmer]);

  useEffect(() => {
    if (!ready || closing) return;
    setClosing(true);
    Animated.parallel([
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(containerScale, {
        toValue: 1.03,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 0.96,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onFinish?.();
    });
  }, [ready, closing, containerOpacity, containerScale, logoScale, onFinish]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: containerOpacity,
          transform: [{ scale: containerScale }],
        },
      ]}
    >
      <View style={styles.centerWrap}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.haloLarge,
            {
              opacity: haloOpacity,
              transform: [{ scale: haloScale }],
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.haloSmall,
            {
              opacity: pulseOpacity,
              transform: [{ scale: pulseScale }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.logoShell,
            {
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shimmer,
              {
                transform: [{ translateX: shimmerTranslate }, { rotate: '-18deg' }],
              },
            ]}
          />
          <Image
            source={require('../../../assets/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7FAFF',
  },
  centerWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloLarge: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: '#9CC2FF',
  },
  haloSmall: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: '#CFE2FF',
  },
  logoShell: {
    width: 88,
    height: 88,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 6,
  },
  shimmer: {
    position: 'absolute',
    top: -24,
    left: -70,
    width: 44,
    height: 140,
    backgroundColor: 'rgba(255,255,255,0.36)',
    zIndex: 2,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
});

