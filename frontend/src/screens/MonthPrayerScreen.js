import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import { light as colors } from '../theme/colors';
import { subscribeCoords } from '../location/locationStore';
import { subscribeTune, getTune } from '../tune/tuneStore';
import { getYearRawDays } from '../prayer/yearRawStore';
import { applyBaseTuneToTimes } from '../prayer/applyTune';
import {
  getAllDateTunes, subscribeDateTunes, applyDateTuneToTimes, MIRROR_KEYS,
  getAllYearRoundTimes, subscribeYearRoundTimes, applyYearRoundTimesToTimes,
} from '../tune/dateTuneStore';
import { applyRamadanTuneToTimes, subscribeRamadanTune } from '../tune/ramadanTuneStore';

// Short column headers for the timetable (kept narrow so all 6 fit on one row).
const PRAYER_COLUMNS = [
  { key: 'fajr', label: 'Fajr' },
  { key: 'dhuhr', label: 'Zohar' },
  { key: 'jummah', label: 'Jummah' },
  { key: 'asr', label: 'Asr' },
  { key: 'maghrib', label: 'Mag' },
  { key: 'isha', label: 'Isha' },
];

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// "Other" view — Ramadan-facing timings, served by the same /times object
// (sehri === fajr, iftar === maghrib, zawal === solar noon).
const OTHER_COLUMNS = [
  { key: 'sehri', label: 'Sehri' },
   { key: 'sunrise', label: 'Sunrise' },
    { key: 'ishraq', label: 'Ishraq' },
     { key: 'chasht', label: 'Chasht' },
  { key: 'zawal', label: 'Zawal' },
  { key: 'iftar', label: 'Iftar' },
];

// The dropdown next to the month nav switches which column set is shown.
// "prayers"/"jamaat" both use PRAYER_COLUMNS, "other"/"otherJamaat" both
// use OTHER_COLUMNS — same 4-combination shape as the ESP32 sync payload
// (buildAllDeviceDayPayloads: chart x azan/jamaat). Only the time shown
// per cell differs between the Azan and Jama'at variant of each chart.
const VIEW_OPTIONS = [
  { key: 'prayers', label: 'Prayer Azan' },
  { key: 'jamaat', label: 'Prayer Jamaat' },
  { key: 'other', label: 'Other Start Time' },
  { key: 'otherJamaat', label: 'Other End Time' },
];

// Jama'at time = Azan time + a per-prayer offset (minutes), set on the
// "Tune Prayer Timings" screen ("minutes after <Prayer> starts") and
// stored in tuneStore as `<prayer>End`. Same convention already used when
// syncing to the ESP32 — see applyJamaatOffset in sync/prayerPayload.js.
// Jummah has no such offset in the UI, so its Jama'at time == its Azan time.
const JAMAAT_OFFSET_KEYS = {
  fajr: 'fajrEnd',
  dhuhr: 'dhuhrEnd',
  asr: 'asrEnd',
  maghrib: 'maghribEnd',
  isha: 'ishaEnd',
};

// The "Other" chart's 6 fields aren't prayers themselves, so they don't
// have their own tune offsets — each one mirrors whichever prayer it's
// tied to, same convention as buildDeviceDayPayloadRaw in
// sync/prayerPayload.js ("Sehri follows Fajr's offset, Zawal follows
// Dhuhr's, Iftar follows Maghrib's"). Sunrise/Ishraq/Chasht have no
// congregation concept, so they're left out — their Jama'at time is just
// their Azan time (no offset applied).
const OTHER_JAMAAT_OFFSET_KEYS = {
  sehri: 'fajrEnd',
  zawal: 'dhuhrEnd',
  iftar: 'maghribEnd',
};

// Adds a per-prayer Jama'at offset (minutes) on top of an Azan time. No-op
// when either input is missing/zero, so untuned prayers (and Jummah, which
// has no offset key) simply show their Azan time on the Jama'at chart too.
function applyJamaatOffset(isoOrDate, offsetMinutes) {
  if (!isoOrDate || !offsetMinutes) return isoOrDate;
  return new Date(new Date(isoOrDate).getTime() + offsetMinutes * 60000);
}

// Alternating column shading (deep / light) so the timetable reads as a
// clear grid — every other prayer column is a shade deeper than its
// neighbour. The Date column is intentionally left out of this and keeps
// its plain background.
const COLUMN_DEEP = '#eee4db';
const COLUMN_LIGHT = '#FFFFFF';
const columnBg = (index) => (index % 2 === 0 ? COLUMN_DEEP : COLUMN_LIGHT);

// Johar/Jummah need extra width — their times are more likely to wrap
// onto two lines than the shorter Fajr/Asr/Mag/Isha columns.
const columnFlex = (key) => (key === 'dhuhr' || key === 'jummah' ? 1.3 : 1);

// Whether THIS SPECIFIC column (not just "some column on this date") has a
// saved override — either a one-off per-date offset, or a year-round fixed
// time that covers it — resolving sehri/iftar to fajr/maghrib the same way
// dateTuneStore itself does, so the "Other" view's Sehri/Iftar cells light
// up correctly whenever the user tuned Fajr/Maghrib. Only this cell's own
// time text should turn blue; the rest of that day's row stays untouched.
function isCellModified(dateOverride, yearRoundEntry, columnKey) {
  const offsetKey = MIRROR_KEYS[columnKey] || columnKey;
  const dateModified = !!dateOverride && !!dateOverride[offsetKey];
  const yearRoundModified = !!yearRoundEntry && !!yearRoundEntry[offsetKey];
  return dateModified || yearRoundModified;
}

// Built manually instead of using toLocaleTimeString(): on some devices/ICU
// data, the locale formatter inserts a narrow no-break space (U+202F, not a
// normal ' ') right before "am"/"pm" — .replace(' ', '') doesn't match that
// character, so the invisible space was still there and text wrapping would
// break right on it, splitting "am" onto its own line (e.g. "11:40 a" / "m").
// Building the string ourselves guarantees no whitespace of any kind.
function formatTime(isoOrDate) {
  if (!isoOrDate) return '--:--';
  const d = new Date(isoOrDate);
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes}${ampm}`;
}

// Pure content for the "month" tab — shows every day of the selected month
// with that day's prayer timings in a scrollable timetable. The header
// (hamburger/city) and bottom nav live in HomeScreen.js.
export default function MonthPrayerScreen() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [monthData, setMonthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [viewMode, setViewMode] = useState('prayers'); // 'prayers' | 'jamaat' | 'other' | 'otherJamaat'
  // Personal Jama'at offsets (fajrEnd/dhuhrEnd/asrEnd/maghribEnd/ishaEnd),
  // kept in state (not just read once) so tuning them while this screen is
  // mounted immediately recomputes the Jama'at chart — same rationale as
  // dateTunes/yearRoundTimes below.
  const [tune, setTuneState] = useState(getTune());
  const [viewPickerOpen, setViewPickerOpen] = useState(false);
  const [viewMenuPos, setViewMenuPos] = useState({ top: 0, right: 0 });
  const viewPillRef = useRef(null);
  // Per-date overrides saved from "Tune a Specific Date" (drawer). Kept in
  // state (not just read once) so a date tuned while this screen is
  // mounted immediately recolors here without needing a re-fetch.
  const [dateTunes, setDateTunes] = useState(getAllDateTunes());
  // Exact year-round fixed times set from the "Every day" checkbox on Tune
  // a Date — separate from dateTunes (which only ever holds per-date
  // minute offsets). Same reasoning as dateTunes: kept in state so a
  // year-round time set while this screen is mounted recolors/re-times
  // immediately without a re-fetch.
  const [yearRoundTimes, setYearRoundTimes] = useState(getAllYearRoundTimes());

  const activeColumns = (viewMode === 'other' || viewMode === 'otherJamaat') ? OTHER_COLUMNS : PRAYER_COLUMNS;
  const activeViewLabel = VIEW_OPTIONS.find((v) => v.key === viewMode)?.label || 'Prayer Azan';

  useEffect(() => {
    console.log('[ViewPicker] viewPickerOpen changed to:', viewPickerOpen);
  }, [viewPickerOpen]);

  useEffect(() => {
    console.log('[ViewPicker] viewMenuPos changed to:', viewMenuPos);
  }, [viewMenuPos]);

  const openViewPicker = () => {
    console.log('[ViewPicker] openViewPicker called, ref exists:', !!viewPillRef.current);
    // Measure the pill's on-screen position so the dropdown can be anchored
    // directly beneath it instead of centering over the whole screen.
    if (viewPillRef.current) {
      viewPillRef.current.measureInWindow((x, y, width, height) => {
        console.log('[ViewPicker] measureInWindow result:', { x, y, width, height });
        const pos = {
          top: y + height + 6,
          right: Math.max(12, Dimensions.get('window').width - (x + width)),
        };
        console.log('[ViewPicker] computed menu pos:', pos);
        setViewMenuPos(pos);
        setViewPickerOpen(true);
        console.log('[ViewPicker] setViewPickerOpen(true) called');
      });
    } else {
      console.log('[ViewPicker] no ref, opening without measuring');
      setViewPickerOpen(true);
    }
  };

  // Selectable range for the year dropdown: a few years back to several
  // years ahead, centered on the real current year (not the one currently
  // being viewed, so the list doesn't shift while browsing).
  const currentRealYear = now.getFullYear();
  const yearOptions = [];
  for (let y = currentRealYear - 5; y <= currentRealYear + 10; y += 1) {
    yearOptions.push(y);
  }

  // Pulls the WHOLE YEAR's raw (untuned) days from yearRawStore — which
  // only actually calls the API on a genuine cache miss (new year, new
  // location) — then narrows to this month and applies the user's current
  // per-namaz tune offsets locally via applyBaseTuneToTimes. Navigating
  // months, tuning offsets, or reopening the app on the same day therefore
  // costs zero extra API calls; only a new year or a real location change
  // does.
  const fetchData = useCallback(async (y, m) => {
    try {
      const yearDays = await getYearRawDays(y);
      const monthKey = String(m).padStart(2, '0');
      const currentTune = getTune();
      const days = yearDays
        .filter((d) => d.date?.slice(5, 7) === monthKey)
        .map((d) => ({ ...d, times: applyBaseTuneToTimes(d.times, currentTune) }));

      console.log('[MonthPrayer] loaded days for', y, m, '-> date keys:', days.map((d) => d.date));
      console.log('[MonthPrayer] current dateTunes map at fetch time:', getAllDateTunes());

      setMonthData({
        year: y,
        month: m,
        monthName: new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long' }),
        days,
      });
    } catch (err) {
      console.warn('Failed to load month prayer times', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData(year, month);
  }, [year, month, fetchData]);

  // Re-fetch whenever GPS coords change, so the timetable stays in sync
  // with the current location instead of showing stale times.
  useEffect(() => {
    const unsubscribe = subscribeCoords(() => { fetchData(year, month); });
    return unsubscribe;
  }, [year, month, fetchData]);

  // Re-run whenever the user saves new per-namaz tune offsets. This no
  // longer hits the network — fetchData re-tunes the already-cached raw
  // year data locally (see prayer/applyTune.js) — it just needs to re-run
  // so the recalculated times make it into monthData.
  useEffect(() => {
    const unsubscribe = subscribeTune(() => { fetchData(year, month); });
    return unsubscribe;
  }, [year, month, fetchData]);

  // Separately track the raw tune object (not just re-fetching above) so
  // the Jama'at chart's offsets — which are applied client-side, not sent
  // to the backend — update immediately without waiting on that re-fetch.
  useEffect(() => {
    const unsubscribe = subscribeTune((next) => setTuneState(next));
    return unsubscribe;
  }, []);

  // Date-specific overrides are applied client-side (see applyDateTuneToTimes
  // below), so no re-fetch is needed here — just re-render with the latest map.
  useEffect(() => {
    const unsubscribe = subscribeDateTunes((next) => {
      console.log('[MonthPrayer] received updated dateTunes map:', next);
      setDateTunes(next);
    });
    return unsubscribe;
  }, []);

  // Same idea for year-round fixed times — applied client-side via
  // applyYearRoundTimesToTimes below, so a re-render is all that's needed.
  useEffect(() => {
    const unsubscribe = subscribeYearRoundTimes((next) => {
      console.log('[MonthPrayer] received updated yearRoundTimes map:', next);
      setYearRoundTimes(next);
    });
    return unsubscribe;
  }, []);

  // Ramadan offsets also apply client-side, on top of each day's fetched
  // times (see applyRamadanTuneToTimes below) — same no-re-fetch-needed
  // rationale as dateTunes above, just forcing a re-render instead of
  // tracking a value, since applyRamadanTuneToTimes reads the store
  // directly rather than taking it as a prop.
  const [, forceRerender] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeRamadanTune(() => forceRerender((n) => n + 1));
    return unsubscribe;
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(year, month);
  };

  const goToMonth = (offset) => {
    let nextMonth = month + offset;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    } else if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    }
    setMonth(nextMonth);
    setYear(nextYear);
  };

  const selectYear = (y) => {
    setYear(y);
    setYearPickerOpen(false);
  };

  const selectView = (key) => {
    console.log('[ViewPicker] selectView called with:', key);
    setViewMode(key);
    setViewPickerOpen(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Fixed section: month nav + column headers never move — only the
          day rows below scroll underneath them. This avoids RN Web's
          stickyHeaderIndices, which breaks row layout for sticky children. */}
      <View style={styles.fixedWrap}>
        <View style={styles.cardTop}>
          <View style={styles.topRow}>
            <View style={styles.monthNavRow}>
              <TouchableOpacity onPress={() => goToMonth(-1)} hitSlop={10}>
                <Text style={styles.navArrow}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.monthName}>{monthData?.monthName}</Text>
              <TouchableOpacity
                onPress={() => setYearPickerOpen(true)}
                hitSlop={10}
                style={styles.yearPill}
              >
                <Text style={styles.yearText}>{monthData?.year}</Text>
                <Text style={styles.yearCaret}>▾</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => goToMonth(1)} hitSlop={10}>
                <Text style={styles.navArrow}>›</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              ref={viewPillRef}
              onPress={() => { console.log('[ViewPicker] pill pressed'); openViewPicker(); }}
              hitSlop={10}
              style={styles.viewPill}
            >
              <Text style={styles.viewPillText}>{activeViewLabel}</Text>
              <Text style={styles.yearCaret}>▾</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />

          <View style={styles.headerRow}>
            <Text style={[styles.dateHeaderCell, styles.headerText]}>Date</Text>
            {activeColumns.map((col) => (
              <View key={col.key} style={[styles.headerCell, { flex: columnFlex(col.key) }]}>
                <Text style={styles.headerText}>{col.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* View dropdown — switch between the standard Prayers columns and
          the Ramadan-facing Other columns (Sehri/Zawal/Iftar). Anchored
          directly under the pill.

          NOTE: the overlay wrapper below uses StyleSheet.absoluteFillObject
          instead of { flex: 1 }. On react-native-web, flex: 1 only expands
          a child if its parent has an explicit height; the Modal's portal
          root doesn't always provide one, so flex: 1 could resolve to
          height: 0. The dropdown menu itself (position: absolute) still
          rendered fine in that case, but the Pressable's absoluteFillObject
          — being relative to that same zero-height parent — had no area to
          catch taps, so taps outside the menu silently did nothing and the
          dropdown never closed. absoluteFillObject on the wrapper sizes it
          to the screen directly, independent of parent height, on both web
          and native. */}
      <Modal
        visible={viewPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => { console.log('[ViewPicker] Modal onRequestClose fired'); setViewPickerOpen(false); }}
      >
        {console.log('[ViewPicker] Modal render, visible =', viewPickerOpen)}
        <View
          style={[styles.viewOverlayWrap, { width: SCREEN_W, height: SCREEN_H }]}
          onLayout={(e) => console.log('[ViewPicker] overlay wrapper onLayout:', e.nativeEvent.layout)}
        >
          <Pressable
            style={{ width: SCREEN_W, height: SCREEN_H }}
            onLayout={(e) => console.log('[ViewPicker] Pressable onLayout:', e.nativeEvent.layout)}
            onPressIn={() => console.log('[ViewPicker] Pressable onPressIn (touch registered)')}
            onPress={() => { console.log('[ViewPicker] Pressable onPress -> closing'); setViewPickerOpen(false); }}
          />
          <View
            style={[styles.viewMenu, { top: viewMenuPos.top, right: viewMenuPos.right }]}
            onLayout={(e) => console.log('[ViewPicker] menu card onLayout:', e.nativeEvent.layout)}
          >
            {VIEW_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => { console.log('[ViewPicker] option pressed:', opt.key); selectView(opt.key); }}
                style={[styles.viewMenuOption, opt.key === viewMode && styles.yearOptionActive]}
              >
                <Text style={[styles.yearOptionText, opt.key === viewMode && styles.activeText]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Year dropdown — tap a year to jump straight to it; the existing
          fetchData effect (keyed on `year`) re-fetches automatically. */}
      <Modal
        visible={yearPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setYearPickerOpen(false)}
      >
        <View style={styles.yearModalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setYearPickerOpen(false)}
          />
          <View style={styles.yearModalCard}>
            <Text style={styles.yearModalTitle}>Select Year</Text>
            <ScrollView style={styles.yearModalList}>
              {yearOptions.map((y) => (
                <TouchableOpacity
                  key={y}
                  onPress={() => selectYear(y)}
                  style={[styles.yearOption, y === year && styles.yearOptionActive]}
                >
                  <Text style={[styles.yearOptionText, y === year && styles.activeText]}>
                    {y}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
      >
        {/* Bottom part of the "card": the day rows. Rounded on the bottom only. */}
        <View style={styles.cardBottom}>
          {monthData?.days?.map((dayEntry) => {
            // A date "modified" via the drawer's Tune a Specific Date screen
            // gets its own row color, distinct from the today highlight —
            // either a one-off per-date offset, or a year-round fixed time
            // that happens to cover this date's year.
            const dateOverride = dateTunes[dayEntry.date];
            const yearRoundEntry = yearRoundTimes[dayEntry.date?.slice(0, 4)];
            const isModified = (!!dateOverride && Object.values(dateOverride).some((v) => v))
              || (!!yearRoundEntry && Object.keys(yearRoundEntry).length > 0);
            if (dateOverride) {
              console.log('[MonthPrayer] dayEntry.date:', dayEntry.date, 'matched override:', dateOverride, 'isModified:', isModified);
            }
            // Ramadan offsets apply first (a no-op outside Ramadan — see
            // applyRamadanTuneToTimes), then any year-round fixed time
            // OVERWRITES that key's clock time outright (not an offset —
            // see applyYearRoundTimesToTimes), then any specific-date
            // override adds its offset on top of whatever's left — so a
            // date tuned during Ramadan, or on top of a year-round time,
            // stacks correctly instead of one silently replacing another.
            const ramadanTimes = applyRamadanTuneToTimes(dayEntry.hijri, dayEntry.times);
            const yearRoundApplied = applyYearRoundTimesToTimes(dayEntry.date, ramadanTimes);
            const effectiveTimes = isModified
              ? applyDateTuneToTimes(dayEntry.date, yearRoundApplied)
              : yearRoundApplied;
       

            
           

            return (
              <View
                key={dayEntry.date}
                style={[styles.row, dayEntry.isToday && styles.todayRow]}
              >
                <View style={styles.dateRowCell}>
                  <Text style={[styles.dayNum, dayEntry.isToday && styles.activeText]}>
                    {dayEntry.day}
                  </Text>
                  <Text style={[styles.weekdayShort, dayEntry.isToday && styles.activeText]}>
                    {dayEntry.weekday?.slice(0, 3)}
                  </Text>
                  {isModified && <View style={styles.modifiedDot} />}
                </View>
                {activeColumns.map((col, index) => {
                  const rawCellValue = col.key === 'jummah'
                    ? (dayEntry.weekday === 'Friday' ? effectiveTimes?.jummah : null)
                    : effectiveTimes?.[col.key];
                  // Jama'at charts: same underlying (already-tuned) Azan
                  // time as their Azan counterpart, plus this column's
                  // Jama'at offset on top — PRAYER_COLUMNS keys look up
                  // JAMAAT_OFFSET_KEYS, OTHER_COLUMNS keys look up
                  // OTHER_JAMAAT_OFFSET_KEYS. Columns with no offset key
                  // (Jummah, Sunrise, Ishraq, Chasht) show their Azan time
                  // unchanged on the Jama'at chart too.
                  const isJamaatView = viewMode === 'jamaat' || viewMode === 'otherJamaat';
                  const offsetKey = viewMode === 'otherJamaat'
                    ? OTHER_JAMAAT_OFFSET_KEYS[col.key]
                    : JAMAAT_OFFSET_KEYS[col.key];
                  const cellValue = isJamaatView
                    ? applyJamaatOffset(rawCellValue, tune[offsetKey])
                    : rawCellValue;
                  // Per-column, not per-row: only the prayer the user
                  // actually tuned for this date lights up blue — the rest
                  // of the row keeps its normal (or today-gold) color.
                  const cellModified = isCellModified(dateOverride, yearRoundEntry, col.key);
                  if (dayEntry.date === '2026-08-10' && col.key === 'dhuhr') {
                    console.log('[MonthPrayer] 2026-08-10 dhuhr column — dateOverride:', dateOverride, 'yearRoundEntry:', yearRoundEntry, 'cellModified:', cellModified, 'displayed cellValue:', cellValue);
                  }
                  return (
                    <View
                      key={col.key}
                      style={[styles.dataCell, { flex: columnFlex(col.key), backgroundColor: columnBg(index) }]}
                    >
                      <Text
                        style={[
                          styles.timeText,
                          dayEntry.isToday && styles.activeText,
                          cellModified && styles.modifiedText,
                        ]}
                      >
                        {formatTime(cellValue)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fixedWrap: { paddingHorizontal: 12, paddingTop: 4, alignItems: 'center' },
  content: { paddingHorizontal: 12, paddingBottom: 20, alignItems: 'center' },
  cardTop: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    width: '100%',
  },
  cardBottom: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 8,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthNavRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthName: {
    color: colors.navy,
    fontSize: 17,
    fontWeight: '700',
    marginHorizontal: 10,
  },
  navArrow: { color: colors.gold, fontSize: 22, fontWeight: '700' },
  viewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: `${colors.gold}1A`,
  },
  viewPillText: { color: colors.navy, fontSize: 13, fontWeight: '700' },
  viewOverlayWrap: { position: 'absolute', top: 0, left: 0 },
  viewMenu: {
    position: 'absolute',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 4,
    minWidth: 150,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  viewMenuOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  yearPill: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 10 },
  yearText: { color: colors.navy, fontSize: 17, fontWeight: '700' },
  yearCaret: { color: colors.gold, fontSize: 11, marginLeft: 3, marginTop: 2 },
  yearModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  yearModalCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    width: 220,
    maxHeight: 340,
  },
  yearModalTitle: {
    color: colors.navy,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  yearModalList: { maxHeight: 260 },
  yearOption: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  yearOptionActive: { backgroundColor: `${colors.gold}1A` },
  yearOptionText: { color: colors.navy, fontSize: 15, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border, marginTop: 14, marginBottom: 6 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    overflow: 'hidden',
  },
  headerText: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  todayRow: { backgroundColor: `${colors.gold}1A` },
  // Only the time text recolors for a modified date (not the whole row) —
  // see modifiedText/modifiedDot below.
  modifiedText: { color: colors.modified, fontWeight: '700' },
  modifiedDot: {
    position: 'absolute',
    top: 6,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.modified,
  },
  dateHeaderCell: { width: 34, paddingVertical: 8, justifyContent: 'center' },
  dateRowCell: { width: 34, paddingVertical: 10, justifyContent: 'center', position: 'relative' },
  dayNum: { color: colors.navy, fontSize: 14, fontWeight: '700' },
  weekdayShort: { color: colors.textMuted, fontSize: 10 },
  headerCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  dataCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  timeText: { color: colors.navy, fontSize: 12, fontWeight: '600' },
  activeText: { color: colors.gold, fontWeight: '700' },
});