// Persists which prayers the user has muted from the speaker icon on the
// Prayer List screen, on-device — same plain-module pub/sub + AsyncStorage
// pattern as volumeStore.js.
//
// This is intentionally separate from the Reminders CRUD system (see
// RemindersScreen / api.js's getReminders/updateReminder): muting a prayer
// here needs to work even when the user hasn't created any custom
// reminder for it yet (the common case — reminders start out empty), so
// it can't just be "toggle every existing Reminder document's `enabled`
// field for this prayer". Instead ReminderWatcher (reminderAlerts.js)
// checks this store directly and skips scheduling anything for a muted
// prayer, regardless of how many (if any) Reminder documents exist for it.

import AsyncStorage from '@react-native-async-storage/async-storage';

const MUTED_PRAYERS_KEY = '@a2salah/muted_prayers';

let mutedPrayers = new Set();
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener(new Set(mutedPrayers)));
}

// Call once on app start (ReminderWatcher's init), same as loadVolumeLevel,
// so the very first sync pass already respects whatever the user muted
// last time instead of starting from "nothing muted".
export async function loadMutedPrayers() {
  try {
    const stored = await AsyncStorage.getItem(MUTED_PRAYERS_KEY);
    if (stored) {
      mutedPrayers = new Set(JSON.parse(stored));
      notify();
    }
  } catch (err) {
    console.warn('Failed to read muted prayers', err.message);
  }
  return new Set(mutedPrayers);
}

export function isPrayerMuted(prayerKey) {
  return mutedPrayers.has(prayerKey);
}

export function getMutedPrayers() {
  return new Set(mutedPrayers);
}

export async function setPrayerMuted(prayerKey, muted) {
  if (muted) {
    if (mutedPrayers.has(prayerKey)) return;
    mutedPrayers.add(prayerKey);
  } else {
    if (!mutedPrayers.has(prayerKey)) return;
    mutedPrayers.delete(prayerKey);
  }
  notify();
  try {
    await AsyncStorage.setItem(MUTED_PRAYERS_KEY, JSON.stringify(Array.from(mutedPrayers)));
  } catch (err) {
    console.warn('Failed to persist muted prayers', err.message);
  }
}

// Returns an unsubscribe function for use in a useEffect cleanup.
export function subscribeMutedPrayers(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}