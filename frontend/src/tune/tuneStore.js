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
// Bumped whenever a stored default changes in a way that needs a one-time
// fix-up of already-saved data (see the migration in loadTune below).
const TUNE_SCHEMA_VERSION = 2;

// fajrEnd/dhuhrEnd/asrEnd/maghribEnd/ishaEnd/jummahEnd are the Jama'at
// offsets — minutes after each prayer's own Azan (start) time at which the
// congregation is held. They're what MonthPrayerScreen's "Jamaat" tabs show
// and what gets sent to the device on the Jama'at row (azanFlag=0) — see
// applyJamaatOffset in sync/prayerPayload.js.
//
// Default is +10 min rather than 0: a Jama'at at exactly the Azan time
// isn't a real-world setup, so an untuned install now shows a sensible
// 10-minute gap instead of a Jama'at row identical to the Azan row. The
// user can still set any of these back to 0 explicitly in Tune Prayer
// Timings if their mosque really does pray immediately.
export const DEFAULT_JAMAAT_OFFSET = 10;

const DEFAULT_TUNE = {
  fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0, jummah: 0, ishraq: 0, chasht: 0,
  // Tarabih's default is 15 (not 0) — it's meant to read as "15 minutes
  // after Ishaa" out of the box, same as Ishraq/Chasht's defaults being
  // baked into their own sunrise-based numbers rather than starting at 0.
  tarabih: 15,
  fajrEnd: DEFAULT_JAMAAT_OFFSET,
  dhuhrEnd: DEFAULT_JAMAAT_OFFSET,
  asrEnd: DEFAULT_JAMAAT_OFFSET,
  maghribEnd: DEFAULT_JAMAAT_OFFSET,
  ishaEnd: DEFAULT_JAMAAT_OFFSET,
  // jummahEnd was already read by sync/prayerPayload.js but never defined
  // here, so the Jummah Jama'at field always fell back to the raw Azan
  // time. Defined now so it behaves like the other five.
  jummahEnd: DEFAULT_JAMAAT_OFFSET,
};

// The keys above that are Jama'at offsets, used by the migration below.
const JAMAAT_KEYS = ['fajrEnd', 'dhuhrEnd', 'asrEnd', 'maghribEnd', 'ishaEnd', 'jummahEnd'];

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
      const parsed = JSON.parse(stored);
      currentTune = { ...DEFAULT_TUNE, ...parsed };

      // One-time migration for installs that saved offsets before the
      // Jama'at default changed from 0 to +10. Merging onto DEFAULT_TUNE
      // above doesn't reach them: setTune() writes the whole object, so
      // their saved JSON holds an explicit 0 for every Jama'at key, which
      // wins over the new default. If all Jama'at keys are 0 the user
      // never actually tuned them (an all-zero Jama'at set is just the old
      // untouched default), so bring them up to +10. `schemaVersion` marks
      // the file as migrated so this can't re-run and stomp a user who
      // later sets them back to 0 on purpose.
      if (!parsed.schemaVersion && JAMAAT_KEYS.every((key) => !currentTune[key])) {
        JAMAAT_KEYS.forEach((key) => { currentTune[key] = DEFAULT_JAMAAT_OFFSET; });
      }
      if (!parsed.schemaVersion) {
        currentTune.schemaVersion = TUNE_SCHEMA_VERSION;
        AsyncStorage.setItem(TUNE_KEY, JSON.stringify(currentTune)).catch(() => {});
      }

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