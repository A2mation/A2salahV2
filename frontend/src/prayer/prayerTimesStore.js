// A minimal in-memory cache for today's prayer-times API response — same
// pattern as locationStore.js / tuneStore.js.
//
// Why: SplashScreen now prefetches getTodayPrayerTimes() itself (waiting on
// it before navigating to Welcome, so Home never has to). Once Home mounts,
// ClockScreen and PrayerListScreen read from here first so they can render
// instantly instead of showing their own loading spinner while re-fetching
// data Splash already has. They still re-fetch in the background afterward
// to revalidate (e.g. if coords/tune change), same as before.

let cachedData = null; // shape: the object getTodayPrayerTimes() resolves to, for *today*
const listeners = new Set();

export function setPrayerData(data) {
  cachedData = data;
  listeners.forEach((listener) => listener(cachedData));
}

export function getPrayerData() {
  return cachedData;
}

export function subscribePrayerData(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
