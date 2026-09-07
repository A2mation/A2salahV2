import axios from 'axios';
import { getCoords, getCity } from '../location/locationStore';
import { getTune } from '../tune/tuneStore';

// Points at a locally-running backend (see /backend, `npm run dev`, default
// port 5000). Update this for whichever device/emulator you're running on:
//
// Android Emulator
// const BASE_URL = 'http://10.0.2.2:5000/api';
//
// Expo Web (browser)
// const BASE_URL = 'http://localhost:5000/api';
//
// Physical device (Expo Go) — use your machine's LAN IP
// const BASE_URL = 'http://192.168.x.x:5000/api';

// const BASE_URL = 'http://10.0.2.2:5000/api';

// render url
const BASE_URL = 'https://a2salahs.onrender.com/api';


// Without a timeout, a request made while the phone has no real route to
// the internet (e.g. the brief window right after leaving the ESP32's
// no-internet hotspot, before Android's networking stack has switched back
// to WiFi/mobile data) never fails — it just hangs indefinitely. That left
// the ESP Sync screen's "Preparing data…" stuck forever on reconnect. 15s
// is generous for a normal request but still short enough that the UI
// recovers and can show a retry option instead of hanging.
const api = axios.create({ baseURL: BASE_URL, timeout: 15000 });

export const getTodayPrayerTimes = (dateStr) => {
  const params = dateStr ? { date: dateStr } : {};
  // If we have a GPS fix from useLocationOnLaunch, attach it so the backend
  // can calculate times for the device's actual location.
  const coords = getCoords();
  if (coords) {
    params.lat = coords.latitude;
    params.lng = coords.longitude;
  }
  // If reverse geocoding has resolved a city name from the device's GPS
  // fix, send it along so the header shows the real location instead of
  // the backend's hardcoded default.
  const city = getCity();
  if (city) {
    params.city = city;
  }
  // Personal per-namaz adjustments from the "Tune Prayer Timings" screen.
  const tune = getTune();
  if (tune.fajr) params.tuneFajr = tune.fajr;
  if (tune.sunrise) params.tuneSunrise = tune.sunrise;
  if (tune.dhuhr) params.tuneDhuhr = tune.dhuhr;
  if (tune.asr) params.tuneAsr = tune.asr;
  if (tune.maghrib) params.tuneMaghrib = tune.maghrib;
  if (tune.isha) params.tuneIsha = tune.isha;
  if (tune.jummah) params.tuneJummah = tune.jummah;
  if (tune.ishraq) params.tuneIshraq = tune.ishraq;
  if (tune.chasht) params.tuneChasht = tune.chasht;
  return api.get('/prayer/today', { params });
};

// year: full year (e.g. 2026), month: 1-12.
export const getMonthPrayerTimes = (year, month) => {
  const params = { year, month };
  const coords = getCoords();
  if (coords) {
    params.lat = coords.latitude;
    params.lng = coords.longitude;
  }
  const city = getCity();
  if (city) {
    params.city = city;
  }
  const tune = getTune();
  if (tune.fajr) params.tuneFajr = tune.fajr;
  if (tune.sunrise) params.tuneSunrise = tune.sunrise;
  if (tune.dhuhr) params.tuneDhuhr = tune.dhuhr;
  if (tune.asr) params.tuneAsr = tune.asr;
  if (tune.maghrib) params.tuneMaghrib = tune.maghrib;
  if (tune.isha) params.tuneIsha = tune.isha;
  if (tune.jummah) params.tuneJummah = tune.jummah;
  if (tune.ishraq) params.tuneIshraq = tune.ishraq;
  if (tune.chasht) params.tuneChasht = tune.chasht;
  return api.get('/prayer/month', { params });
};

// Assembles a full year (365/366 entries, one per day) by calling the
// existing /prayer/month endpoint once per month and concatenating the
// `days` arrays. There's no dedicated /prayer/year backend route, so this
// is the simplest way to get a year's worth of times with the current API.
// Used by the ESP32 Bluetooth sync screen to build the payload it sends.
export const getYearPrayerTimes = async (year) => {
  const monthResponses = await Promise.all(
    Array.from({ length: 12 }, (_, i) => getMonthPrayerTimes(year, i + 1))
  );
  const days = monthResponses.flatMap((res) => res.data.days);
  return days; // [{ date, day, weekday, hijri, times: { fajr, sunrise, dhuhr, asr, maghrib, isha } }, ...]
};

// --- RAW (untuned) fetchers -------------------------------------------
// Same /prayer/month endpoint as above, but deliberately NEVER sends any
// tuneXxx params, so the backend returns the plain astronomical
// calculation for each day. This response depends only on
// (year, month, lat, lng) — not on the user's tune settings — so it's safe
// to fetch once and cache for a whole year (see prayer/yearRawStore.js),
// then re-tune locally as many times as the user wants via
// prayer/applyTune.js, with zero extra network calls.
export const getMonthPrayerTimesRaw = (year, month) => {
  const params = { year, month };
  const coords = getCoords();
  if (coords) {
    params.lat = coords.latitude;
    params.lng = coords.longitude;
  }
  const city = getCity();
  if (city) {
    params.city = city;
  }
  return api.get('/prayer/month', { params });
};

// Assembles a full year of RAW days the same way getYearPrayerTimes does
// for tuned data — 12 calls to /prayer/month, concatenated. Callers should
// go through prayer/yearRawStore.js's getYearRawDays() instead of calling
// this directly, so the result actually gets cached.
export const getYearPrayerTimesRaw = async (year) => {
  const monthResponses = await Promise.all(
    Array.from({ length: 12 }, (_, i) => getMonthPrayerTimesRaw(year, i + 1))
  );
  return monthResponses.flatMap((res) => res.data.days);
};

export const getReminders = () => api.get('/reminders');
export const createReminder = (reminder) => api.post('/reminders', reminder);
export const updateReminder = (id, updates) => api.put(`/reminders/${id}`, updates);
export const deleteReminder = (id) => api.delete(`/reminders/${id}`);
export const deleteAllReminders = () => api.delete('/reminders');

export const getWorldCityCatalog = () => api.get('/world-cities/catalog');
export const getWorldCities = () => api.get('/world-cities');
export const addWorldCity = (cityKey) => api.post('/world-cities', { cityKey });
export const deleteWorldCity = (id) => api.delete(`/world-cities/${id}`);
export const reorderWorldCities = (orderedIds) => api.put('/world-cities/reorder', { orderedIds });

export default api;