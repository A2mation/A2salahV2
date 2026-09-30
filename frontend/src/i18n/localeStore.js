// Persists the user's chosen app language on-device and broadcasts changes
// to every subscriber — same plain-module pub/sub + AsyncStorage pattern as
// volumeStore.js / drawerStore.js. useTranslation() (in this same folder)
// wraps this store in a hook so screens re-render automatically the moment
// the language changes anywhere in the app (e.g. from the drawer's
// Language picker), without any navigation reset or restart being needed.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, NativeModules } from 'react-native';

const LOCALE_KEY = '@a2salah/locale';

export const SUPPORTED_LOCALES = ['en', 'bn', 'ur'];
export const DEFAULT_LOCALE = 'en';

// Best-effort guess at the device's language on first launch (before the
// user has picked anything and before AsyncStorage has a saved value), so
// a Bengali or Urdu phone opens in that language instead of always
// defaulting to English. Falls back to English for anything unsupported.
function detectDeviceLocale() {
  try {
    const raw =
      Platform.OS === 'ios'
        ? NativeModules.SettingsManager?.settings?.AppleLocale ||
          NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
        : NativeModules.I18nManager?.localeIdentifier;
    const code = (raw || '').slice(0, 2).toLowerCase();
    if (SUPPORTED_LOCALES.includes(code)) return code;
  } catch (err) {
    // Ignore — fall through to the default below.
  }
  return DEFAULT_LOCALE;
}

let currentLocale = DEFAULT_LOCALE;
const listeners = new Set();

// Call once on app start (App.js) before the first screen paints, so
// everything already renders in the right language on launch instead of
// flashing English first.
export async function loadLocale() {
  try {
    const stored = await AsyncStorage.getItem(LOCALE_KEY);
    if (stored && SUPPORTED_LOCALES.includes(stored)) {
      currentLocale = stored;
    } else {
      currentLocale = detectDeviceLocale();
    }
    listeners.forEach((listener) => listener(currentLocale));
  } catch (err) {
    console.warn('Failed to read saved locale', err.message);
  }
  return currentLocale;
}

export function getLocale() {
  return currentLocale;
}

export async function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale) || locale === currentLocale) return;
  currentLocale = locale;
  listeners.forEach((listener) => listener(currentLocale));
  try {
    await AsyncStorage.setItem(LOCALE_KEY, locale);
  } catch (err) {
    console.warn('Failed to persist locale', err.message);
  }
}

// Returns an unsubscribe function for use in a useEffect cleanup.
export function subscribeLocale(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}