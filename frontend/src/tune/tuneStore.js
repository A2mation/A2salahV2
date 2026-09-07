// Store for the user's personal prayer-time tune offsets (minutes, per
// prayer) — same plain-module pub/sub pattern as locationStore.js and
// drawerStore.js, plus AsyncStorage persistence (same pattern as
// volumeStore.js / mutedPrayersStore.js) so each device keeps its own
// tuning across restarts instead of resetting to all-zero every launch.
//
// Why a plain module instead of local state in TuneTimingsScreen: every
// screen that displays prayer times (ClockScreen, PrayerListScreen) needs
// to re-fetch when these offsets change, and api.js needs to read the
// current offsets synchronously when building a request — same rationale
// as locationStore.js.
//
// This is per-device, not per-account — there's no login in this app, so
// "different tune for every user" just means each phone's own local copy
// of this file's storage key, sent along with every api.js request. That
// part already works as soon as setTune() is called; the piece that was
// missing is this persistence — without it, the offsets lived only in a
// JS variable and silently reset to 0 every time the app restarted.
import AsyncStorage from '@react-native-async-storage/async-storage';

const TUNE_KEY = '@a2salah/prayer_tune_offsets';

// fajrEnd/dhuhrEnd/asrEnd/maghribEnd/ishaEnd are minute offsets applied on
// top of each prayer's *default* window end (which is simply the next
// prayer's start time — see getPrayerWindowEnd in ClockScreen.js). Left at
// 0 they change nothing, so the "Ends" time shown on the home screen stays
// exactly the next prayer's start time unless the user tunes it here.
const DEFAULT_TUNE = {
  fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0, jummah: 0, ishraq: 0, chasht: 0,
  fajrEnd: 0, dhuhrEnd: 0, asrEnd: 0, maghribEnd: 0, ishaEnd: 0,
};

let currentTune = { ...DEFAULT_TUNE };
const listeners = new Set();

// Call once on app start (App.js), same as loadVolumeLevel/loadMutedPrayers
// — reads this device's saved offsets before the first prayer-times fetch
// goes out, so a returning user sees their own tuned times immediately
// instead of a flash of untuned defaults. Merged onto DEFAULT_TUNE (rather
// than replacing it outright) so a future new tune key added here still
// comes back as 0 for users who saved before that key existed, instead of
// undefined.
export async function loadTune() {
  try {
    const stored = await AsyncStorage.getItem(TUNE_KEY);
    if (stored) {
      currentTune = { ...DEFAULT_TUNE, ...JSON.parse(stored) };
      listeners.forEach((listener) => listener(currentTune));
    }
  } catch (err) {
    console.warn('Failed to read saved prayer tune offsets', err.message);
  }
  return currentTune;
}

export function setTune(updates) {
  currentTune = { ...currentTune, ...updates };
  listeners.forEach((listener) => listener(currentTune));
  AsyncStorage.setItem(TUNE_KEY, JSON.stringify(currentTune)).catch((err) => {
    console.warn('Failed to save prayer tune offsets', err.message);
  });
}

export function getTune() {
  return currentTune;
}

export function resetTune() {
  setTune(DEFAULT_TUNE);
}

// Returns an unsubscribe function for use in a useEffect cleanup.
export function subscribeTune(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}