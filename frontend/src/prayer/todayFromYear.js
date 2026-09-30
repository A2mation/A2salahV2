// Derives TODAY's prayer times from the already-cached full-year raw data
// (yearRawStore.js) instead of calling the backend's /prayer/today route.
//
// yearRawStore caches an entire year per (year, location) and is normally
// already populated after a single visit to MonthPrayerScreen — so on any
// day after that, this resolves entirely from AsyncStorage with zero
// network calls, even though the date has rolled over. getYearRawDays()
// itself still falls through to the backend on a genuine cache miss (new
// year, new location), so this is safe to call unconditionally.
import { getYearRawDays } from './yearRawStore';
import { applyBaseTuneToTimes } from './applyTune';
import { getTune } from '../tune/tuneStore';
import { getCity } from '../location/locationStore';

// Mirrors ClockScreen.js's/PrayerListScreen.js's own local getNextPrayer()
// exactly. Both screens skip their own fetch when prayerTimesStore is
// already populated (i.e. exactly what Splash does here), so `next` has to
// be filled in now — otherwise the countdown has nothing to show until
// something else (a tune change, a location update) triggers a refetch.
function getNextPrayer(times, now) {
  const order = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  for (const name of order) {
    if (times?.[name] && new Date(times[name]) > now) {
      return { name, time: times[name] };
    }
  }
  return { name: 'fajr', time: null };
}

// Device-local YYYY-MM-DD, not UTC — matches todayPrayerCache.js's rule so
// the two agree on what "today" means for anyone not in UTC+0.
function todayDateStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns today's prayer data built from the cached year-raw data with the
 * user's tune applied locally, shaped like { city, date, weekday, hijri,
 * times } — a drop-in for setPrayerData(). Resolves to null if today's
 * entry isn't in the (freshly fetched, if needed) year data for some
 * reason, so callers can fall back to getTodayPrayerTimesCached().
 */
export async function getTodayFromYearRaw() {
  const dateStr = todayDateStr();
  const year = Number(dateStr.slice(0, 4));

  const yearDays = await getYearRawDays(year); // network only on a real cache miss
  const today = yearDays.find((d) => d.date === dateStr);
  if (!today) return null;

  const tune = getTune();
  const times = applyBaseTuneToTimes(today.times, tune);

  // Deliberately NOT applying Ramadan / year-round / date-specific tune
  // here — ClockScreen and PrayerListScreen already re-apply all three of
  // those downstream, at render time, on top of whatever `data.times` is
  // (see the ramadanTimes/yearRoundApplied/times chain in each). Baking
  // them in here too would apply them twice.
  return {
    city: getCity(),
    date: today.date,
    weekday: today.weekday,
    hijri: today.hijri,
    times,
    next: getNextPrayer(times, new Date()),
  };
}