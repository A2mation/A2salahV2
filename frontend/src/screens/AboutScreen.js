import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Linking, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { light as colors } from '../theme/colors';

const APP_VERSION = '1.0.0';

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const handleEmail = () => {
    Linking.openURL('mailto:salaha2mation@gmail.com?subject=A2salah%20Support');
  };

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About A2salah</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoWrap}>
          <Image
            source={require('../../assets/CompanyLogo.jpeg')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.appName}>A2salah</Text>
        <Text style={styles.version}>Version {APP_VERSION}</Text>

        <Text style={styles.paragraph}>
          A2salah helps you keep up with the five daily prayers — accurate
          prayer times for your city, adjustable timing offsets, reminders,
          Qibla direction, and sync with your A2salah prayer-clock device.
        </Text>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>WHAT YOU GET</Text>
        <View style={styles.featureRow}>
          <Text style={styles.featureIcon}>🕌</Text>
          <Text style={styles.featureText}>Daily and monthly prayer time charts</Text>
        </View>
        <View style={styles.featureRow}>
          <Text style={styles.featureIcon}>🎚️</Text>
          <Text style={styles.featureText}>Fine-tune timings for your location</Text>
        </View>
        <View style={styles.featureRow}>
          <Text style={styles.featureIcon}>🔔</Text>
          <Text style={styles.featureText}>Azan reminders with custom sounds</Text>
        </View>
        <View style={styles.featureRow}>
          <Text style={styles.featureIcon}>🧭</Text>
          <Text style={styles.featureText}>Qibla direction from your location</Text>
        </View>
        <View style={styles.featureRow}>
          <Text style={styles.featureIcon}>📶</Text>
          <Text style={styles.featureText}>Sync prayer times to your A2salah device</Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>DEVELOPED BY</Text>
        <Text style={styles.paragraph}>A2mation</Text>

        <TouchableOpacity onPress={handleEmail}>
          <Text style={styles.link}>a2mationsolution@gmail.com</Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          © {new Date().getFullYear()} A2mation. All rights reserved.
        </Text>
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
  content: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  logoWrap: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    overflow: 'hidden',
  },
  logo: { width: '100%', height: '100%' },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.navy,
    marginTop: 16,
  },
  version: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  paragraph: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 16,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    alignSelf: 'stretch',
    marginVertical: 20,
  },
  sectionTitle: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: 12,
  },
  featureIcon: { fontSize: 18, width: 32 },
  featureText: { fontSize: 14, color: colors.navy, flex: 1 },
  link: {
    fontSize: 14,
    color: colors.gold,
    fontWeight: '600',
    marginTop: 8,
  },
  footerNote: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 28,
    textAlign: 'center',
  },
});