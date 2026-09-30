// Caches TODAY's prayer-times API response on-device, so the backend is
// hit only on a genuine cache miss — first launch of the day, a materially
// different location, or forceRefresh — instead of on every single app
// launch like before.
//
// Same plain-module + memory + AsyncStorage pattern as yearRawStore.js.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTodayPrayerTimes } from '../api/api';
import { getCoords } from '../location/locationStore';

const STORAGE_PREFIX = '@a2salah/today_';

// Same ~1km rounding as yearRawStore.js — ordinary GPS jitter between app
// launches (a few dozen metres) shouldn't count as "a new location" and
// force a re-fetch. Prayer times don't meaningfully change at that
// resolution anyway.
const roundCoord = (n) => Math.round(n * 100) / 100;

// Device-local YYYY-MM-DD, not UTC — otherwise the cache would roll over
// at the wrong moment for anyone not in UTC+0.
function todayDateStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// The key is (date, location) — a new day forces a re-fetch even at the
// same location, and a materially different location forces a re-fetch
// even on the same day (e.g. Fajr traveling between cities).
function cacheKey(dateStr, coords) {
  const lat = coords ? roundCoord(coords.latitude) : 'default';
  const lng = coords ? roundCoord(coords.longitude) : 'default';
  return `${STORAGE_PREFIX}${dateStr}_${lat}_${lng}`;
}

// Only ever holds the single most-recent (date, location) — there's only
// ever one "today", so unlike yearRawStore's Map (which holds many years),
// a single slot is enough here.
let memoryCache = null; // { key, data } | null
let inflight = null; // { key, promise } | null — de-dupes concurrent callers

/**
 * Returns today's prayer-times API response (same shape getTodayPrayerTimes()
 * resolves to). Hits the backend only on a genuine cache miss; every other
 * call resolves from memory or AsyncStorage with zero network calls.
 */
export async function getTodayPrayerTimesCached({ forceRefresh = false } = {}) {
  const coords = getCoords();
  const dateStr = todayDateStr();
  const key = cacheKey(dateStr, coords);

  if (!forceRefresh && memoryCache?.key === key) {
    return memoryCache.data;
  }

  if (!forceRefresh) {
    try {
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const data = JSON.parse(stored);
        memoryCache = { key, data };
        return data;
      }
    } catch (err) {
      console.warn('Failed to read cached prayer data', err.message);
      // Fall through to a network fetch below.
    }
  }

  if (!forceRefresh && inflight?.key === key) {
    return inflight.promise;
  }

  const promise = (async () => {
    try {
      const { data } = await getTodayPrayerTimes();
      memoryCache = { key, data };
      AsyncStorage.setItem(key, JSON.stringify(data)).catch((err) => {
        console.warn("Failed to persist today's prayer data", err.message);
      });
      return data;
    } finally {
      inflight = null;
    }
  })();

  inflight = { key, promise };
  return promise;
}

// Clears only the in-memory pointer, not AsyncStorage — the next call will
// still find yesterday's/other-location entries still sitting in
// AsyncStorage (harmless; they just won't match today's cache key and are
// never read). Exists for parity with yearRawStore's clearYearRawCache(),
// e.g. if a "Force refresh" debug action is ever added.
export function clearTodayPrayerMemoryCache() {
  memoryCache = null;
}