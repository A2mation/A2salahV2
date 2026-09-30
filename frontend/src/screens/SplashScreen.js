import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../theme/colors';
import { getTodayPrayerTimesCached } from '../prayer/todayPrayerCache';
import { getTodayFromYearRaw } from '../prayer/todayFromYear';
import { getLocationReady, subscribeLocationReady } from '../location/locationStore';
import { setPrayerData } from '../prayer/prayerTimesStore';
import { hasCompletedOnboarding } from '../onboarding/onboardingStore';

// Absolute ceiling on how long Splash will wait for location + the backend
// before moving on anyway. Render's free tier can take 30-60s to wake up
// from a cold start — this gives that room — but a backend outage should
// never strand the user on Splash forever. If this fires before the fetch
// finishes, Home's own screens still fall back to fetching for themselves.
const MAX_WAIT_MS = 45000;

export default function SplashScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('Loading your spiritual space...');

  useEffect(() => {
    let cancelled = false;
    let advanced = false;

    // Welcome is shown on every launch. isFirstLaunch tells Welcome whether
    // to show the "Get Started" button (first launch only) or auto-continue
    // to Home on its own (every launch after that).
    const goToNextScreen = async () => {
      if (advanced || cancelled) return;
      advanced = true;
      const seenWelcome = await hasCompletedOnboarding();
      if (cancelled) return;
      // return;


      navigation.replace('Welcome', { isFirstLaunch: !seenWelcome });
    };

    // Safety net — never let Splash hang past this no matter what.
    const maxTimer = setTimeout(goToNextScreen, MAX_WAIT_MS);

    const waitForLocation = () =>
      new Promise((resolve) => {
        if (getLocationReady()) {
          resolve();
          return;
        }
        const unsubscribe = subscribeLocationReady((ready) => {
          if (ready) {
            unsubscribe();
            resolve();
          }
        });
      });

    const runPrefetch = async () => {
      // Step 1: wait for App.js's useLocationOnLaunch() to settle (granted,
      // denied, or its own internal GPS timeout) so the fetch below can use
      // real coordinates when they're available, instead of racing ahead
      // of them and calculating times for the backend's default location.
      setMessage('Detecting your location...');
      await waitForLocation();
      if (cancelled) return;

      // Step 2: fetch today's prayer times now, while still on Splash, so
      // Home's Clock/PrayerList tabs can render instantly from cache
      // instead of each showing their own spinner while the backend
      // (Render free tier) wakes up from a cold start.
      setMessage('Fetching prayer times...');
      try {
        // Try to build today's times from the already-cached full-year
        // data first — this is a pure AsyncStorage read on every day after
        // the year's first fetch, so a new calendar day no longer means a
        // guaranteed hit on the (slow, cold-starting) backend. Only fall
        // back to the network call if that cache genuinely has nothing for
        // this (year, location) yet.
        let data = await getTodayFromYearRaw();
        if (!data) {
          data = await getTodayPrayerTimesCached();
        }
        if (!cancelled) setPrayerData(data);
      } catch (err) {
        console.warn('Splash prefetch failed:', err.message);
        // Fall through anyway — Home's own screens will retry the fetch
        // themselves, so a failed prefetch just means no head start.
      }

      if (!cancelled) {
        clearTimeout(maxTimer);
        goToNextScreen();
      }
    };

    runPrefetch();

    return () => {
      cancelled = true;
      clearTimeout(maxTimer);
    };
  }, [navigation]);

  return (
    <LinearGradient colors={[colors.background, colors.backgroundLight]} style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
       <View style={styles.topContent}>
      <View style={styles.logoCircle}>
        <Image
          source={require('../../assets/splash.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.title}>A2SALAH</Text>
      <Text style={styles.subtitle}>Your Path to Peaceful Prayer</Text>
     </View>
      <Text style={styles.loading}>{message}</Text>
      <Text style={styles.poweredBy}>Powered by A2mation</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topContent: {
    alignItems: 'center',
    marginTop: -80, // nudges the logo/title/subtitle block up from dead-center
  },
  logoCircle: {
    width: 250,
    height: 250,
    borderRadius: 150,
    backgroundColor: colors.backgroundLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    overflow: 'hidden',
  },
  icon: {
    fontSize: 56,
  },
  logoImage: {
    width: 250,
    height: 250,
  },
  title: {
    color: colors.white,
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: 6,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    marginTop: 12,
  },
  loading: {
    position: 'absolute',
    bottom: 80,
    color: colors.textMuted,
    fontSize: 14,
  },
  poweredBy: {
    position: 'absolute',
    bottom: 53,
    alignSelf: 'center',
    color: colors.gold,
    fontSize: 13,
    fontWeight: '600',
  },
});