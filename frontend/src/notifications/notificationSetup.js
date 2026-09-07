// Shared setup for expo-notifications, used by both reminderAlerts.js (the
// real scheduling logic) and any manual "send test notification" trigger.
//
// Local scheduled notifications (not push) are used here — no server or
// Expo push token involved. Once scheduled, Android/iOS's own OS delivers
// them at the trigger time even if the app is backgrounded or fully closed,
// unlike the old expo-av approach which only worked while the app was open.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Three pre-rendered loudness variants of the same salat_time clip — see
// assets/sounds/ (converted from the original salat_time.mp3 to .wav, since
// expo-notifications only reliably supports .wav for custom notification
// sounds on both platforms — mp3 isn't guaranteed to play on iOS). Neither
// Android nor iOS lets an app set an arbitrary playback volume for a
// notification sound once it's handed off to the OS (that's the whole point
// of scheduling through expo-notifications instead of playing audio
// ourselves — see reminderAlerts.js), so "volume" here means picking which
// pre-baked file plays, not a runtime gain control.
// Must match the base filenames (with extension) listed in the
// expo-notifications plugin's "sounds" array in app.json. The plugin copies
// them into the native project (Android res/raw, iOS bundle) at build time
// — that's why a prebuild/rebuild is required after adding them, a JS-only
// change isn't enough.
export const SOUND_LEVELS = {
  low: 'salat_low.wav',
  medium: 'salat_medium.wav',
  high: 'salat_high.wav',
};
export const DEFAULT_SOUND_LEVEL = 'high';
export const CHANNEL_ID = 'reminders';

// The 15-option "Choose Notification Sound" library (drawer > Choose
// Notification Sound). Separate from SOUND_LEVELS above — that's an
// intensity control over ONE clip; this is a choice of WHICH clip plays.
// Same file-format constraint applies: .wav only (see comment above), and
// every filename here must also be listed in app.json's expo-notifications
// "sounds" array (see notes there) — a prebuild/rebuild is required after
// adding new ones, a JS-only change isn't enough.
//
// NOTE: All 15 files currently point at placeholder copies of the same
// clip (notification_sound_01.wav .. _15.wav) so the picker is fully
// wired and functional right away. Swap each file's actual audio content
// for a distinct sound and update `label` below to match — filenames can
// stay the same, just replace what's inside them (and keep app.json's
// sounds array in sync if you rename any).
export const SOUND_LIBRARY = [
  { key: 'sound_01', label: 'Sound 1', file: 'salat_high_1.wav' },
  { key: 'sound_02', label: 'Sound 2', file: 'salat_high_2.wav' },
  { key: 'sound_03', label: 'Sound 3', file: 'salat_high_3.wav' },
  { key: 'sound_04', label: 'Sound 4', file: 'salat_high_4.wav' },
  { key: 'sound_05', label: 'Sound 5', file: 'salat_high_5.wav' },
  { key: 'sound_06', label: 'Sound 6', file: 'salat_high_6.wav' },
  { key: 'sound_07', label: 'Sound 7', file: 'salat_high_7.wav' },
  { key: 'sound_08', label: 'Sound 8', file: 'salat_high_8.wav' },
  { key: 'sound_09', label: 'Sound 9', file: 'salat_high_9.wav' },
  { key: 'sound_10', label: 'Sound 10', file: 'salat_high_10.wav' },
  { key: 'sound_11', label: 'Sound 11', file: 'salat_high_11.wav' },
  { key: 'sound_12', label: 'Sound 12', file: 'salat_high_12.wav' },
  { key: 'sound_13', label: 'Sound 13', file: 'salat_high_13.wav' },
  { key: 'sound_14', label: 'Sound 14', file: 'salat_high_14.wav' },
  { key: 'sound_15', label: 'Sound 15', file: 'salat_high_15.wav' },
];

// Foreground behavior — without this, a notification triggered while the
// app is open and visible would otherwise show nothing until you check
// the tray manually. Must be called once before any notification fires.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensurePermission() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// Android requires the sound to be attached to the *channel*, not just the
// notification content, or it silently falls back to the default system
// sound on Android 8+. iOS doesn't use channels at all — it reads the
// sound directly off notification content instead.
export async function ensureChannel(soundFile = SOUND_LEVELS[DEFAULT_SOUND_LEVEL]) {
  if (Platform.OS !== 'android') return;
  // Android locks a channel's sound at creation time — calling
  // setNotificationChannelAsync again with a different `sound` value does
  // NOT update an existing channel. Deleting first guarantees the sound
  // below actually takes effect, even on devices where the channel was
  // created by an earlier build (or an earlier volume-level choice) before
  // the current sound was wired in.
  await Notifications.deleteNotificationChannelAsync(CHANNEL_ID).catch(() => {});
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Prayer Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    sound: soundFile,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}