import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { light as colors } from '../theme/colors';
import { saveManualLocation, clearManualLocation } from '../location/manualLocationStore';
import { getCoords } from '../location/locationStore';
import { getYearRawDays, clearYearRawCache } from '../prayer/yearRawStore';
import { getTodayPrayerTimes } from '../api/api';
import { setPrayerData } from '../prayer/prayerTimesStore';

function isValidLat(n) { return Number.isFinite(n) && n >= -90 && n <= 90; }
function isValidLng(n) { return Number.isFinite(n) && n >= -180 && n <= 180; }

export default function UpdateLocationScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  // Pre-fill with whatever coordinates are currently active (GPS or a
  // previous manual save), so re-opening this screen to nudge the value
  // slightly doesn't mean retyping both fields from scratch.
  const existing = getCoords();
  const [lat, setLat] = useState(existing ? String(existing.latitude) : '');
  const [lng, setLng] = useState(existing ? String(existing.longitude) : '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Pushes the new coordinates all the way through: saves the override,
  // clears the in-memory raw-year cache (so a stale year for the OLD
  // location can't be served for the new one under a mismatched key —
  // belt-and-suspenders alongside the cache key already including coords),
  // then does two things in parallel:
  //  - re-fetches + AsyncStorage-caches the full year of raw prayer times
  //    for the new location (yearRawStore.getYearRawDays), which is what
  //    ClockScreen/PrayerListScreen/MonthPrayerScreen read from
  //  - re-fetches today's tuned prayer times for prayerTimesStore, so the
  //    Home screen's clock reflects the new location immediately even if
  //    ClockScreen isn't currently mounted to do it via subscribeCoords
  const applyNewLocation = async (latitude, longitude) => {
    let cityLabel = null;
    try {
      const results = await Location.reverseGeocodeAsync({ latitude, longitude });
      const place = results?.[0];
      cityLabel = place?.city || place?.subregion || place?.region || place?.district || null;
    } catch (geoErr) {
      // Non-fatal — prayer times only need lat/lng, the city name is
      // purely for display (same fallback pattern as useLocationOnLaunch).
      console.warn('Reverse geocoding manual location failed:', geoErr.message);
    }

    await saveManualLocation({ latitude, longitude }, cityLabel);
    clearYearRawCache();

    const year = new Date().getFullYear();
    await Promise.all([
      getYearRawDays(year, { forceRefresh: true }),
      getTodayPrayerTimes().then(({ data }) => setPrayerData(data)),
    ]);
  };

  const handleSave = async () => {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (!isValidLat(latitude)) {
      setError('Enter a valid latitude between -90 and 90.');
      return;
    }
    if (!isValidLng(longitude)) {
      setError('Enter a valid longitude between -180 and 180.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await applyNewLocation(latitude, longitude);
      navigation.goBack();
    } catch (err) {
      setError('Could not update prayer times for this location. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  // Counterpart to manually setting a location — lets the user go back to
  // GPS-detected location without reinstalling the app. Re-requesting
  // getCurrentPositionAsync directly here (rather than re-running
  // useLocationOnLaunch, which only runs once from App.js on mount) is
  // what actually gets a fresh GPS fix right now.
  const handleUseGpsInstead = async () => {
    setError(null);
    setResetting(true);
    try {
      await clearManualLocation();
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = position.coords;
      await applyNewLocation(latitude, longitude);
      navigation.goBack();
    } catch (err) {
      setError('Could not get GPS location. Check location permission/services and try again.');
    } finally {
      setResetting(false);
    }
  };

  const busy = saving || resetting;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backButton}>
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Update Location</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.paragraph}>
            Enter coordinates manually to calculate prayer times for a specific place instead of your
            device's GPS location. This is saved and used every time the app opens, until you switch back
            to automatic location.
          </Text>

          <Text style={styles.inputLabel}>Latitude</Text>
          <TextInput
            style={styles.input}
            value={lat}
            onChangeText={setLat}
            placeholder="e.g. 22.5726"
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
            editable={!busy}
          />

          <Text style={styles.inputLabel}>Longitude</Text>
          <TextInput
            style={styles.input}
            value={lng}
            onChangeText={setLng}
            placeholder="e.g. 88.3639"
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
            editable={!busy}
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.saveBtn, busy && styles.btnDisabled]}
            onPress={handleSave}
            disabled={busy}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save Location</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.gpsBtn, busy && styles.btnDisabled]}
            onPress={handleUseGpsInstead}
            disabled={busy}
          >
            {resetting ? (
              <ActivityIndicator color={colors.gold} size="small" />
            ) : (
              <Text style={styles.gpsBtnText}>Use GPS Location Instead</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
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
  content: { paddingHorizontal: 24, paddingTop: 8 },
  paragraph: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 21,
    marginBottom: 24,
  },
  inputLabel: { fontSize: 13, fontWeight: '600', color: colors.navy, marginBottom: 8 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.navy,
    marginBottom: 18,
  },
  errorText: { color: colors.danger, fontSize: 13, marginBottom: 12, marginTop: -6 },
  saveBtn: {
    backgroundColor: colors.gold,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  gpsBtn: {
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  gpsBtnText: { color: colors.gold, fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});