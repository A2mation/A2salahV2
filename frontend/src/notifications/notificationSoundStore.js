// Persists the user's chosen notification sound (one of the 15 entries in
// SOUND_LIBRARY, see notificationSetup.js), on-device — same plain-module
// pub/sub + AsyncStorage pattern as volumeStore.js / mutedPrayersStore.js.
//
// selectedKey is nullable: null means "no explicit choice made yet, fall
// back to the existing Volume intensity clip" (see getEffectiveSoundFile
// below and reminderAlerts.js) — so this feature layers on top of Volume
// rather than requiring the user to pick one before reminders work at all.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SOUND_LIBRARY } from './notificationSetup';
import { getCurrentSoundFile } from './volumeStore';

const SOUND_CHOICE_KEY = '@a2salah/notification_sound_choice';

let selectedKey = null;
const listeners = new Set();

function findEntry(key) {
  return SOUND_LIBRARY.find((entry) => entry.key === key) || null;
}

// Call once on app start (ReminderWatcher's init), same as loadVolumeLevel,
// so the very first ensureChannel() call already reflects whatever the
// user picked last time instead of the Volume-based default.
export async function loadSelectedSound() {
  try {
    const stored = await AsyncStorage.getItem(SOUND_CHOICE_KEY);
    if (stored && findEntry(stored)) {
      selectedKey = stored;
      listeners.forEach((listener) => listener(selectedKey));
    }
  } catch (err) {
    console.warn('Failed to read notification sound choice', err.message);
  }
  return selectedKey;
}

export function getSelectedSoundKey() {
  return selectedKey;
}

export async function setSelectedSound(key) {
  // key === null is a valid, deliberate choice — "go back to the
  // Volume-based default" — so it's not filtered out here the way an
  // unrecognized key would be.
  if (key !== null && !findEntry(key)) return;
  if (key === selectedKey) return;
  selectedKey = key;
  listeners.forEach((listener) => listener(selectedKey));
  try {
    if (key === null) {
      await AsyncStorage.removeItem(SOUND_CHOICE_KEY);
    } else {
      await AsyncStorage.setItem(SOUND_CHOICE_KEY, key);
    }
  } catch (err) {
    console.warn('Failed to persist notification sound choice', err.message);
  }
}

// Returns just this store's own file — null if the user hasn't explicitly
// chosen one of the 15 sounds. Use getEffectiveSoundFile() below for the
// value that should actually be scheduled/played.
export function getSelectedSoundFile() {
  const entry = findEntry(selectedKey);
  return entry ? entry.file : null;
}

// The single source of truth reminderAlerts.js (and any preview button)
// should call: this explicit choice if one's been made, otherwise the
// existing Volume intensity clip — so the two features layer instead of
// silently fighting over which one last wrote to the Android channel.
export function getEffectiveSoundFile() {
  return getSelectedSoundFile() || getCurrentSoundFile();
}

// Returns an unsubscribe function for use in a useEffect cleanup.
export function subscribeSelectedSound(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}