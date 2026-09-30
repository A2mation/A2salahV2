import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, RefreshControl, ScrollView, TouchableOpacity } from 'react-native';
import { light as colors } from '../theme/colors';
import { loadReminders, subscribeReminders, setEnabledForPrayer } from '../notifications/remindersStore';
import {
  loadMutedPrayers,
  setPrayerMuted,
  subscribeMutedPrayers,
} from '../notifications/mutedPrayersStore';
import { subscribeCoords } from '../location/locationStore';
import { getTune, subscribeTune } from '../tune/tuneStore';
import { applyRamadanTuneToTimes, subscribeRamadanTune } from '../tune/ramadanTuneStore';
import {
  applyDateTuneToTimes,
  applyYearRoundTimesToTimes,
  subscribeDateTunes,
  subscribeYearRoundTimes,
} from '../tune/dateTuneStore';
import { getPrayerData, subscribePrayerData, setPrayerData } from '../prayer/prayerTimesStore';
import { getYearRawDays } from '../prayer/yearRawStore';
import { applyBaseTuneToTimes } from '../prayer/applyTune';

const PRAYER_LABELS = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  dhuhr: 'Zohar',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Ishaa',
};

function formatTime(isoOrDate) {
  if (!isoOrDate) return '--:--';
  const d = new Date(isoOrDate);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase();
}

function formatCountdown(targetIso) {
  if (!targetIso) return null;
  const diffMs = new Date(targetIso).getTime() - Date.now();
  if (diffMs <= 0) return '00:00:00';
  const totalSec = Math.floor(diffMs / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h} : ${m} : ${s}`;
}

// Builds a plain 'YYYY-MM-DD' string from the Date's LOCAL calendar fields —
// same convention (and same reasoning) as toDateStr in DateTuneScreen.js /
// ClockScreen.js. Deliberately NOT date.toISOString().split('T')[0]: that
// converts to UTC first, which in any positive-UTC-offset timezone can
// silently roll local midnight back to the previous day, mismatching the
// `date` keys returned by the backend for the raw days array.
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(a, b) {
  return toDateStr(a) === toDateStr(b);
}

// Mirrors backend/utils/prayerTimes.js's getNextPrayer() exactly, so that
// once we're tuning raw days client-side (see fetchData below) we can work
// out "next prayer" locally instead of relying on a `next` field the
// backend no longer computes for us. Keep this in sync with that function
// if its logic ever changes.
function getNextPrayer(times, now) {
  const order = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  for (const name of order) {
    if (times?.[name] && new Date(times[name]) > now) {
      return { name, time: times[name] };
    }
  }
  return { name: 'fajr', time: null };
}

const todayStr = toDateStr(new Date());

// Pure content for the "list" tab — the header (hamburger/city) and bottom nav
// now live in HomeScreen.js so both tabs can share them.
export default function PrayerListScreen() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  // Seed from Splash's prefetch cache when the initial view is today — lets
  // this tab skip its own loading spinner on first paint. Any other date
  // (via goToDay) always fetches fresh, same as before.
  const cachedToday = toDateStr(new Date()) === todayStr ? getPrayerData() : null;
  const [data, setData] = useState(cachedToday);
  const [loading, setLoading] = useState(!cachedToday);
  const [refreshing, setRefreshing] = useState(false);
  // Reminders (from the Reminders screen) — still fetched and toggled in
  // step with the mute, so a prayer's custom reminders (if any exist) stay
  // consistent with its speaker icon instead of silently disagreeing with
  // it. The icon's own on/off state, though, is driven by mutedPrayers
  // below, which works even when zero reminders exist for that prayer.
  const [reminders, setReminders] = useState([]);
  const [mutedPrayers, setMutedPrayersState] = useState(new Set());
  const [mutingKey, setMutingKey] = useState(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    loadMutedPrayers().then(setMutedPrayersState);
    const unsubscribe = subscribeMutedPrayers(setMutedPrayersState);
    return unsubscribe;
  }, []);

  const fetchReminders = useCallback(async () => {
    setReminders(await loadReminders());
  }, []);

  useEffect(() => subscribeReminders(setReminders), []);

  // Pulls the WHOLE YEAR's raw (untuned) days for `date`'s year from
  // yearRawStore — which only actually calls the API on a genuine cache
  // miss (new year, new location) — then finds that day's entry and
  // applies the user's current per-namaz tune offsets locally via
  // applyBaseTuneToTimes, same pattern ClockScreen/MonthPrayerScreen use.
  // "Next prayer" is only attached when `date` is actually today (mirrors
  // the backend's own isSameDay gate — a countdown only makes sense
  // relative to right now, not to some other day being viewed). Net
  // effect: tuning offsets, navigating between already-cached days, or
  // reopening the app costs zero extra API calls — only a new year or a
  // real location change does.
  const fetchData = useCallback(async (date) => {
    try {
      const yearDays = await getYearRawDays(date.getFullYear());
      const dateStr = toDateStr(date);
      const rawDay = yearDays.find((d) => d.date === dateStr);
      if (!rawDay) {
        setData(null);
        return;
      }
      const tunedTimes = applyBaseTuneToTimes(rawDay.times, getTune());
      const now = new Date();
      const built = {
        date: rawDay.date,
        weekday: rawDay.weekday,
        hijri: rawDay.hijri,
        times: tunedTimes,
        next: isSameDay(date, now) ? getNextPrayer(tunedTimes, now) : null,
      };
      setData(built);
      // Only push into the shared prefetch cache when viewing today — this
      // screen can be showing some other navigated-to date, and that must
      // never overwrite what ClockScreen/Splash's "today" cache holds.
      if (isSameDay(date, now)) {
        setPrayerData(built);
      }
    } catch (err) {
      console.warn('Failed to fetch prayer times', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Pick up the prefetched cache if Splash's fetch resolves after this
  // component has already mounted, as long as we're still looking at today.
  useEffect(() => {
    const unsubscribe = subscribePrayerData((cached) => {
      if (toDateStr(selectedDate) === todayStr) {
        setData(cached);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [selectedDate]);

  useEffect(() => {
    // Skip the redundant initial fetch for today if Splash already handed
    // us cached data — avoids hammering a just-woken Render instance with
    // a second identical request.
    if (toDateStr(selectedDate) === todayStr && getPrayerData()) return;
    setLoading(true);
    fetchData(selectedDate);
  }, [selectedDate, fetchData]);

  // Re-fetch (for whatever date is currently selected) whenever the
  // device's GPS coordinates change, so the list stays in sync with the
  // current location instead of showing stale times from before a fix
  // arrived or from a previous location.
  useEffect(() => {
    const unsubscribe = subscribeCoords(() => { fetchData(selectedDate); });
    return unsubscribe;
  }, [selectedDate, fetchData]);

  // Re-run (for whatever date is currently selected) whenever the user
  // saves new per-namaz tune offsets from the "Tune Prayer Timings" screen.
  // This no longer hits the network — fetchData re-tunes the already-cached
  // raw year data locally (see prayer/applyTune.js) — it just needs to
  // re-run so the recalculated times/next-prayer make it into `data`.
  useEffect(() => {
    const unsubscribe = subscribeTune(() => { fetchData(selectedDate); });
    return unsubscribe;
  }, [selectedDate, fetchData]);

  useEffect(() => {
    const interval = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Ramadan offsets, date-specific overrides, and year-round fixed times all
  // apply client-side at render time on top of the already-fetched `times`
  // (see the ramadanTimes/yearRoundApplied/times chain below), rather than
  // triggering a re-fetch — same pattern as ClockScreen/MonthPrayerScreen —
  // so a saved change to any of the three shows up immediately via a
  // re-render.
  useEffect(() => {
    const unsubscribe = subscribeRamadanTune(() => forceTick((t) => t + 1));
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeDateTunes(() => forceTick((t) => t + 1));
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeYearRoundTimes(() => forceTick((t) => t + 1));
    return unsubscribe;
  }, []);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchReminders();
    fetchData(selectedDate);
  };

  const goToDay = (offset) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + offset);
    setSelectedDate(next);
  };

  // Whether the prayer is muted now comes from the persisted store, not
  // from whether reminders exist for it — this is what actually fixes
  // "nothing happens" when the user hasn't created any custom reminder
  // for that prayer yet (the default, out-of-the-box state).
  const isPrayerMuted = (key) => mutedPrayers.has(key);

  // Tapping the speaker icon toggles the persisted mute for that prayer
  // (this is what ReminderWatcher actually checks before scheduling
  // anything for it — see reminderAlerts.js). Any existing custom
  // reminders for that prayer are also flipped in step, purely so the
  // Reminders screen's own toggles don't visually disagree with this.
  const toggleMute = async (key) => {
    const nextMuted = !isPrayerMuted(key);
    setMutingKey(key);
    try {
      await setPrayerMuted(key, nextMuted);

      const forPrayer = reminders.filter((r) => r.prayer === key);
      if (forPrayer.length > 0) {
        const nextEnabled = !nextMuted;
        await setEnabledForPrayer(key, nextEnabled);
      }
    } catch (err) {
      console.warn('Failed to update mute for', key, err.message);
      fetchReminders(); // roll back reminder state on failure
    } finally {
      setMutingKey(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  const next = data?.next;
  // Three tune layers stack on top of today's already-fetched (and
  // regular-tuned) times, in the same order ClockScreen/MonthPrayerScreen
  // apply them: Ramadan offsets first (a no-op outside Ramadan), then any
  // year-round fixed time OVERWRITES that key's clock time outright (not
  // an offset — see applyYearRoundTimesToTimes), then any specific-date
  // override adds its offset on top of whatever's left.
  const ramadanTimes = applyRamadanTuneToTimes(data?.hijri, data?.times);
  const yearRoundApplied = applyYearRoundTimesToTimes(data?.date, ramadanTimes);
  const times = applyDateTuneToTimes(data?.date, yearRoundApplied);
  const gregorianStr = data?.date
    ? new Date(`${data.date}T12:00:00`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
    >
      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <Text style={styles.bookIcon}>📖</Text>
          <Text style={styles.weekday}>{data?.weekday}</Text>
          <View style={styles.dateNav}>
            <TouchableOpacity onPress={() => goToDay(-1)} hitSlop={10}>
              <Text style={styles.navArrow}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => goToDay(1)} hitSlop={10}>
              <Text style={styles.navArrow}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.hijriDate}>
          {data?.hijri ? `${data.hijri.day} ${data.hijri.monthName} ${data.hijri.year}` : ''}
        </Text>
        <Text style={styles.gregorianDate}>{gregorianStr}</Text>

        <View style={styles.divider} />

        {times &&
          Object.entries(PRAYER_LABELS).map(([key, label]) => {
            const isActive = next && key === next.name;
            const countdown = isActive ? formatCountdown(next.time) : null;
            return (
              <View key={key} style={styles.row}>
                <Text style={[styles.rowTime, isActive && styles.activeText]}>{formatTime(times[key])}</Text>
                <Text style={[styles.rowLabel, isActive && styles.activeText]}>{label}</Text>
                {countdown ? <Text style={styles.countdown}>- {countdown}</Text> : <View style={{ flex: 1 }} />}
                <TouchableOpacity onPress={() => toggleMute(key)} disabled={mutingKey === key} hitSlop={8}>
                  <Text style={[styles.speakerIcon, isActive && styles.activeText]}>
                    {isPrayerMuted(key) ? '🔇' : '🔊'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 4, alignItems: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center' },
  bookIcon: { fontSize: 18, marginRight: 8 },
  weekday: { color: colors.navy, fontSize: 17, fontWeight: '700', flex: 1 },
  dateNav: { flexDirection: 'row', gap: 16 },
  navArrow: { color: colors.gold, fontSize: 22, fontWeight: '700', marginLeft: 16 },
  hijriDate: { color: colors.textMuted, fontSize: 13, marginTop: 10 },
  gregorianDate: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginTop: 16, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowTime: { color: colors.navy, fontSize: 15, fontWeight: '600', width: 80 },
  rowLabel: { color: colors.navy, fontSize: 15, flex: 1 },
  countdown: { color: colors.gold, fontSize: 14, fontWeight: '600', marginRight: 8 },
  speakerIcon: { fontSize: 16 },
  activeText: { color: colors.gold, fontWeight: '700' },
});