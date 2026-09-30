import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Pressable, Alert } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { light as colors } from '../theme/colors';
  import { getDateTune, setDateTune, clearDateTune, getAllDateTunes, getAllYearRoundTimes, getYearRoundTime, setYearRoundTime, clearYearRoundTime } from '../tune/dateTuneStore';
  import { getYearRawDays } from '../prayer/yearRawStore';
 import { applyBaseTuneToTimes } from '../prayer/applyTune';
 import { applyRamadanTuneToTimes } from '../tune/ramadanTuneStore';
 import { getTune } from '../tune/tuneStore';
// Same fields/order as the regular "Tune Prayer Timings" screen, minus the
// End-time offsets — those only affect the home-screen window end, which
// isn't part of the month chart this feature is meant to mark up. Sunrise,
// Ishraq and Chasht live in their own OTHER_START box below, same split as
// TuneTimingsScreen's Azan Time / Other Start Time boxes.
const PRAYERS = [
  { key: 'fajr', label: 'Fajr' },
  { key: 'dhuhr', label: 'Zohar' },
  { key: 'jummah', label: 'Jummah', sublabel: 'Fridays only' },
  { key: 'asr', label: 'Asr' },
  { key: 'maghrib', label: 'Maghrib' },
  { key: 'isha', label: 'Ishaa' },
];

// Sunrise, Ishraq and Chasht aren't congregational prayers, so — matching
// TuneTimingsScreen's "Other Start Time" box — they get their own card
// instead of living in the Azan Time one. Tarabih lives here too, same as
// TuneTimingsScreen — it isn't a Fard congregation either.
const OTHER_START = [
  { key: 'sunrise', label: 'Sunrise' },
  { key: 'ishraq', label: 'Ishraq' },
  { key: 'chasht', label: 'Chasht (Duha)' },
  { key: 'tarabih', label: 'Tarabih' },
];

// Same 5 prayers whose window *end* can be tuned as on the regular Tune
// Prayer Timings screen — mirrors END_PRAYERS there.
const END_PRAYERS = [
  { key: 'fajrEnd', label: 'Fajr', sublabel: 'Jama\u2019at time' },
  { key: 'dhuhrEnd', label: 'Zohar', sublabel: 'Jama\u2019at time' },
  { key: 'asrEnd', label: 'Asr', sublabel: 'Jama\u2019at time' },
  { key: 'maghribEnd', label: 'Maghrib', sublabel: 'Jama\u2019at time' },
  { key: 'ishaEnd', label: 'Ishaa', sublabel: 'Jama\u2019at time' },
];

// Maps every "*End" key back to the base prayer whose start time it's
// measured from (fajrEnd is minutes after fajr starts, etc.) — used to
// work out what absolute clock time an End row's baseline is before any
// date-specific override.
const END_START_KEY = {
  fajrEnd: 'fajr', dhuhrEnd: 'dhuhr', asrEnd: 'asr', maghribEnd: 'maghrib', ishaEnd: 'isha',
};

// Tarabih has no field of its own in baseTimes — same convention as
// MonthPrayerScreen.js/prayerPayload.js: it's Isha + tune.tarabih (default
// 15), computed on the fly rather than returned by the server. Falls back
// to this default only if tune.tarabih is missing entirely.
const TARABIH_DEFAULT_MINUTES = 15;

const ZERO_TUNE = {
  fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0, jummah: 0, ishraq: 0, chasht: 0, tarabih: 0,
  fajrEnd: 0, dhuhrEnd: 0, asrEnd: 0, maghribEnd: 0, ishaEnd: 0,
};

const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const ITEM_HEIGHT = 40;
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => i); // 0..59

// Builds a plain 'YYYY-MM-DD' string from the Date's LOCAL calendar fields.
// Deliberately NOT date.toISOString().split('T')[0] — toISOString() first
// converts to UTC, and calendar-picked dates are constructed at local
// midnight (see calendarCells below). In any positive-UTC-offset timezone
// (e.g. IST, UTC+5:30) local midnight is still the *previous* day in UTC,
// so toISOString() silently returned the wrong date — a date picked from
// the calendar modal would get its tune saved one day earlier than the row
// the user actually sees in the month chart, so it never showed a change.
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Built manually (not toLocaleTimeString) for the same reason as
// MonthPrayerScreen's formatTime — avoids ICU's narrow no-break space
// before am/pm on some devices.
function formatClockTime(date) {
  if (!date) return '--:--';
  const d = new Date(date);
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes}${ampm}`;
}

function ClockIcon({ size = 16, color = colors.gold }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={2} />
      <Line x1="12" y1="12" x2="12" y2="7" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1="12" y1="12" x2="15.3" y2="13.6" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// A single prayer row: a checkbox on the far left ("make this every day's
// time, not just this date"), the label, and a clock-face icon + the
// currently-effective time on the right. Tapping the label/clock area opens
// the hour/minute picker for that prayer; tapping the checkbox toggles
// year-round mode without opening the picker.
function ClockRow({ label, sublabel, time, hasOverride, onPress, yearRound, onToggleYearRound }) {
  return (
    <View style={styles.rowOuter}>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={onToggleYearRound}
          hitSlop={6}
          style={styles.checkboxTapArea}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, yearRound && styles.checkboxChecked]}>
            {yearRound ? <Text style={styles.checkboxTick}>✓</Text> : null}
          </View>
          {/* Always-visible label, not just an icon — the checkbox alone
              doesn't explain what checking it does. */}
          <Text style={[styles.checkboxLabel, yearRound && styles.checkboxLabelActive]}>
            Every{'\n'}day
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.rowMain} onPress={onPress} activeOpacity={0.7}>
          <View style={styles.rowLabelWrap}>
            <Text style={styles.rowLabel}>{label}</Text>
            {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
          </View>
          <View style={[styles.clockValueWrap, hasOverride && styles.clockValueWrapModified]}>
            <ClockIcon size={15} color={hasOverride ? colors.modified : colors.gold} />
            <Text style={[styles.clockValueText, hasOverride && styles.clockValueTextModified]}>
              {formatClockTime(time)}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Only shows while ticked — spells out the consequence right where
          the user just took the action, instead of relying on them having
          read a hint elsewhere on the screen. */}
      {yearRound && (
        <View style={styles.yearRoundWarning}>
          <Text style={styles.yearRoundWarningText}>
            ⚠ This will set the {label} time for every date in {new Date().getFullYear()}, not just the one you're viewing.
          </Text>
        </View>
      )}
    </View>
  );
}

// Popup for picking an exact hour/minute/AM-PM for whichever prayer row was
// tapped. Built from plain scrollable lists (no extra native picker
// dependency) so tapping OR scrolling-then-tapping both work.
function TimePickerModal({ visible, label, initialDate, onCancel, onConfirm }) {
  const [hour12, setHour12] = useState(12);
  const [minute, setMinute] = useState(0);
  const [period, setPeriod] = useState('AM');
  const hourScrollRef = useRef(null);
  const minuteScrollRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    const d = initialDate ? new Date(initialDate) : new Date();
    let h = d.getHours();
    const per = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    const m = d.getMinutes();
    setHour12(h);
    setMinute(m);
    setPeriod(per);
    const id = setTimeout(() => {
      hourScrollRef.current?.scrollTo({ y: (h - 1) * ITEM_HEIGHT, animated: false });
      minuteScrollRef.current?.scrollTo({ y: m * ITEM_HEIGHT, animated: false });
    }, 0);
    return () => clearTimeout(id);
  }, [visible, initialDate]);

  const handleConfirm = () => {
    let hour24 = hour12 % 12;
    if (period === 'PM') hour24 += 12;
    const base = initialDate ? new Date(initialDate) : new Date();
    const result = new Date(base);
    result.setHours(hour24, minute, 0, 0);
    onConfirm(result);
  };

  // Scrolling (fling or slow drag-release) should select the item that
  // ends up centered, same as tapping a digit does — previously only the
  // onPress handlers below ever called setHour12/setMinute, so scrolling
  // to the end of the list and letting go didn't actually change the
  // selected value until a digit was tapped. snapToInterval means the
  // list always settles exactly on an item boundary, so the offset maps
  // straight to an index with a simple round — no fuzzy matching needed.
  // Both onScrollEndDrag (a slow release with no fling) and
  // onMomentumScrollEnd (a fling, or the native snap settling) are wired
  // to this so either way of ending a scroll selects the centered item.
  const handleHourScrollEnd = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.max(0, Math.min(HOURS_12.length - 1, Math.round(y / ITEM_HEIGHT)));
    setHour12(HOURS_12[index]);
  };

  const handleMinuteScrollEnd = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.max(0, Math.min(MINUTES_60.length - 1, Math.round(y / ITEM_HEIGHT)));
    setMinute(MINUTES_60[index]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.calModalOverlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onCancel} />
        <View style={styles.timeCard}>
          <Text style={styles.timeCardTitle}>{label}</Text>

          <View style={styles.timeColumnsRow}>
            <ScrollView
              ref={hourScrollRef}
              style={styles.timeColumn}
              showsVerticalScrollIndicator={false}
              snapToInterval={ITEM_HEIGHT}
              decelerationRate="fast"
              onScrollEndDrag={handleHourScrollEnd}
              onMomentumScrollEnd={handleHourScrollEnd}
            >
              <View style={{ height: ITEM_HEIGHT }} />
              {HOURS_12.map((h) => (
                <TouchableOpacity
                  key={h}
                  style={styles.timeItem}
                  onPress={() => {
                    setHour12(h);
                    hourScrollRef.current?.scrollTo({ y: (h - 1) * ITEM_HEIGHT, animated: true });
                  }}
                >
                  <Text style={[styles.timeItemText, h === hour12 && styles.timeItemTextActive]}>
                    {String(h).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              ))}
              <View style={{ height: ITEM_HEIGHT }} />
            </ScrollView>

            <Text style={styles.timeColon}>:</Text>

            <ScrollView
              ref={minuteScrollRef}
              style={styles.timeColumn}
              showsVerticalScrollIndicator={false}
              snapToInterval={ITEM_HEIGHT}
              decelerationRate="fast"
              onScrollEndDrag={handleMinuteScrollEnd}
              onMomentumScrollEnd={handleMinuteScrollEnd}
            >
              <View style={{ height: ITEM_HEIGHT }} />
              {MINUTES_60.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={styles.timeItem}
                  onPress={() => {
                    setMinute(m);
                    minuteScrollRef.current?.scrollTo({ y: m * ITEM_HEIGHT, animated: true });
                  }}
                >
                  <Text style={[styles.timeItemText, m === minute && styles.timeItemTextActive]}>
                    {String(m).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              ))}
              <View style={{ height: ITEM_HEIGHT }} />
            </ScrollView>

            <View style={styles.periodColumn}>
              {['AM', 'PM'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.periodButton, period === p && styles.periodButtonActive]}
                  onPress={() => setPeriod(p)}
                >
                  <Text style={[styles.periodButtonText, period === p && styles.periodButtonTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.timeActionsRow}>
            <TouchableOpacity onPress={onCancel} style={styles.timeCancelButton}>
              <Text style={styles.timeCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleConfirm} style={styles.timeConfirmButton}>
              <Text style={styles.timeConfirmText}>Set Time</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function DateTuneScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const today = useMemo(() => new Date(), []);
  // Snapshot of the user's regular (every-day) tune — only needed to work
  // out the baseline clock time for the End/Jama'at rows (see
  // getBaseTimeForKey). Doesn't need to be reactive for this screen.
  const regularTune = useMemo(() => getTune(), []);

  // Which prayer keys already have a persisted year-round fixed time for
  // `year` — used both to pre-tick the "Every day" checkbox on load and,
  // in commitSave, to know which checkboxes got UNticked (so their
  // year-round entry can be cleared).
  const getYearRoundKeysForYear = (year) => new Set(Object.keys(getAllYearRoundTimes()[year] || {}));

  const [selectedDate, setSelectedDate] = useState(today);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth()); // 0-11

  const selectedDateStr = toDateStr(selectedDate);
  const [values, setValues] = useState(() => ({ ...ZERO_TUNE, ...(getDateTune(selectedDateStr) || {}) }));
  // Re-read whenever the modified-dates map changes elsewhere, just for the
  // calendar's dot markers — cheap since it's only object identities.
  const [dateTunesVersion, setDateTunesVersion] = useState(getAllDateTunes());

  // The actual computed prayer times for whichever date is selected — the
  // baseline every clock row/time-picker measures its offset from. Reset
  // and re-fetched every time selectedDate changes.
  const [baseTimes, setBaseTimes] = useState(null);
  // Which prayer's time picker is currently open (a PRAYERS/END_PRAYERS
  // key), or null when the popup is closed.
  const [timePickerFor, setTimePickerFor] = useState(null);
  // Prayer keys whose checkbox is ticked on this screen right now — "make
  // whatever time I set here the standard time every day", not just for
  // `selectedDate`. Reloaded whenever the selected date changes (see
  // loadValuesFor) so it reflects that date's year's actual saved state,
  // not whatever was ticked for a previously-viewed date.
  const [yearRoundKeys, setYearRoundKeys] = useState(() => getYearRoundKeysForYear(today.getFullYear()));
  // Snapshot of yearRoundKeys exactly as loaded for the current date — lets
  // commitSave tell "was year-round, still is" apart from "was year-round,
  // just got unticked" (the latter needs its year-round entry cleared).
  const loadedYearRoundKeysRef = useRef(yearRoundKeys);
  // A prayer the user has picked a new time for THIS SESSION, on THIS
  // date, that hasn't been saved yet — Date objects, keyed by prayer key.
  // Takes priority over everything else in getEffectiveTimeForKey so the
  // row/popup immediately reflects what was just picked, rather than
  // falling back to a stale persisted year-round time until Save. Cleared
  // whenever the selected date changes.
  const [pendingAbsolute, setPendingAbsolute] = useState({});

  const hasOverride = Object.values(values).some((v) => v) || yearRoundKeys.size > 0;
  useEffect(() => {
    let cancelled = false;
    setBaseTimes(null);
    // Same offline-safe source MonthPrayerScreen already relies on:
    // getYearRawDays resolves from memory/AsyncStorage on anything but a
    // genuine cache miss, so this keeps working even on the ESP32 hotspot
    // (no internet) as long as this year's data was fetched at least once
    // before connecting — unlike the old getTodayPrayerTimes() call, which
    // was a live network request every time and silently never resolved
    // while on the hotspot, leaving this screen stuck on "Loading…"
    // forever. Raw -> local regular-tune -> local Ramadan-tune, exactly
    // the same order MonthPrayerScreen's fetchData already applies (regular
    // tune used to be applied server-side by the old endpoint instead, but
    // the effect on baseTimes is the same).
    getYearRawDays(selectedDate.getFullYear())
      .then((yearDays) => {
        if (cancelled) return;
        const dayRaw = yearDays.find((d) => d.date === selectedDateStr);
        if (!dayRaw) {
          console.warn('No cached raw prayer times found for', selectedDateStr);
          return;
        }
        const tunedTimes = applyBaseTuneToTimes(dayRaw.times, regularTune);
        setBaseTimes(applyRamadanTuneToTimes(dayRaw.hijri, tunedTimes) || {});
      })
      .catch((err) => {
        if (!cancelled) console.warn('Failed to load cached prayer times for date', err.message);
      });
    return () => { cancelled = true; };
  }, [selectedDateStr, selectedDate, regularTune]);

  // The clock time for `key` before any date-specific override — the azan
  // time itself for a normal row, (start time + the regular Jama'at
  // offset) for an End row, or (Isha + tune.tarabih) for Tarabih, which —
  // like the End rows — isn't a field baseTimes returns on its own.
  const getBaseTimeForKey = (key) => {
    if (!baseTimes) return null;
    if (key === 'tarabih') {
      const isha = baseTimes.isha;
      if (!isha) return null;
      const offset = regularTune?.tarabih ?? TARABIH_DEFAULT_MINUTES;
      return new Date(new Date(isha).getTime() + offset * 60000);
    }
    const startKey = END_START_KEY[key];
    if (startKey) {
      const start = baseTimes[startKey];
      if (!start) return null;
      const endOffset = regularTune?.[key] || 0;
      return new Date(new Date(start).getTime() + endOffset * 60000);
    }
    return baseTimes[key] ? new Date(baseTimes[key]) : null;
  };

  // What the clock row should actually display, in priority order:
  //  1. A time picked THIS SESSION for this date, not yet saved.
  //  2. A persisted year-round fixed time for this key/year, if one
  //     exists — the exact hour:minute, every date, no server math.
  //  3. The old per-date behaviour: baseline + whatever offset is saved
  //     for this one date.
  const getEffectiveTimeForKey = (key) => {
    if (pendingAbsolute[key]) return pendingAbsolute[key];
    const fixed = getYearRoundTime(selectedDate.getFullYear(), key);
    if (fixed) {
      const d = new Date(selectedDate);
      d.setHours(fixed.hour, fixed.minute, 0, 0);
      return d;
    }
    const base = getBaseTimeForKey(key);
    if (!base) return null;
    return new Date(base.getTime() + (values[key] || 0) * 60000);
  };

  const loadValuesFor = (date) => {
    const key = toDateStr(date);
    setValues({ ...ZERO_TUNE, ...(getDateTune(key) || {}) });
    // A fresh date means a fresh read of that date's year's actual
    // year-round state — not whatever was ticked for a previously-viewed
    // date, and not a blank slate either (so an already-year-round prayer
    // shows correctly ticked and Save doesn't silently clear it).
    const yr = getYearRoundKeysForYear(date.getFullYear());
    setYearRoundKeys(yr);
    loadedYearRoundKeysRef.current = yr;
    setPendingAbsolute({});
  };

  const selectDate = (date) => {
    setSelectedDate(date);
    loadValuesFor(date);
    setCalendarOpen(false);
  };

  const goToDay = (offset) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + offset);
    selectDate(next);
  };

  const updatePrayer = (key, next) => {
    setValues((prev) => ({ ...prev, [key]: next }));
  };

  const toggleYearRound = (key) => {
    setYearRoundKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Human-readable name for a prayer key, for use in the confirmation
  // dialog — reuses the same labels shown on the rows themselves.
  const labelForKey = (key) => [...PRAYERS, ...OTHER_START, ...END_PRAYERS].find((p) => p.key === key)?.label || key;

  const commitSave = () => {
    const dateOverrides = { ...values };
    const year = selectedDate.getFullYear();

    // Every ticked key gets its CURRENTLY DISPLAYED clock time (whatever
    // getEffectiveTimeForKey resolves to right now — a fresh pick, an
    // existing year-round time, or a per-date offset) written as an exact
    // hour:minute for every date in `year`. No offset math at all, so the
    // resulting time can't drift day to day the way the old
    // offset-on-top-of-the-server's-own-drifting-time approach did.
    yearRoundKeys.forEach((key) => {
      const eff = getEffectiveTimeForKey(key);
      if (eff) {
        setYearRoundTime(year, key, eff.getHours(), eff.getMinutes());
      }
      // The year-round entry now covers this key entirely, so it
      // shouldn't ALSO carry a per-date offset for selectedDate — that'd
      // double up (or, worse, mask the fixed time on the one date this
      // screen happens to be showing).
      dateOverrides[key] = 0;
    });

    // Keys that WERE year-round when this date loaded, but got unticked
    // this session, fall back to normal times again — remove their
    // year-round entry entirely rather than leaving a stale one behind.
    loadedYearRoundKeysRef.current.forEach((key) => {
      if (!yearRoundKeys.has(key)) {
        clearYearRoundTime(year, key);
      }
    });

    // dateTuneStore (per-date offsets) and the year-round store are
    // completely separate now, so there's no overwrite-ordering hazard
    // between these two calls — either order is safe.
    setDateTune(selectedDateStr, dateOverrides);
    setDateTunesVersion(getAllDateTunes());
    navigation.goBack();
  };

  const handleSave = () => {
    // If nothing's ticked, this is a plain one-date save — no need to
    // interrupt with a confirmation.
    if (yearRoundKeys.size === 0) {
      commitSave();
      return;
    }
    // Ticked prayers apply to every date of the year, not just this one —
    // that's a much bigger action than the rest of this screen, so it gets
    // an explicit, spelled-out confirmation before it happens rather than
    // relying on the checkbox/warning text having been read.
    const names = [...yearRoundKeys].map(labelForKey).join(', ');
    const year = selectedDate.getFullYear();
    Alert.alert(
      'Change time for the whole year?',
      `${names} will be set to this exact time on every date in ${year}, not just ${selectedDateLabel}. This will show as a modified date on the month chart for all of them.\n\nContinue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, apply to every day', style: 'destructive', onPress: commitSave },
      ],
    );
  };

  const handleClearOverride = () => {
    clearDateTune(selectedDateStr);
    setValues({ ...ZERO_TUNE });
    setDateTunesVersion(getAllDateTunes());
  };

  const openCalendar = () => {
    setCalYear(selectedDate.getFullYear());
    setCalMonth(selectedDate.getMonth());
    setCalendarOpen(true);
  };

  const goToCalMonth = (offset) => {
    let m = calMonth + offset;
    let y = calYear;
    if (m > 11) { m = 0; y += 1; }
    else if (m < 0) { m = 11; y -= 1; }
    setCalMonth(m);
    setCalYear(y);
  };

  const calendarCells = useMemo(() => {
    const firstOfMonth = new Date(calYear, calMonth, 1);
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const leadingBlanks = firstOfMonth.getDay(); // 0 = Sunday
    const cells = [];
    for (let i = 0; i < leadingBlanks; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(calYear, calMonth, d));
    return cells;
  }, [calYear, calMonth]);

  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('en-GB', { month: 'long' });
  const selectedDateLabel = selectedDate.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  });

  // Everything the time-picker popup needs about whichever row is open.
  const activePrayer = timePickerFor
    ? [...PRAYERS, ...OTHER_START, ...END_PRAYERS].find((p) => p.key === timePickerFor)
    : null;

  const closeTimePicker = () => setTimePickerFor(null);

  const confirmTime = (date) => {
    const key = timePickerFor;
    if (!key) return;
    // Takes top priority in getEffectiveTimeForKey — makes sure the row
    // immediately reflects this exact pick instead of falling back to a
    // stale persisted year-round time until the user hits Save.
    setPendingAbsolute((prev) => ({ ...prev, [key]: date }));
    // Still computed for the per-date (non-year-round) fallback path: if
    // this key's checkbox isn't ticked, commitSave saves `values[key]` as
    // a normal per-date minute offset, same as before.
    const base = getBaseTimeForKey(key);
    if (base) {
      const diffMinutes = Math.round((date.getTime() - base.getTime()) / 60000);
      updatePrayer(key, diffMinutes);
    }
    closeTimePicker();
  };

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tune a Date</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          Tap a prayer's clock to set its exact time for this date only, on top of your regular Tune Prayer
          Timings offsets. A date you've tuned here shows up in a different color on the month chart.
        </Text>

        {/* Date selector card */}
        <View style={styles.dateCard}>
          <TouchableOpacity onPress={() => goToDay(-1)} hitSlop={10}>
            <Text style={styles.dateNavArrow}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openCalendar} style={styles.dateLabelWrap} hitSlop={6}>
            <Text style={styles.dateLabel}>{selectedDateLabel}</Text>
            <Text style={styles.datePickHint}>📅 Tap to pick another date</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => goToDay(1)} hitSlop={10}>
            <Text style={styles.dateNavArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {hasOverride && (
          <View style={styles.modifiedBanner}>
            <View style={styles.modifiedDot} />
            <Text style={styles.modifiedBannerText}>
              This date has a custom tune and will be highlighted on the month chart.
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Azan Time</Text>
        <Text style={styles.checkboxHint}>
          Tick a prayer to set the time you choose for every date in the year, instead of just this date.
        </Text>
        <View style={styles.card}>
          {PRAYERS.map(({ key, label, sublabel }) => (
            <ClockRow
              key={key}
              label={label}
              sublabel={sublabel}
              time={getEffectiveTimeForKey(key)}
              hasOverride={!!values[key] || yearRoundKeys.has(key)}
              // Guard against opening the picker before baseTimes for the
              // newly-selected date has finished loading — otherwise
              // confirmTime() has no baseline to diff against and silently
              // drops the edit (see getBaseTimeForKey/confirmTime).
              onPress={() => { if (baseTimes) setTimePickerFor(key); }}
              yearRound={yearRoundKeys.has(key)}
              onToggleYearRound={() => toggleYearRound(key)}
            />
          ))}
        </View>

        <Text style={styles.sectionTitle}>Jama'at Time</Text>
        <View style={styles.card}>
          {END_PRAYERS.map(({ key, label, sublabel }) => (
            <ClockRow
              key={key}
              label={label}
              sublabel={sublabel}
              time={getEffectiveTimeForKey(key)}
              hasOverride={!!values[key] || yearRoundKeys.has(key)}
              onPress={() => { if (baseTimes) setTimePickerFor(key); }}
              yearRound={yearRoundKeys.has(key)}
              onToggleYearRound={() => toggleYearRound(key)}
            />
          ))}
        </View>

        <Text style={styles.sectionTitle}>Other Start Time</Text>
        <View style={styles.card}>
          {OTHER_START.map(({ key, label, sublabel }) => (
            <ClockRow
              key={key}
              label={label}
              sublabel={sublabel}
              time={getEffectiveTimeForKey(key)}
              hasOverride={!!values[key] || yearRoundKeys.has(key)}
              onPress={() => { if (baseTimes) setTimePickerFor(key); }}
              yearRound={yearRoundKeys.has(key)}
              onToggleYearRound={() => toggleYearRound(key)}
            />
          ))}
        </View>
        {!baseTimes && (
          <Text style={styles.subtitle}>Loading prayer times for this date…</Text>
        )}

        <TouchableOpacity onPress={handleClearOverride} style={styles.resetButton}>
          <Text style={styles.resetButtonText}>Clear override for this date</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>Save for this date</Text>
        </TouchableOpacity>
      </View>

      {/* Calendar modal for jumping straight to any date */}
      <Modal visible={calendarOpen} transparent animationType="fade" onRequestClose={() => setCalendarOpen(false)}>
        <View style={styles.calModalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setCalendarOpen(false)} />
          <View style={styles.calCard}>
            <View style={styles.calHeaderRow}>
              <TouchableOpacity onPress={() => goToCalMonth(-1)} hitSlop={10}>
                <Text style={styles.dateNavArrow}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.calHeaderText}>{monthLabel} {calYear}</Text>
              <TouchableOpacity onPress={() => goToCalMonth(1)} hitSlop={10}>
                <Text style={styles.dateNavArrow}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.calWeekdayRow}>
              {WEEKDAY_HEADERS.map((w, i) => (
                <Text key={`${w}-${i}`} style={styles.calWeekdayText}>{w}</Text>
              ))}
            </View>

            <View style={styles.calGrid}>
              {calendarCells.map((date, idx) => {
                if (!date) return <View key={`blank-${idx}`} style={styles.calCell} />;
                const dateStr = toDateStr(date);
                const modified = !!dateTunesVersion[dateStr] && Object.values(dateTunesVersion[dateStr]).some((v) => v);
                const selected = isSameDay(date, selectedDate);
                const isToday = isSameDay(date, today);
                return (
                  <TouchableOpacity
                    key={dateStr}
                    style={[styles.calCell, selected && styles.calCellSelected]}
                    onPress={() => selectDate(date)}
                  >
                    <Text
                      style={[
                        styles.calCellText,
                        isToday && !selected && styles.calCellTextToday,
                        selected && styles.calCellTextSelected,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                    {modified && !selected && <View style={styles.calCellDot} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* Hour/minute popup for whichever prayer's clock was tapped */}
      <TimePickerModal
        visible={!!timePickerFor}
        label={activePrayer ? `${activePrayer.label} time` : ''}
        initialDate={timePickerFor ? getEffectiveTimeForKey(timePickerFor) || new Date() : null}
        onCancel={closeTimePicker}
        onConfirm={confirmTime}
      />
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
  content: { paddingHorizontal: 20, paddingBottom: 20 },
  subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  sectionTitle: { color: colors.navy, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  dateNavArrow: { color: colors.gold, fontSize: 24, fontWeight: '700', paddingHorizontal: 6 },
  dateLabelWrap: { alignItems: 'center', flex: 1 },
  dateLabel: { color: colors.navy, fontSize: 16, fontWeight: '700' },
  datePickHint: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  modifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.modifiedBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.modified,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  modifiedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.modified, marginRight: 10 },
  modifiedBannerText: { color: colors.modified, fontSize: 12, lineHeight: 17, flex: 1 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    marginBottom: 20,
  },
  rowOuter: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkboxTapArea: {
    alignItems: 'center',
    marginRight: 12,
    width: 40,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.gold, borderColor: colors.gold },
  checkboxTick: { color: colors.white, fontSize: 12, fontWeight: '800' },
  checkboxLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 11,
  },
  checkboxLabelActive: { color: colors.gold, fontWeight: '800' },
  checkboxHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginBottom: 8 },
  yearRoundWarning: {
    backgroundColor: colors.modifiedBg,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
    marginLeft: 52,
  },
  yearRoundWarningText: { color: colors.modified, fontSize: 11, lineHeight: 15 },
  rowLabelWrap: { flexShrink: 1, paddingRight: 8 },
  rowLabel: { color: colors.navy, fontSize: 15, fontWeight: '600' },
  rowSublabel: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  // Tappable clock-time pill on the right of each row — the entry point
  // into the hour/minute popup.
  clockValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  clockValueWrapModified: { backgroundColor: colors.modifiedBg },
  clockValueText: { color: colors.navy, fontSize: 14, fontWeight: '700' },
  clockValueTextModified: { color: colors.modified },
  resetButton: { alignSelf: 'center', marginTop: 20, paddingVertical: 8, paddingHorizontal: 12 },
  resetButtonText: { color: colors.gold, fontSize: 14, fontWeight: '600' },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  saveButton: { backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveButtonText: { color: colors.white, fontSize: 16, fontWeight: '700' },

  // horizontal padding here (instead of a fixed card width alone) is what
  // keeps the modal off the screen edges on narrow phones — a fixed
  // width: 320 card had no margin of its own, so on any phone narrower
  // than ~320 + padding it touched or ran past the edges.
  calModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  calCard: { backgroundColor: colors.card, borderRadius: 16, padding: 16, width: '100%', maxWidth: 320 },
  calHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  calHeaderText: { color: colors.navy, fontSize: 15, fontWeight: '700' },
  calWeekdayRow: { flexDirection: 'row', marginBottom: 4 },
  calWeekdayText: { width: `${100 / 7}%`, textAlign: 'center', color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calCellSelected: { backgroundColor: colors.gold, borderRadius: 999 },
  calCellText: { color: colors.navy, fontSize: 13, fontWeight: '600' },
  calCellTextToday: { color: colors.gold, fontWeight: '800' },
  calCellTextSelected: { color: colors.white, fontWeight: '800' },
  calCellDot: {
    position: 'absolute',
    bottom: 4,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.modified,
  },

  // Hour/minute time-picker popup
  timeCard: { backgroundColor: colors.card, borderRadius: 16, padding: 18, width: '100%', maxWidth: 300 },
  timeCardTitle: { color: colors.navy, fontSize: 15, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  timeColumnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: ITEM_HEIGHT * 3,
  },
  timeColumn: { width: 56, height: ITEM_HEIGHT * 3 },
  timeItem: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  timeItemText: { color: colors.textMuted, fontSize: 17, fontWeight: '600' },
  timeItemTextActive: { color: colors.navy, fontSize: 20, fontWeight: '800' },
  timeColon: { color: colors.navy, fontSize: 20, fontWeight: '800', marginHorizontal: 2 },
  periodColumn: { marginLeft: 14, gap: 8 },
  periodButton: {
    width: 44,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodButtonActive: { backgroundColor: colors.gold },
  periodButtonText: { color: colors.navy, fontSize: 13, fontWeight: '700' },
  periodButtonTextActive: { color: colors.white },
  timeActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 10,
  },
  timeCancelButton: { paddingVertical: 10, paddingHorizontal: 14 },
  timeCancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  timeConfirmButton: { backgroundColor: colors.gold, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  timeConfirmText: { color: colors.white, fontSize: 14, fontWeight: '700' },
});