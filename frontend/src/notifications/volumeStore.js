// Persists the user's chosen intensity for the custom reminder sound
// (low/medium/high), on-device — same plain-module pub/sub + AsyncStorage
// pattern as onboardingStore.js.
//
// Each level maps to a separately pre-rendered .wav file (see
// SOUND_LEVELS in notificationSetup.js) rather than a runtime gain value:
// neither Android nor iOS lets a third-party app set an arbitrary playback
// volume for a notification sound once it's handed off to the OS, so baking
// the loudness into the audio file itself is the only way a chosen
// intensity actually carries through to a real, background-delivered
// reminder.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SOUND_LEVELS, DEFAULT_SOUND_LEVEL } from './notificationSetup';

const VOLUME_KEY = '@a2salah/reminder_volume_level';

let currentLevel = DEFAULT_SOUND_LEVEL;
const listeners = new Set();

// Call once on app start (ReminderWatcher's init) before the channel/sound
// is first set up, so the very first ensureChannel() call already uses
// whatever the user picked last time instead of the default.
export async function loadVolumeLevel() {
  try {
    const stored = await AsyncStorage.getItem(VOLUME_KEY);
    if (stored && SOUND_LEVELS[stored]) {
      currentLevel = stored;
      listeners.forEach((listener) => listener(currentLevel));
    }
  } catch (err) {
    console.warn('Failed to read reminder volume level', err.message);
  }
  return currentLevel;
}

export function getVolumeLevel() {
  return currentLevel;
}

export function getCurrentSoundFile() {
  return SOUND_LEVELS[currentLevel];
}

export async function setVolumeLevel(level) {
  if (!SOUND_LEVELS[level] || level === currentLevel) return;
  currentLevel = level;
  listeners.forEach((listener) => listener(currentLevel));
  try {
    await AsyncStorage.setItem(VOLUME_KEY, level);
  } catch (err) {
    console.warn('Failed to persist reminder volume level', err.message);
  }
}

// Returns an unsubscribe function for use in a useEffect cleanup.
export function subscribeVolume(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
