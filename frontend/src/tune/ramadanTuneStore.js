// Store for the user's Ramadan-specific prayer-time tune offsets — same
// shape and plain-module pub/sub + AsyncStorage pattern as tuneStore.js,
// just kept under its own storage key so it doesn't collide with the
// regular, every-day offsets.
//
// Why a separate store instead of reusing tuneStore.js: Ramadan mosques
// commonly run noticeably different Jama'at timings (Isha/Taraweeh moved
// earlier or later, Fajr/Sehri nudged for the pre-dawn meal, etc.) than
// the rest of the year, and the user may want both sets saved at once —
// e.g. tune normal-day Isha by +5 and Ramadan Isha by +20 — without one
// overwriting the other when Ramadan ends.
//
// This does NOT talk to the backend. Unlike the regular tune (sent to the
// backend as tuneFajr=/tuneAsr=/etc query params so getPrayerTimes bakes
// it into the calculation), Ramadan applies on top, client-side, on
// whatever times already came back — see applyRamadanTuneToTimes below.
// That mirrors dateTuneStore.js's applyDateTuneToTimes, and means no
// backend change is needed: Ramadan doesn't line up with Gregorian month
// boundaries, so "is today Ramadan" is only known once a day's `hijri`
// object comes back in the API response anyway.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_JAMAAT_OFFSET } from './tuneStore';

const RAMADAN_TUNE_KEY = '@a2salah/prayer_ramadan_tune_offsets';

const RAMADAN_TUNE_SCHEMA_VERSION = 2;

// Same key shape as tuneStore's DEFAULT_TUNE (see that file for what each
// key means) — kept in sync so TuneTimingsScreen's Ramadan mode can reuse
// the exact same rows/UI as Normal Days mode.
const DEFAULT_RAMADAN_TUNE = {
  fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0, jummah: 0, ishraq: 0, chasht: 0,
  // Same reasoning as the Jama'at defaults below: shows +15 here too,
  // matching Normal Days' tarabih default (tuneStore.js's DEFAULT_TUNE),
  // rather than 0. NOTE: display-only for this tab — the actual Tarabih
  // time on the chart always reads Normal Days' tune.tarabih (see
  // MonthPrayerScreen.js), since Ramadan tuning doesn't have a real
  // 'tarabih' field to apply itself onto.
  tarabih: 15,
  // Jama'at offsets default to +10 here too, so the Ramadan tab of
  // TuneTimingsScreen starts from the same place as Normal Days rather
  // than showing 0 next to the other tab's 10 (see DEFAULT_JAMAAT_OFFSET
  // in tuneStore.js, which is the single source of that number).
  fajrEnd: DEFAULT_JAMAAT_OFFSET,
  dhuhrEnd: DEFAULT_JAMAAT_OFFSET,
  asrEnd: DEFAULT_JAMAAT_OFFSET,
  maghribEnd: DEFAULT_JAMAAT_OFFSET,
  ishaEnd: DEFAULT_JAMAAT_OFFSET,
  jummahEnd: DEFAULT_JAMAAT_OFFSET,
};


const JAMAAT_KEYS = ['fajrEnd', 'dhuhrEnd', 'asrEnd', 'maghribEnd', 'ishaEnd', 'jummahEnd'];


// sehri/iftar aren't real keys in DEFAULT_RAMADAN_TUNE, but they show up
// as keys in the `times` object the backend returns (aliases for
// fajr/maghrib — see backend/utils/prayerTimes.js) and matter most during
// Ramadan specifically, so mirror them the same way dateTuneStore.js does.
const MIRROR_KEYS = { sehri: 'fajr', iftar: 'maghrib' };

let currentRamadanTune = { ...DEFAULT_RAMADAN_TUNE };
const listeners = new Set();

// Call once on app start (App.js), same spot as loadTune()/loadDateTunes().
export async function loadRamadanTune() {
  try {
    const stored = await AsyncStorage.getItem(RAMADAN_TUNE_KEY);
    if (stored) {

       const parsed = JSON.parse(stored);
      currentRamadanTune = { ...DEFAULT_RAMADAN_TUNE, ...parsed };

      if (!parsed.schemaVersion && JAMAAT_KEYS.every((key) => !currentRamadanTune[key])) {
        JAMAAT_KEYS.forEach((key) => { currentRamadanTune[key] = DEFAULT_JAMAAT_OFFSET; });
      }

        if (!parsed.schemaVersion) {
        currentRamadanTune.schemaVersion = RAMADAN_TUNE_SCHEMA_VERSION;
        AsyncStorage.setItem(RAMADAN_TUNE_KEY, JSON.stringify(currentRamadanTune)).catch(() => {});
      }


      listeners.forEach((listener) => listener(currentRamadanTune));
    }
  } catch (err) {
    console.warn('Failed to read saved Ramadan tune offsets', err.message);
  }
  return currentRamadanTune;
}

export function setRamadanTune(updates) {
  currentRamadanTune = { ...currentRamadanTune, ...updates };
  listeners.forEach((listener) => listener(currentRamadanTune));
  AsyncStorage.setItem(RAMADAN_TUNE_KEY, JSON.stringify(currentRamadanTune)).catch((err) => {
    console.warn('Failed to save Ramadan tune offsets', err.message);
  });
}

export function getRamadanTune() {
  return currentRamadanTune;
}

export function resetRamadanTune() {
  setRamadanTune(DEFAULT_RAMADAN_TUNE);
}

// Returns an unsubscribe function for use in a useEffect cleanup.
export function subscribeRamadanTune(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A day's `hijri` object (as returned by getTodayPrayerTimes/getMonthPrayerTimes
// — { day, month, monthName, year }) is Ramadan when month === 9 (see
// HIJRI_MONTHS in backend/utils/hijri.js — Ramadan is the 9th month).
// Checking monthName too so this still works if a caller ever passes a
// hijri-like object without the numeric month.
export function isRamadanHijri(hijri) {
  if (!hijri) return false;
  return hijri.month === 9 || hijri.monthName === 'Ramadan';
}

// Applies the saved Ramadan offsets on top of an already-fetched `times`
// object (the shape getMonthPrayerTimes()/getTodayPrayerTimes() resolve
// to), but ONLY when `hijri` says the date in question actually falls in
// Ramadan — every other month, this is a no-op and returns `times`
// unchanged. Pure/client-side, exactly like dateTuneStore's
// applyDateTuneToTimes, so no extra network round trip is needed just to
// find out whether a given day is Ramadan.
export function applyRamadanTuneToTimes(hijri, times) {
  if (!times || !isRamadanHijri(hijri)) return times;

  const next = { ...times };
  Object.keys(next).forEach((key) => {
    const offsetKey = MIRROR_KEYS[key] || key;
    const minutes = currentRamadanTune[offsetKey];
    if (minutes && next[key]) {
      next[key] = new Date(new Date(next[key]).getTime() + minutes * 60000).toISOString();
    }
  });
  return next;
}