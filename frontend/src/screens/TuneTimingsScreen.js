import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { light as colors } from '../theme/colors';
import { getTune, setTune, resetTune } from '../tune/tuneStore';
import { getRamadanTune, setRamadanTune, resetRamadanTune } from '../tune/ramadanTuneStore';

const PRAYERS = [
  { key: 'fajr', label: 'Fajr' },
  { key: 'sunrise', label: 'Sunrise' },
  { key: 'dhuhr', label: 'Johar' },
  { key: 'jummah', label: 'Jummah', sublabel: 'minutes after Johar' },
  { key: 'ishraq', label: 'Ishraq', sublabel: 'extra minutes after sunrise (~15 min default)' },
  { key: 'chasht', label: 'Chasht (Duha)', sublabel: 'extra minutes after sunrise (~90 min default)' },
  { key: 'asr', label: 'Asr' },
  { key: 'maghrib', label: 'Maghrib' },
  { key: 'isha', label: 'Ishaa' },
];

// The 5 daily prayers whose window *end* can be tuned. Each maps to the
// offset key stored in tuneStore (fajr -> fajrEnd, etc). By default (0 min)
// a prayer's end is the same as its own start time — the offset here is
// how many minutes after start the window should be shown as ending.
const END_PRAYERS = [
  { key: 'fajrEnd', label: 'Fajr', sublabel: 'minutes after Fajr starts' },
  { key: 'dhuhrEnd', label: 'Johar', sublabel: 'minutes after Johar starts' },
  { key: 'asrEnd', label: 'Asr', sublabel: 'minutes after Asr starts' },
  { key: 'maghribEnd', label: 'Maghrib', sublabel: 'minutes after Maghrib starts' },
  { key: 'ishaEnd', label: 'Ishaa', sublabel: 'minutes after Ishaa starts' },
];

const MIN_OFFSET = -30;
const MAX_OFFSET = 30;
// End-time offsets count minutes *after* the prayer's own start, so they
// can't go negative (that would put the end before the start), and the
// window can reasonably run up to a few hours.
const END_MIN_OFFSET = 0;
const END_MAX_OFFSET = 180;

const MODE_OPTIONS = [
  { key: 'normal', label: 'Normal Days' },
  { key: 'ramadan', label: 'Ramadan' },
];

function formatOffset(mins) {
  if (mins === 0) return '0 min';
  const sign = mins > 0 ? '+' : '';
  return `${sign}${mins} min`;
}

function TuneRow({ label, sublabel, value, onChange, min = MIN_OFFSET, max = MAX_OFFSET }) {
  const clampAndSet = (next) => {
    onChange(Math.max(min, Math.min(max, next)));
  };

  return (
    <View style={styles.row}>
      <View style={styles.rowLabelWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
      </View>
      <View style={styles.stepper}>
        <TouchableOpacity
          style={styles.stepButton}
          onPress={() => clampAndSet(value - 1)}
          hitSlop={8}
        >
          <Text style={styles.stepButtonText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepValue}>{formatOffset(value)}</Text>
        <TouchableOpacity
          style={styles.stepButton}
          onPress={() => clampAndSet(value + 1)}
          hitSlop={8}
        >
          <Text style={styles.stepButtonText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function TuneTimingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  // 'normal' reads/writes tuneStore; 'ramadan' reads/writes its own
  // ramadanTuneStore — separate saved offsets, same shape/UI. Applied only
  // during Ramadan (see applyRamadanTuneToTimes), so setting these has no
  // effect on the rest of the year and vice versa.
  const [mode, setMode] = useState('normal');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [values, setValues] = useState(() => ({ ...getTune() }));
  const [ramadanValues, setRamadanValues] = useState(() => ({ ...getRamadanTune() }));

  const isRamadan = mode === 'ramadan';
  const activeValues = isRamadan ? ramadanValues : values;
  const setActiveValues = isRamadan ? setRamadanValues : setValues;

  const updatePrayer = (key, next) => {
    setActiveValues((prev) => ({ ...prev, [key]: next }));
  };

  const handleSave = () => {
    if (isRamadan) {
      setRamadanTune(ramadanValues);
      navigation.goBack();
      return;
    }
    setTune(values);
    navigation.goBack();
  };

  const handleReset = () => {
    if (isRamadan) {
      resetRamadanTune();
      setRamadanValues({ ...getRamadanTune() });
      return;
    }
    resetTune();
    setValues({ ...getTune() });
  };

  const currentModeLabel = MODE_OPTIONS.find((m) => m.key === mode)?.label;

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tune Prayer Timings</Text>

        <View>
          <TouchableOpacity
            onPress={() => setDropdownOpen((v) => !v)}
            style={styles.modeButton}
            hitSlop={8}
          >
            <Text style={styles.modeButtonText}>{currentModeLabel}</Text>
            <Text style={styles.modeButtonChevron}>{dropdownOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {dropdownOpen && (
            <View style={styles.dropdown}>
              {MODE_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setMode(option.key);
                    setDropdownOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      option.key === mode && styles.dropdownItemTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {option.key === mode && <Text style={styles.dropdownCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      {isRamadan && (
        <View style={styles.ramadanBanner}>
          <Text style={styles.ramadanBannerText}>
            Ramadan timings are separate from your normal days settings, and only apply automatically on days that fall within Ramadan.
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          Nudge each prayer time to match your local mosque, in minutes. This only adjusts what's shown in the app — it doesn't change the underlying calculation method. Jummah defaults to your Johar time; use its offset to add your mosque's khutbah/gathering buffer. Ishraq and Chasht are timed from sunrise with sensible defaults built in — their offsets add extra minutes on top if you'd like them later.
        </Text>

      <Text style={styles.sectionTitle}>Azan Time</Text>
        <View style={styles.card}>
          {PRAYERS.map(({ key, label, sublabel }) => (
            <TuneRow
              key={key}
              label={label}
              sublabel={sublabel}
              value={activeValues[key] ?? 0}
              onChange={(next) => updatePrayer(key, next)}
            />
          ))}
        </View>

       
        <Text style={styles.subtitle}>
          By default each prayer's window Jama"at time  matches its own Azan time (0 min) — set minutes here to show how long after it starts the window stays open on the home screen.
        </Text>
         <Text style={styles.sectionTitle}>Jama'at Time</Text>

        <View style={styles.card}>
          {END_PRAYERS.map(({ key, label, sublabel }) => (
            <TuneRow
              key={key}
              label={label}
              sublabel={sublabel}
              value={activeValues[key] ?? 0}
              onChange={(next) => updatePrayer(key, next)}
              min={END_MIN_OFFSET}
              max={END_MAX_OFFSET}
            />
          ))}
        </View>

        <TouchableOpacity onPress={handleReset} style={styles.resetButton}>
          <Text style={styles.resetButtonText}>Reset all to default</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
      </View>
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
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeButtonText: { color: colors.navy, fontSize: 13, fontWeight: '700', marginRight: 6 },
  modeButtonChevron: { color: colors.gold, fontSize: 10 },
  dropdown: {
    position: 'absolute',
    top: 44,
    right: 0,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 6,
    minWidth: 150,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 20,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  dropdownItemText: { color: colors.navy, fontSize: 14 },
  dropdownItemTextActive: { color: colors.gold, fontWeight: '700' },
  dropdownCheck: { color: colors.gold, fontSize: 13, marginLeft: 8 },
  ramadanBanner: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gold,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  ramadanBannerText: { color: colors.gold, fontSize: 12, lineHeight: 17 },
  content: { paddingHorizontal: 20, paddingBottom: 20 },
  subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 20 },
  sectionTitle: { color: colors.navy, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabelWrap: { flexShrink: 1, paddingRight: 8 },
  rowLabel: { color: colors.navy, fontSize: 15, fontWeight: '600' },
  rowSublabel: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonText: { fontSize: 18, color: colors.navy, fontWeight: '700', marginTop: -2 },
  stepValue: { width: 70, textAlign: 'center', color: colors.navy, fontSize: 14, fontWeight: '600' },
  resetButton: { alignSelf: 'center', marginTop: 20, paddingVertical: 8, paddingHorizontal: 12 },
  resetButtonText: { color: colors.gold, fontSize: 14, fontWeight: '600' },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  saveButton: {
    backgroundColor: colors.gold,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
