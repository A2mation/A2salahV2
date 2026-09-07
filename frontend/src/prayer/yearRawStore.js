// Caches a full year of RAW (untuned) prayer-time calculations on-device,
// so the app calls the backend at most once per (year, location) instead
// of once per screen-load / month-navigation / tune change. Every personal
// offset (fajr/dhuhr/asr/maghrib/isha/jummah/ishraq/chasht) is then applied
// locally via applyTune.js, on top of this same cached raw data.
//
// Same plain-module + AsyncStorage pattern as tuneStore.js /
// mutedPrayersStore.js elsewhere in this app.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getYearPrayerTimesRaw } from '../api/api';
import { getCoords } from '../location/locationStore';

const STORAGE_PREFIX = '@a2salah/year_raw_';

// Round to ~1km so ordinary GPS jitter (a few dozen metres between app
// launches) doesn't count as "a new location" and force a re-fetch —
// prayer times don't meaningfully change at that resolution anyway.
const roundCoord = (n) => Math.round(n * 100) / 100;

function cacheKey(year, coords) {
  const lat = coords ? roundCoord(coords.latitude) : 'default';
  const lng = coords ? roundCoord(coords.longitude) : 'default';
  return `${STORAGE_PREFIX}${year}_${lat}_${lng}`;
}

// key -> { days, fetchedAt } — in-memory, so repeated calls within the same
// app session (switching months, tuning offsets) never touch AsyncStorage
// or the network at all.
const memoryCache = new Map();
// key -> in-flight Promise, so two screens/effects asking for the same
// (year, location) at the same moment share one network request instead of
// firing two.
const inflight = new Map();

/**
 * Returns { date, day, weekday, isToday, hijri, times }[] for every day of
 * `year` at the device's current location — RAW times, no tune applied.
 * Fetches from the backend only on a genuine cache miss (new year, new
 * location, or forceRefresh); every other call resolves from memory or
 * AsyncStorage with zero API calls.
 */
export async function getYearRawDays(year, { forceRefresh = false } = {}) {
  const coords = getCoords();
  const key = cacheKey(year, coords);

  if (!forceRefresh && memoryCache.has(key)) {
    return memoryCache.get(key).days;
  }

  if (!forceRefresh) {
    try {
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        memoryCache.set(key, parsed);
        return parsed.days;
      }
    } catch (err) {
      console.warn('Failed to read cached raw year data', err.message);
    }
  }

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = (async () => {
    try {
      const days = await getYearPrayerTimesRaw(year);
      const payload = { days, fetchedAt: Date.now() };
      memoryCache.set(key, payload);
      AsyncStorage.setItem(key, JSON.stringify(payload)).catch((err) => {
        console.warn('Failed to persist raw year data', err.message);
      });
      return days;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

// Drops every cached year so the next getYearRawDays() call re-fetches from
// the backend. Location isn't part of what invalidates automatically here
// (a new location just becomes a new cache key) — this is for anything
// that changes the underlying calculation for an EXISTING key, e.g. if a
// calculation-method or madhab setting is added later and isn't yet part
// of cacheKey().
export function clearYearRawCache() {
  memoryCache.clear();
}
