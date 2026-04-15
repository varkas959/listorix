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
    title: '1. Acceptance of Terms',
    body: `By downloading, installing, or using Listorix ("the App"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the App.

These terms apply to all users of the App, including users who are also contributors of content, information, and other materials or services on the App.`,
  },
  {
    title: '2. Description of Service',
    body: `Listorix is a personal grocery tracking application that helps you:
• Create and manage shopping lists
• Track grocery spending and budgets
• View spending history and insights
• Add items via voice, manual entry, or receipt scanning

The App is intended for everyday grocery planning and supports locale-aware pricing, dates, and category-based insights.`,
  },
  {
    title: '3. User Accounts',
    body: `To access certain features, you may create an account using your email address. You are responsible for:
• Maintaining the confidentiality of your account credentials
• All activities that occur under your account
• Notifying us immediately of any unauthorised use of your account

We reserve the right to terminate accounts that violate these Terms or that have been inactive for more than 12 months.`,
  },
  {
    title: '4. Data and Privacy',
    body: `Your grocery lists and spending data are stored:
• Locally on your device (always available, no internet required)
• On our servers via Supabase when you are signed in (for cross-device sync)

We do not sell your personal data to third parties. Please read our Privacy Policy for full details on how your data is collected, used, and protected.`,
  },
  {
    title: '5. Acceptable Use',
    body: `You agree not to use the App to:
• Violate any applicable laws or regulations
• Transmit any harmful, offensive, or illegal content
• Attempt to gain unauthorised access to our systems
• Reverse-engineer or decompile the App
• Use automated tools to scrape or extract data from the App

We reserve the right to suspend or terminate your access if you violate these restrictions.`,
  },
  {
    title: '6. Intellectual Property',
    body: `Listorix and all related content, features, and functionality are owned by us and are protected by applicable copyright, trademark, and other intellectual property laws.

You are granted a limited, non-exclusive, non-transferable licence to use the App for your personal, non-commercial purposes. This licence does not include the right to:
• Copy, modify, or distribute the App
• Create derivative works based on the App
• Use the App for commercial purposes without written permission`,
  },
  {
    title: '7. Disclaimers',
    body: `The App is provided on an "as is" and "as available" basis without warranties of any kind, either express or implied.

We do not warrant that:
• The App will be uninterrupted or error-free
• Prices suggested by the App reflect actual market prices
• The voice recognition or receipt scanning features will be 100% accurate

Price estimates and category suggestions are based on available data and may not reflect current prices at your local store.`,
  },
  {
    title: '8. Limitation of Liability',
    body: `To the maximum extent permitted by applicable law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from:
• Your use of, or inability to use, the App
• Any errors or omissions in the App's content
• Any unauthorised access to or alteration of your data

Our total liability to you for any claims arising from these Terms shall not exceed the greater of the amount you paid to use the App in the past 12 months or the minimum amount required by applicable law.`,
  },
  {
    title: '9. Changes to Terms',
    body: `We reserve the right to modify these Terms at any time. We will notify you of significant changes through the App or by email. Your continued use of the App after such changes constitutes acceptance of the new Terms.

We recommend reviewing these Terms periodically to stay informed of any updates.`,
  },
  {
    title: '10. Governing Law',
    body: `These Terms shall be governed by and construed in accordance with the laws applicable in the jurisdiction where the service operator is established, unless local consumer protection law requires otherwise.`,
  },
  {
    title: '11. Contact Us',
    body: `If you have any questions about these Terms of Service, please contact us at:

Email: support@listorix.app

We aim to respond to all queries within 5 business days.`,
  },
];

export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <Text style={styles.headerSub}>Last updated {LAST_UPDATED}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Please read these Terms of Service carefully before using Listorix. These terms govern your use of the App and form a legally binding agreement between you and Listorix.
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
