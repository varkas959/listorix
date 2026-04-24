import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Tabs } from 'expo-router';
import { CurvedTabBar } from '../../src/components/ui/CurvedTabBar';
import { FAB, FABHandle } from '../../src/components/ui/FAB';
import { fabEvents } from '../../src/utils/fabEvents';
import { VoiceModal } from '../../src/components/modals/VoiceModal';
import { ScanModal } from '../../src/components/modals/ScanModal';
import { AddItemsModal } from '../../src/components/modals/AddItemsModal';
import {
  IconList,
  IconHistory,
  IconInsights,
  IconProfile,
} from '../../src/components/ui/Icons';
import { Colors } from '../../src/constants/colors';

const TABS = [
  {
    key:   'index',
    label: 'List',
    icon:  (active: boolean) => (
      <IconList color={active ? Colors.primary : Colors.textTertiary} strokeWidth={active ? 2.5 : 2} />
    ),
  },
  {
    key:   'history',
    label: 'History',
    icon:  (active: boolean) => (
      <IconHistory color={active ? Colors.primary : Colors.textTertiary} strokeWidth={active ? 2.5 : 2} />
    ),
  },
  {
    key:   'insights',
    label: 'Insights',
    icon:  (active: boolean) => (
      <IconInsights color={active ? Colors.primary : Colors.textTertiary} strokeWidth={active ? 2.5 : 2} />
    ),
  },
  {
    key:   'profile',
    label: 'Profile',
    icon:  (active: boolean) => (
      <IconProfile color={active ? Colors.primary : Colors.textTertiary} strokeWidth={active ? 2.5 : 2} />
    ),
  },
];

export default function TabLayout() {
  const screenOpacity = useRef(new Animated.Value(0)).current;
  const [voiceModalVisible, setVoiceModalVisible]     = useState(false);
  const [scanModalVisible, setScanModalVisible]       = useState(false);
  const [addItemsModalVisible, setAddItemsModalVisible] = useState(false);
  const fabRef = useRef<FABHandle>(null);

  useEffect(() => {
    fabEvents.setFabListener(() => fabRef.current?.open());
    fabEvents.setManualListener(() => setAddItemsModalVisible(true));
    return () => {
      fabEvents.removeFabListener();
      fabEvents.removeManualListener();
    };
  }, []);

  useEffect(() => {
    Animated.timing(screenOpacity, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [screenOpacity]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: screenOpacity }]}>
      <Tabs
        tabBar={(props) => (
          <CurvedTabBar {...props} tabs={TABS} />
        )}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index"    options={{ title: 'List' }} />
        <Tabs.Screen name="history"  options={{ title: 'History' }} />
        <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
        <Tabs.Screen name="profile"  options={{ title: 'Profile' }} />
      </Tabs>

      <FAB
        ref={fabRef}
        onVoice={()  => setVoiceModalVisible(true)}
        onManual={() => setAddItemsModalVisible(true)}
        onScan={()   => setScanModalVisible(true)}
      />

      {voiceModalVisible && (
        <VoiceModal
          visible={voiceModalVisible}
          onClose={() => setVoiceModalVisible(false)}
        />
      )}
      {scanModalVisible && (
        <ScanModal
          visible={scanModalVisible}
          onClose={() => setScanModalVisible(false)}
        />
      )}
      {addItemsModalVisible && (
        <AddItemsModal
          visible={addItemsModalVisible}
          onClose={() => setAddItemsModalVisible(false)}
        />
      )}
    </Animated.View>
  );
}
