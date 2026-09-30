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

export function getChannelId(soundFile = SOUND_LEVELS[DEFAULT_SOUND_LEVEL]) {
  const safeSuffix = soundFile.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${CHANNEL_ID}-${safeSuffix}`;
}

// The 15-option "Choose Notification Sound" library (drawer > Choose
// Notification Sound). Separate from SOUND_LEVELS above — that's an
// intensity control over ONE clip; this is a choice of WHICH clip plays.
// Same file-format constraint applies: .wav only (see comment above), and
// every filename here must also be listed in app.json's expo-notifications
// "sounds" array (see notes there) — a prebuild/rebuild is required after
// adding new ones, a JS-only change isn't enough.
//
// Each entry's `base` is the shared stem for THREE files, not one:
// `${base}.wav` (medium — the original recording, unchanged),
// `${base}_low.wav` and `${base}_high.wav` (ffmpeg-generated quieter/louder
// variants — see assets/sounds/ generation notes). All three must be listed
// in app.json's "sounds" array and the project rebuilt (prebuild) after
// adding any new ones — a JS-only change isn't enough (see SOUND_LEVELS
// comment above).
export const SOUND_LIBRARY = [
  { key: 'sound_01', label: 'Sound 1', base: 'salat_high_1' },
  { key: 'sound_02', label: 'Sound 2', base: 'salat_high_2' },
  { key: 'sound_03', label: 'Sound 3', base: 'salat_high_3' },
  { key: 'sound_04', label: 'Sound 4', base: 'salat_high_4' },
  { key: 'sound_05', label: 'Sound 5', base: 'salat_high_5' },
  { key: 'sound_06', label: 'Sound 6', base: 'salat_high_6' },
  { key: 'sound_07', label: 'Sound 7', base: 'salat_high_7' },
  { key: 'sound_08', label: 'Sound 8', base: 'salat_high_8' },
  { key: 'sound_09', label: 'Sound 9', base: 'salat_high_9' },
  { key: 'sound_10', label: 'Sound 10', base: 'salat_high_10' },
  { key: 'sound_11', label: 'Sound 11', base: 'salat_high_11' },
  { key: 'sound_12', label: 'Sound 12', base: 'salat_high_12' },
  { key: 'sound_13', label: 'Sound 13', base: 'salat_high_13' },
  { key: 'sound_14', label: 'Sound 14', base: 'salat_high_14' },
  { key: 'sound_15', label: 'Sound 15', base: 'salat_high_15' },
];

// Resolves a SOUND_LIBRARY entry + intensity level (see SOUND_LEVELS keys)
// to the actual filename that should be scheduled/played. 'medium' reuses
// the entry's original recording as-is; 'low'/'high' point at the
// generated variant. Falls back to DEFAULT_SOUND_LEVEL for an unrecognized
// level rather than returning an undefined filename.
export function getLibrarySoundFile(entry, level) {
  const safeLevel = SOUND_LEVELS[level] ? level : DEFAULT_SOUND_LEVEL;
  return safeLevel === 'medium' ? `${entry.base}.wav` : `${entry.base}_${safeLevel}.wav`;
}

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
  if (Platform.OS !== 'android') return getChannelId(soundFile);
  const channelId = getChannelId(soundFile);
  await Notifications.deleteNotificationChannelAsync(channelId).catch(() => {});
  await Notifications.setNotificationChannelAsync(channelId, {
    name: 'Prayer Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    sound: soundFile,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  return channelId;
}


// getChannelId() gives every distinct sound its own channel id, so
// switching sounds a few times leaves old, now-unused channels (e.g.
// 'reminders-salat_high_3_wav') sitting around in Android's notification
// settings — harmless functionally, but clutters Settings > Apps > this
// app > Notifications with several identical-looking "Prayer Reminders"
// entries.
//
// CALL THIS ONLY AFTER every pending notification has already been
// cancelled/rescheduled onto currentChannelId (see reminderAlerts.js's
// rescheduleAll()) — deleting a channel that a still-pending scheduled
// notification is tied to makes Android silently drop that notification
// when its time comes, instead of falling back to anything. Cleanup here
// is just tidying up channels nothing points at anymore, never a
// replacement for rescheduling first.
export async function cleanupOtherChannels(currentChannelId) {
  if (Platform.OS !== 'android') return;
  try {
    const channels = await Notifications.getNotificationChannelsAsync();
    const stale = channels.filter(
      (channel) => channel.id.startsWith(`${CHANNEL_ID}-`) && channel.id !== currentChannelId
    );
    for (const channel of stale) {
      await Notifications.deleteNotificationChannelAsync(channel.id).catch(() => {});
    }
  } catch (err) {
    console.warn('Failed to clean up stale notification channels', err.message);
  }
}