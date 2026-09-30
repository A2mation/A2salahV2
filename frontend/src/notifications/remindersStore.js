// On-device storage for custom reminders (RemindersScreen). Replaces the old
// /api/reminders backend calls: reminders are personal to this phone, don't
// need a server, and must keep working offline. Same plain-module pub/sub +
// AsyncStorage pattern as mutedPrayersStore.js.
//
// Reminder shape is unchanged from the backend version so screens barely
// change: { _id, label, prayer, offsetMinutes, enabled, createdAt }.

import AsyncStorage from '@react-native-async-storage/async-storage';

const REMINDERS_KEY = '@a2salah/reminders';

let reminders = [];
let loaded = false;
let loadPromise = null;
const listeners = new Set();

function notify() {
  const snapshot = [...reminders];
  listeners.forEach((l) => l(snapshot));
}

async function persist() {
  try {
    await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
  } catch (err) {
    console.warn('Failed to persist reminders', err.message);
  }
}

// Safe to call from many places (screen, watcher); reads storage only once.
export function loadReminders() {
  if (loaded) return Promise.resolve([...reminders]);
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const stored = await AsyncStorage.getItem(REMINDERS_KEY);
        reminders = stored ? JSON.parse(stored) : [];
      } catch (err) {
        console.warn('Failed to read reminders', err.message);
        reminders = [];
      }
      loaded = true;
      notify();
      return [...reminders];
    })();
  }
  return loadPromise;
}

export function getRemindersSync() {
  return [...reminders];
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function addReminder({ label, prayer, offsetMinutes }) {
  await loadReminders();
  const reminder = {
    _id: newId(),
    label: (label || '').trim(),
    prayer,
    offsetMinutes: Number.isFinite(offsetMinutes) ? offsetMinutes : 0,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  reminders = [reminder, ...reminders]; // newest first, like the old API
  notify();
  await persist();
  return reminder;
}

export async function updateReminder(id, updates) {
  await loadReminders();
  reminders = reminders.map((r) => (r._id === id ? { ...r, ...updates } : r));
  notify();
  await persist();
}

// Used by the Prayer List speaker icon to enable/disable every reminder of a
// prayer in one write (one notify -> one watcher re-sync).
export async function setEnabledForPrayer(prayer, enabled) {
  await loadReminders();
  reminders = reminders.map((r) => (r.prayer === prayer ? { ...r, enabled } : r));
  notify();
  await persist();
}

export async function deleteReminder(id) {
  await loadReminders();
  reminders = reminders.filter((r) => r._id !== id);
  notify();
  await persist();
}

export async function deleteAllReminders() {
  await loadReminders();
  reminders = [];
  notify();
  await persist();
}

// Returns an unsubscribe function for use in a useEffect cleanup.
export function subscribeReminders(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}