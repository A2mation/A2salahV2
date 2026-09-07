import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { light as colors } from '../theme/colors';

const APP_VERSION = '1.0.0';
const EFFECTIVE_DATE = 'September 1, 2026';
const SUPPORT_EMAIL = 'a2mationsolution@gmail.com';

const TABS = [
  { key: 'terms', label: 'Terms of Use' },
  { key: 'privacy', label: 'Privacy Policy' },
];

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

function P({ children }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

function Bullet({ children }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

function TermsContent() {
  return (
    <>
      <P>
        These Terms of Use ("Terms") govern your use of the A2salah mobile
        application ("the App"), provided by A2mation ("we", "us", "our").
        By downloading, installing, or using the App, you agree to these
        Terms. If you do not agree, please do not use the App.
      </P>

      <Section title="1. USE OF THE APP">
        <P>
          A2salah provides prayer times, reminders, Qibla direction, and
          related tools, including syncing prayer schedules to a compatible
          A2salah hardware device over Bluetooth or Wi-Fi. You may use the
          App for personal, non-commercial purposes.
        </P>
      </Section>

      <Section title="2. PRAYER TIMES ARE ESTIMATES">
        <P>
          Prayer times shown in the App are calculated based on your
          location and calculation settings, and may be manually adjusted
          by you ("tuned"). While we aim for accuracy, these times are
          estimates and should not be relied on as the sole source for
          religious observance. Please verify timings with a local mosque
          or trusted source where accuracy is critical.
        </P>
      </Section>

      <Section title="3. ACCOUNT / ID FEATURES">
        <P>
          Some features (such as "Add ID") let you create Admin or User
          credentials within the App. You are responsible for keeping any
          password you set confidential and for all activity under your
          credentials.
        </P>
      </Section>

      <Section title="4. HARDWARE DEVICE SYNC">
        <P>
          If you connect a compatible A2salah prayer-clock device, the App
          will communicate with it over Bluetooth or a local Wi-Fi hotspot
          to send prayer time data. We are not responsible for damage,
          malfunction, or data loss on third-party or unofficial hardware
          not sold or supported by us.
        </P>
      </Section>

      <Section title="5. ACCEPTABLE USE">
        <Bullet>Don't reverse-engineer, decompile, or tamper with the App beyond what applicable law permits.</Bullet>
        <Bullet>Don't use the App to violate any law or the rights of others.</Bullet>
        <Bullet>Don't attempt to disrupt or overload our servers or connected devices.</Bullet>
      </Section>

      <Section title="6. INTELLECTUAL PROPERTY">
        <P>
          The App, including its design, logo, sounds, and content, is
          owned by A2mation and protected by applicable intellectual
          property laws. You may not copy, redistribute, or create
          derivative works without our written permission.
        </P>
      </Section>

      <Section title="7. DISCLAIMER OF WARRANTIES">
        <P>
          The App is provided "as is" without warranties of any kind,
          express or implied. We do not guarantee the App will be
          uninterrupted, error-free, or perfectly accurate.
        </P>
      </Section>

      <Section title="8. LIMITATION OF LIABILITY">
        <P>
          To the maximum extent permitted by law, A2mation is not liable
          for any indirect, incidental, or consequential damages arising
          from your use of, or inability to use, the App.
        </P>
      </Section>

      <Section title="9. CHANGES TO THESE TERMS">
        <P>
          We may update these Terms from time to time. Continued use of the
          App after changes take effect means you accept the revised Terms.
          Material changes will be reflected by updating the effective date
          below.
        </P>
      </Section>

      <Section title="10. CONTACT">
        <P>
          Questions about these Terms can be sent to{' '}
          <Text style={styles.link} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
            {SUPPORT_EMAIL}
          </Text>
          .
        </P>
      </Section>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <P>
        This Privacy Policy explains what information A2salah ("the App"),
        provided by A2mation, collects, how it is used, and the choices you
        have. We designed the App to work with as little personal data as
        possible.
      </P>

      <Section title="1. INFORMATION WE COLLECT">
        <Bullet>
          <Text style={styles.bulletBold}>Location. </Text>
          Used to calculate prayer times and Qibla direction for where you
          are. Location stays on your device and is not sent to our
          servers.
        </Bullet>
        <Bullet>
          <Text style={styles.bulletBold}>Device connections. </Text>
          Bluetooth and Wi-Fi are used only to sync prayer time data with
          your A2salah hardware device, over your local network or a direct
          Bluetooth link — not through our servers.
        </Bullet>
        <Bullet>
          <Text style={styles.bulletBold}>Notification & sound settings. </Text>
          Your reminder, volume, and sound preferences are stored on your
          device so the App can play Azan alerts as configured.
        </Bullet>
        <Bullet>
          <Text style={styles.bulletBold}>ID / credentials. </Text>
          If you use the "Add ID" feature, the ID and password you create
          are stored to enable that feature and are not shared with third
          parties.
        </Bullet>
        <Bullet>
          <Text style={styles.bulletBold}>Support communications. </Text>
          If you email or call us for support, we receive whatever you
          choose to share (e.g. your email address and message).
        </Bullet>
      </Section>

      <Section title="2. WHAT WE DON'T DO">
        <Bullet>We don't sell your personal data.</Bullet>
        <Bullet>We don't run third-party advertising or ad-tracking SDKs in the App.</Bullet>
        <Bullet>We don't collect location history on our servers — calculations happen on your device.</Bullet>
      </Section>

      <Section title="3. PERMISSIONS THE APP MAY REQUEST">
        <Bullet>Location — for prayer times and Qibla direction.</Bullet>
        <Bullet>Bluetooth / Wi-Fi — to find and sync with your A2salah device.</Bullet>
        <Bullet>Notifications & alarms — to alert you at prayer times.</Bullet>
        <Bullet>Microphone/audio settings — to play and control Azan sound playback.</Bullet>
        <P>You can change or revoke any of these at any time in your device's system settings.</P>
      </Section>

      <Section title="4. DATA RETENTION">
        <P>
          Settings such as tuned prayer offsets, reminder preferences, and
          any ID you create are stored locally on your device and remain
          until you clear the App's data or uninstall it.
        </P>
      </Section>

      <Section title="5. CHILDREN'S PRIVACY">
        <P>
          The App is not directed at children under 13, and we do not
          knowingly collect personal information from children.
        </P>
      </Section>

      <Section title="6. YOUR CHOICES">
        <P>
          You can deny or revoke location, Bluetooth, or notification
          permissions at any time — some features (like prayer time
          accuracy or device sync) may not work correctly without them.
        </P>
      </Section>

      <Section title="7. CHANGES TO THIS POLICY">
        <P>
          We may update this Privacy Policy from time to time. Material
          changes will be reflected by updating the effective date below.
        </P>
      </Section>

      <Section title="8. CONTACT">
        <P>
          Questions about this Privacy Policy or your data can be sent to{' '}
          <Text style={styles.link} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
            {SUPPORT_EMAIL}
          </Text>
          .
        </P>
      </Section>
    </>
  );
}

export default function LegalScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('terms');

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms & Privacy</Text>
        <View style={styles.backButton} />
      </View>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
            >
              <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.effectiveDate}>
          Effective {EFFECTIVE_DATE} · App version {APP_VERSION}
        </Text>

        {activeTab === 'terms' ? <TermsContent /> : <PrivacyContent />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 28, color: colors.navy, marginTop: -2 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.navy },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: colors.gold,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabButtonTextActive: {
    color: colors.white,
  },
  content: {
    paddingHorizontal: 24,
  },
  effectiveDate: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 16,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    color: colors.navy,
    lineHeight: 21,
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  bulletDot: {
    fontSize: 14,
    color: colors.gold,
    marginRight: 8,
    marginTop: 2,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: colors.navy,
    lineHeight: 21,
  },
  bulletBold: {
    fontWeight: '700',
  },
  link: {
    color: colors.gold,
    fontWeight: '600',
  },
});