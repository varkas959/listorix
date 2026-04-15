import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '../../src/constants/colors';
import { Spacing } from '../../src/constants/spacing';

const LAST_UPDATED = '21 March 2026';

const SECTIONS = [
  {
    title: '1. Information We Collect',
    body: `We collect the following types of information when you use Listorix:

Account Information
• Email address (when you sign up)
• Display name (optional)
• Store preference (local, supermarket, or online)
• Monthly budget (optional)

Usage Data
• Shopping lists and grocery items you create
• Item prices and quantities
• Shopping trip history and totals
• Preferred categories and frequently bought items

Device Information
• Device type and operating system version
• App version
• Anonymous crash reports and performance data`,
  },
  {
    title: '2. How We Use Your Information',
    body: `We use the information we collect to:
• Provide and maintain the App's core features (list management, history, insights)
• Sync your data across devices when you are signed in
• Generate personalised spending insights and budget alerts
• Improve price suggestions based on anonymised data
• Send notifications about shopping reminders (if enabled)
• Debug issues and improve App performance
• Comply with legal obligations

We do not use your data for advertising or sell it to third parties.`,
  },
  {
    title: '3. Data Storage',
    body: `Local Storage
Your shopping list and history are stored on your device using AsyncStorage. This data is available even without an internet connection.

Cloud Storage
When you create an account, your data is synced to Supabase, a secure cloud database provider. Supabase stores data on servers located in the European Union (Frankfurt, Germany).

Retention
• Active account data: retained while your account is active
• Deleted account data: permanently removed within 30 days of account deletion
• Local device data: remains on your device until you uninstall the App or clear data`,
  },
  {
    title: '4. Data Sharing',
    body: `We share your data only with:

Supabase (supabase.com)
Our backend database and authentication provider. They process data on our behalf under a Data Processing Agreement.

We do not share your data with:
• Advertising networks
• Data brokers
• Social media platforms
• Any third party for marketing purposes

We may share anonymised, aggregated data (for example, average grocery spending trends) that cannot be traced back to you.`,
  },
  {
    title: '5. Voice and Camera Features',
    body: `Voice Input
When you use the voice input feature, audio is processed locally on your device. We do not send audio recordings to our servers.

Receipt Scanning
Photos taken for receipt scanning are sent to our secure edge functions for processing. Receipt images are not stored after the text has been extracted.

Camera permissions are only used when you explicitly open the scanning feature.`,
  },
  {
    title: '6. Your Rights',
    body: `Under applicable privacy and data protection laws, you may have the right to:

• Access - Request a copy of the personal data we hold about you
• Correction - Ask us to correct inaccurate or incomplete data
• Erasure - Request deletion of your personal data
• Data Portability - Receive your data in a machine-readable format
• Withdraw Consent - Opt out of processing based on consent where applicable

To exercise these rights, please use the feedback option in the App. We will respond within a reasonable period as required by applicable law.`,
  },
  {
    title: '7. Data Security',
    body: `We implement industry-standard security measures including:
• All data in transit encrypted using TLS
• Data at rest encrypted by our infrastructure providers where supported
• Row-level security policies on our database so users can only access their own data
• Regular security reviews of our infrastructure
• Two-factor authentication support where available

No method of electronic storage is 100% secure. We strive to use commercially acceptable means to protect your data but cannot guarantee absolute security.`,
  },
  {
    title: '8. Children\'s Privacy',
    body: `Listorix is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13.

If you are a parent or guardian and believe your child has provided us with personal information, please contact us through the feedback option in the App and we will promptly delete that information.`,
  },
  {
    title: '9. Cookies and Tracking',
    body: `The mobile App does not use cookies. We use the following tracking technologies:
• Anonymous crash reporting (to fix bugs, with no personal data included)
• App usage analytics to understand which features are used in aggregate

You can opt out of analytics data collection in the App settings when that option is available.`,
  },
  {
    title: '10. Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. We will notify you of significant changes via an in-app notification or email.

The date at the top of this policy indicates when it was last updated. We encourage you to review this policy periodically.`,
  },
  {
    title: '11. Contact',
    body: `For privacy-related questions or to exercise your data rights, please reach out through the feedback option in the App.

We are an independent developer and will respond to privacy queries as promptly as possible.`,
  },
];

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <Text style={styles.headerSub}>Last updated {LAST_UPDATED}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Your privacy is important to us. This policy explains what data Listorix collects, how we use it, and the choices you have regarding your information.
        </Text>

        {SECTIONS.map(s => (
          <View key={s.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Text style={styles.sectionBody}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    gap: 2,
  },
  backBtn: { marginBottom: 8 },
  backText: { fontSize: 16, color: Colors.primary, fontWeight: '600' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.4 },
  headerSub: { fontSize: 12, color: Colors.textTertiary, marginTop: 2 },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, gap: 0 },
  intro: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 24,
    fontStyle: 'italic',
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  sectionBody: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 23,
  },
});

