import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
  const [voiceModalVisible, setVoiceModalVisible]     = useState(false);
  const [scanModalVisible, setScanModalVisible]       = useState(false);
  const [addItemsModalVisible, setAddItemsModalVisible] = useState(false);
  const fabRef = useRef<FABHandle>(null);

  useEffect(() => {
    fabEvents.setListener(() => fabRef.current?.open());
    return () => fabEvents.removeListener();
  }, []);

  return (
    <SafeAreaProvider>
      <View style={StyleSheet.absoluteFill}>
        <Tabs
          tabBar={(props) => (
            <CurvedTabBar {...props} tabs={TABS} onFabPress={() => {}} />
          )}
          screenOptions={{ headerShown: false }}
        >
          <Tabs.Screen name="index"    options={{ title: 'List'     }} />
          <Tabs.Screen name="history"  options={{ title: 'History'  }} />
          <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
          <Tabs.Screen name="profile"  options={{ title: 'Profile'  }} />
        </Tabs>

        <FAB
          ref={fabRef}
          onVoice={()  => setVoiceModalVisible(true)}
          onManual={() => setAddItemsModalVisible(true)}
          onScan={()   => setScanModalVisible(true)}
        />

        <VoiceModal
          visible={voiceModalVisible}
          onClose={() => setVoiceModalVisible(false)}
        />
        <ScanModal
          visible={scanModalVisible}
          onClose={() => setScanModalVisible(false)}
        />
        <AddItemsModal
          visible={addItemsModalVisible}
          onClose={() => setAddItemsModalVisible(false)}
        />
      </View>
    </SafeAreaProvider>
  );
}
