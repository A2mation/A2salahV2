import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { light as colors } from '../theme/colors';
import { getTodayPrayerTimes } from '../api/api';
import { subscribeCoords, subscribeCity, getCity } from '../location/locationStore';
import { openDrawer } from '../drawer/drawerStore';
import { getSyncing, subscribeSyncing } from '../sync/syncStatusStore';
import { useEspConnection } from '../wifi/EspConnectionContext';
import {
  ClockTabIcon,
  ListTabIcon,
  ReminderTabIcon,
  GlobeTabIcon,
  QiblaTabIcon,
} from '../components/icons/TabIcons';
import ClockScreen from './ClockScreen';
import PrayerListScreen from './PrayerListScreen';
import RemindersScreen from './RemindersScreen';
import EspSyncScreen from './EspSyncScreen';
import QiblaScreen from './QiblaScreen';
import MonthPrayerScreen from './MonthPrayerScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TABS = [
  { key: 'clock',       Icon: ClockTabIcon },
  { key: 'qibla',       Icon: QiblaTabIcon },
  { key: 'reminders',   Icon: ReminderTabIcon },
   { key: 'list',        Icon: ListTabIcon },
  { key: 'worldCities', Icon: GlobeTabIcon },
];

const LAST_BUILT_INDEX = 4;

export default function HomeScreen() {
  const insets   = useSafeAreaInsets();
  const scrollRef = useRef(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [city,        setCity]        = useState('Kolkata');
  const [autoDetected, setAutoDetected] = useState(false);
  // Actual pixel height left for a page once the header/city-row above and
  // the bottom nav below have taken their space — measured directly (see
  // the pager's onLayout below) rather than assumed, since it changes
  // slightly per phone and per tab (the city row only shows on some tabs).
  const [pagerHeight, setPagerHeight] = useState(0);

  // True while EspSyncScreen (the last tab) has a send to the ESP32 in
  // flight. While true, the bottom nav, pager swipe, and hamburger/drawer
  // are all locked so a send can't be interrupted by navigating away —
  // see syncStatusStore.js for why this needs to be a shared store rather
  // than local state (EspSyncScreen and this bottom nav are siblings).
  const [syncing, setSyncingState] = useState(getSyncing());
  useEffect(() => subscribeSyncing(setSyncingState), []);

  // Drives the Connected/Disconnected badge in the top-right of the
  // header — reflects EspSyncScreen's live hotspot connection state (see
  // EspConnectionContext.js) even while a different tab is active.
  const { espConnected } = useEspConnection();

  /* ── Fetch city name for header ─────────────────────────────────── */
  const fetchCity = useCallback(async () => {
    try {
      const { data } = await getTodayPrayerTimes();
      if (data?.city) setCity(data.city);
      if (getCity()) setAutoDetected(true);
    } catch (err) {
      console.warn('Failed to fetch location', err.message);
    }
  }, []);

  useEffect(() => { fetchCity(); }, [fetchCity]);

  // useLocationOnLaunch (in App.js) resolves GPS asynchronously and may
  // still be running when this screen first mounts — fetchCity() above can
  // fire before coordinates exist. Re-fetch whenever coordinates arrive (or
  // change) afterwards so the city header doesn't stay stuck on the
  // fallback/default city. Also re-fetch once reverse-geocoding resolves
  // the city name, since that can land slightly after the coordinates do.
  useEffect(() => {
    const unsubscribeCoords = subscribeCoords(() => { fetchCity(); });
    const unsubscribeCity = subscribeCity(() => { fetchCity(); });
    return () => {
      unsubscribeCoords();
      unsubscribeCity();
    };
  }, [fetchCity]);

  /* ── Tab press → scroll pager to that page ───────────────────────── */
  const goToTab = (index) => {
    if (index > LAST_BUILT_INDEX) return;
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    setActiveIndex(index);
  };

  /* ── Pager scroll end → sync active tab indicator ───────────────── */
  const onScrollEnd = (e) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (page <= LAST_BUILT_INDEX) setActiveIndex(page);
  };

  const showCityHeader = activeIndex === 0 || activeIndex === 1 || activeIndex === 3;

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>

      {/* Home uses the light/cream theme, but App.js sets the status bar
          style to "light" (white icons) globally for the dark-themed
          Welcome/Splash screens. White icons on this light background
          forced Android to paint its own translucent legibility scrim
          behind the status bar — showing up as a pale band right above
          the hamburger icon. Overriding to "dark" here (dark icons, no
          scrim needed) removes it while Home is the focused screen. */}
      <StatusBar style="dark" />

      {/* ── Top header ─────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          hitSlop={12}
          disabled={syncing}
          onPress={() => {
            console.log('[HomeScreen] hamburger pressed, calling openDrawer()');
            openDrawer();
          }}
        >
          <View style={[styles.menuLine, syncing && styles.menuLineDisabled]} />
          <View style={[styles.menuLine, syncing && styles.menuLineDisabled]} />
          <View style={[styles.menuLine, syncing && styles.menuLineDisabled]} />
        </TouchableOpacity>

        <View
          style={[
            styles.connectionBadge,
            espConnected ? styles.connectionBadgeConnected : styles.connectionBadgeDisconnected,
          ]}
        >
          <View
            style={[
              styles.connectionDot,
              { backgroundColor: espConnected ? colors.success : colors.danger },
            ]}
          />
          <Text
            style={[
              styles.connectionBadgeText,
              { color: espConnected ? colors.success : colors.danger },
            ]}
          >
            {espConnected ? 'Connected' : 'Disconnected'}
          </Text>
        </View>
      </View>

      {/* ── City header (clock + list tabs only) ───────────────────── */}
      {showCityHeader && (
        <>
          <View style={styles.cityRow}>
            <Text style={styles.pin}>📍</Text>
            <Text style={styles.city}>{city}</Text>
          </View>
          <Text style={styles.subCity}>
            {autoDetected ? 'Location detected automatically' : 'Detecting location…'}
          </Text>
        </>
      )}

      {/* ── Horizontal pager ──────────────────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        // Prevent the pager from eating vertical scrolls inside child screens
        decelerationRate="fast"
        // Don't scroll past the last built tab — and don't allow swiping
        // at all while a sync send is in flight (see syncing above), so
        // the user can't drag away from EspSyncScreen mid-send.
        scrollEnabled={!syncing}
        style={{ flex: 1 }}
        contentContainerStyle={{ width: SCREEN_WIDTH * TABS.length }}
        // Measures the real, final space left for a page after the header
        // (and city row, when shown) above and the bottom nav below have
        // taken their space — i.e. exactly "full screen minus header and
        // footer". Passing this down as a fixed number to ClockScreen
        // (instead of it guessing via its own flex/onLayout) is what
        // makes its height deterministic rather than dependent on how
        // the pager's flex happens to resolve.
        onLayout={(e) => setPagerHeight(e.nativeEvent.layout.height)}
      >
        {/* Each page is SCREEN_WIDTH wide and fills the available height */}
        <View style={styles.page}><ClockScreen pageHeight={pagerHeight} /></View>
        <View style={styles.page}><PrayerListScreen /></View>
        <View style={styles.page}><RemindersScreen /></View>
        
        <View style={styles.page}><MonthPrayerScreen /></View>
        <View style={styles.page}><EspSyncScreen /></View>
      </ScrollView>

      {/* ── Bottom nav ────────────────────────────────────────────── */}
      <View style={[styles.bottomNav, { paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }]}>
        {TABS.map((tab, index) => {
          const isActive = activeIndex === index;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => goToTab(index)}
              hitSlop={10}
              disabled={syncing}
              style={styles.navItem}
            >
              <tab.Icon
                size={28}
                color={isActive ? colors.iconActive : (syncing ? colors.border : colors.iconInactive)}
              />
              <View style={[styles.navUnderline, isActive && styles.navUnderlineActive]} />
            </TouchableOpacity>
          );
        })}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  menuLine: { width: 22, height: 2.5, backgroundColor: colors.navy, marginVertical: 2.5, borderRadius: 2 },
  menuLineDisabled: { backgroundColor: colors.border },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  connectionBadgeConnected: { backgroundColor: colors.successBg },
  connectionBadgeDisconnected: { backgroundColor: colors.dangerBg },
  connectionDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 6 },
  connectionBadgeText: { fontSize: 12, fontWeight: '700' },
  cityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  pin: { fontSize: 16, marginRight: 6 },
  city: { color: colors.navy, fontSize: 22, fontWeight: '700' },
  subCity: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 8, textAlign: 'center' },
  page: { width: SCREEN_WIDTH, flex: 1 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: colors.textMuted, fontSize: 16 },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 10,
    backgroundColor: colors.navBar,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  // Transparent (not display:none) when inactive so its height is always
  // reserved — otherwise every icon would shift up/down by 4px depending
  // on whether its own tab is active, since a hidden element still needs
  // its layout space held to avoid that jump.
  navUnderline: {
    marginTop: 4,
    width: 18,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'transparent',
  },
  navUnderlineActive: { backgroundColor: colors.iconActive },
  navIcon: { fontSize: 22, color: colors.iconInactive },
  navIconActive: { color: colors.iconActive },
});