// Store for per-date "Tune Prayer Timings" overrides — e.g. "on 12 Aug,
// nudge Fajr by +2 min" without touching the regular, every-day offsets in
// tuneStore.js. Same plain-module pub/sub + AsyncStorage pattern as
// tuneStore.js/locationStore.js, just keyed by date string instead of a
// single flat object.
//
// Shape: { 'YYYY-MM-DD': { fajr, sunrise, dhuhr, asr, maghrib, isha,
// jummah, ishraq, chasht } } — same keys as tuneStore's DEFAULT_TUNE, but
// only the dates the user has actually opened "Tune a Date" for and saved
// get an entry here. Everything else keeps using the regular tune.
import AsyncStorage from '@react-native-async-storage/async-storage';

const DATE_TUNE_KEY = '@a2salah/prayer_date_tune_offsets';

// A date's minutes added on top of fajr/maghrib respectively — sehri and
// iftar are just aliases for fajr/maghrib on the backend (see
// backend/utils/prayerTimes.js), so a Fajr/Maghrib override for a date
// should visibly shift those too instead of only the "official" key.
// Exported so screens that need to know whether one *specific* column
// (rather than the whole date) was overridden — e.g. MonthPrayerScreen's
// per-cell highlighting — can resolve sehri/iftar to the same key this
// store keeps the actual offset under.
export const MIRROR_KEYS = { sehri: 'fajr', iftar: 'maghrib' };

let dateTunes = {};
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener(dateTunes));
}

function persist() {
  AsyncStorage.setItem(DATE_TUNE_KEY, JSON.stringify(dateTunes)).catch((err) => {
    console.warn('Failed to save date-specific tune offsets', err.message);
  });
}

// Call once on app start (App.js), same spot as loadTune().
export async function loadDateTunes() {
  try {
    const stored = await AsyncStorage.getItem(DATE_TUNE_KEY);
    if (stored) {
      dateTunes = JSON.parse(stored);
      notify();
    }
  } catch (err) {
    console.warn('Failed to read saved date-specific tune offsets', err.message);
  }
  return dateTunes;
}

// Returns the raw override object for a date, or null if that date has
// never been tuned.
export function getDateTune(dateStr) {
  return dateTunes[dateStr] || null;
}

// Every dated override currently saved, e.g. for painting a calendar grid
// or the month chart with a marker on every modified date at once.
export function getAllDateTunes() {
  return dateTunes;
}

// True only if the date has an override AND at least one field in it is
// actually non-zero (an all-zero saved entry shouldn't count as "modified").
export function hasDateTune(dateStr) {
  const entry = dateTunes[dateStr];
  return !!entry && Object.values(entry).some((v) => v);
}

export function setDateTune(dateStr, offsets) {
  console.log('[dateTuneStore] setDateTune() key:', dateStr, 'offsets:', offsets);
  dateTunes = { ...dateTunes, [dateStr]: offsets };
  notify();
  persist();
}

const YEAR_ROUND_TIME_KEY = '@a2salah/prayer_year_round_times';

// { [year]: { [prayerKey]: { hour, minute } } } — an EXACT clock time that
// applies identically to every date in that year. This intentionally does
// NOT go through dateTunes/applyDateTuneToTimes: those work by adding a
// fixed number of MINUTES on top of whatever the server calculates that
// specific day, and the server's own calculated time naturally drifts by a
// minute or two across the year — so a constant offset produced a
// different clock time on different days. Storing (and applying) an actual
// hour:minute instead means the displayed time is identical every day,
// full stop, with no server calculation involved at all.
let yearRoundTimes = {};
const yearRoundListeners = new Set();

function notifyYearRound() {
  yearRoundListeners.forEach((listener) => listener(yearRoundTimes));
}

function persistYearRound() {
  AsyncStorage.setItem(YEAR_ROUND_TIME_KEY, JSON.stringify(yearRoundTimes)).catch((err) => {
    console.warn('Failed to save year-round prayer times', err.message);
  });
}

// Call once on app start (App.js), same spot as loadDateTunes().
export async function loadYearRoundTimes() {
  try {
    const stored = await AsyncStorage.getItem(YEAR_ROUND_TIME_KEY);
    if (stored) {
      yearRoundTimes = JSON.parse(stored);
      notifyYearRound();
    }
  } catch (err) {
    console.warn('Failed to read saved year-round prayer times', err.message);
  }
  return yearRoundTimes;
}

export function getAllYearRoundTimes() {
  return yearRoundTimes;
}

export function getYearRoundTime(year, key) {
  return yearRoundTimes[year]?.[key] || null;
}
export function resetAllDateTunes() {
  dateTunes = {};
  notify();
  persist();
}


export function subscribeYearRoundTimes(listener) {
  yearRoundListeners.add(listener);
  return () => yearRoundListeners.delete(listener);
}

// Sets an EXACT hour (0-23) and minute for `key` on every date of `year`.
// No offset math, no per-day baseline — this hour:minute is the answer,
// every single day.
export function setYearRoundTime(year, key, hour, minute) {
  console.log('[dateTuneStore] setYearRoundTime() year:', year, 'key:', key, 'hour:', hour, 'minute:', minute);
  yearRoundTimes = {
    ...yearRoundTimes,
    [year]: { ...(yearRoundTimes[year] || {}), [key]: { hour, minute } },
  };
  notifyYearRound();
  persistYearRound();
}

// Removes `key`'s year-round fixed time for `year` — that prayer goes back
// to the server's normal calculated time (or a per-date override, if one
// separately exists) for every date in that year.
export function clearYearRoundTime(year, key) {
  if (!yearRoundTimes[year] || !(key in yearRoundTimes[year])) return;
  const nextYearEntries = { ...yearRoundTimes[year] };
  delete nextYearEntries[key];
  yearRoundTimes = { ...yearRoundTimes, [year]: nextYearEntries };
  notifyYearRound();
  persistYearRound();
}

// Overwrites (not offsets) every key in `times` that has a year-round fixed
// time set for `dateStr`'s year, with that exact hour:minute on this
// specific date. Anything without a year-round entry passes through
// untouched — including keys applyDateTuneToTimes may still adjust later.
export function applyYearRoundTimesToTimes(dateStr, times) {
  const year = dateStr?.slice(0, 4);
  const entries = yearRoundTimes[year];
  if (!entries || !times) return times;

  const [y, m, d] = dateStr.split('-').map(Number);
  const next = { ...times };
  Object.keys(next).forEach((key) => {
    const offsetKey = MIRROR_KEYS[key] || key;
    const fixed = entries[offsetKey];
    if (fixed && next[key]) {
      next[key] = new Date(y, m - 1, d, fixed.hour, fixed.minute, 0, 0);
    }
  });
  return next;
}

export function clearDateTune(dateStr) {
  if (!(dateStr in dateTunes)) return;
  const next = { ...dateTunes };
  delete next[dateStr];
  dateTunes = next;
  notify();
  persist();
}
export function resetAllYearRoundTimes() {
  yearRoundTimes = {};
  notifyYearRound();
  persistYearRound();
}

export function subscribeDateTunes(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Applies a date's saved override (if any) on top of an already-fetched
// `times` object (the shape getMonthPrayerTimes()/getTodayPrayerTimes()
// resolve to: { fajr, sunrise, dhuhr, asr, maghrib, isha, jummah, ishraq,
// chasht, sehri, iftar, zawal, ... } with Date/ISO values). Pure/client-side
// — doesn't touch the network — so the chart and day view can reflect a
// date's tuning instantly without a round trip to the backend, which has
// no concept of per-date overrides.
export function applyDateTuneToTimes(dateStr, times) {
  const offsets = dateTunes[dateStr];
  if (!offsets || !times) return times;

  const next = { ...times };
  Object.keys(next).forEach((key) => {
    const offsetKey = MIRROR_KEYS[key] || key;
    const minutes = offsets[offsetKey];
    if (minutes && next[key]) {
      next[key] = new Date(new Date(next[key]).getTime() + minutes * 60000);
    }
  });
  return next;
}