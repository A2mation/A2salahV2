// // Schedules a real system notification (with sound) for each of the user's
// // enabled reminders (see RemindersScreen) at its due time — a prayer's
// // start time, plus/minus the reminder's offset in minutes.
// //
// // Previous approach (expo-av): played a bundled sound clip via JS while
// // polling every 20s, which only worked while the app was open in the
// // foreground — closing or backgrounding the app stopped it dead, since the
// // JS thread and its setInterval loop don't run once the app isn't active.
// //
// // This version uses expo-notifications' scheduleNotificationAsync instead,
// // which hands the trigger time off to the OS (AlarmManager on Android,
// // UNUserNotificationCenter on iOS). The OS itself wakes up and delivers the
// // notification — with sound — at the scheduled time, whether the app is
// // foregrounded, backgrounded, or fully killed. Requires a custom dev/
// // preview/production build — this does NOT work in Expo Go (Expo Go
// // dropped expo-notifications support as of SDK 53).
// //
// // ReminderWatcher (mounted once in App.js, alongside LocationSync) still
// // polls every 20s — not to fire sounds directly anymore, but to keep the
// // day's schedule of pending OS notifications in sync: it (re)schedules any
// // reminder whose trigger time hasn't passed yet today, cancels ones that
// // got disabled/deleted, and cleans up stale entries once a new day starts.

// import { useEffect, useRef } from 'react';
// import * as Notifications from 'expo-notifications';
// import * as api from '../api/api';
// import { SOUND_FILE, CHANNEL_ID, ensurePermission, ensureChannel } from './notificationSetup';

// const POLL_MS = 20000;

// const PRAYER_LABELS = {
//   fajr: 'Fajr',
//   sunrise: 'Sunrise',
//   dhuhr: 'Dhuhr',
//   asr: 'Asr',
//   maghrib: 'Maghrib',
//   isha: 'Ishaa',
// };

// function todayKey(date) {
//   return date.toISOString().slice(0, 10); // YYYY-MM-DD
// }

// export default function ReminderWatcher() {
//   // fireKey (`${reminderId}-${YYYY-MM-DD}`) -> OS notification identifier
//   // for whatever's currently scheduled for that reminder today.
//   const scheduledRef = useRef(new Map());
//   const permissionGrantedRef = useRef(false);

//   useEffect(() => {
//     let cancelled = false;

//     const cancelFireKey = async (fireKey) => {
//       const id = scheduledRef.current.get(fireKey);
//       if (!id) return;
//       await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
//       scheduledRef.current.delete(fireKey);
//     };

//     const sync = async () => {
//       if (!permissionGrantedRef.current) return;
//       try {
//         const [{ data: reminders }, { data: prayerData }] = await Promise.all([
//           api.getReminders(),
//           api.getTodayPrayerTimes(),
//         ]);
//         if (cancelled) return;

//         const times = prayerData?.times;
//         if (!times || !reminders) return;

//         const now = new Date();
//         const dayKey = todayKey(now);
//         const activeKeys = new Set();

//         for (const reminder of reminders) {
//           const fireKey = `${reminder._id}-${dayKey}`;
//           activeKeys.add(fireKey);

//           if (!reminder.enabled) {
//             await cancelFireKey(fireKey);
//             continue;
//           }

//           const base = times[reminder.prayer];
//           if (!base) continue;

//           const triggerDate = new Date(new Date(base).getTime() + reminder.offsetMinutes * 60000);

//           // Already passed today, or already scheduled - nothing to do.
//           if (triggerDate.getTime() <= now.getTime()) {
//             await cancelFireKey(fireKey);
//             continue;
//           }
//           if (scheduledRef.current.has(fireKey)) continue;

//           const id = await Notifications.scheduleNotificationAsync({
//             content: {
//               title: reminder.label,
//               body: PRAYER_LABELS[reminder.prayer] || reminder.prayer,
//               sound: SOUND_FILE,
//               ...(CHANNEL_ID ? { channelId: CHANNEL_ID } : {}),
//             },
//             trigger: {
//               type: Notifications.SchedulableTriggerInputTypes.DATE,
//               date: triggerDate,
//             },
//           });
//           scheduledRef.current.set(fireKey, id);
//         }

//         // Anything still tracked from a previous sync that's no longer in
//         // today's active set (reminder deleted, or day rolled over) gets
//         // cancelled so it doesn't fire stale.
//         for (const key of Array.from(scheduledRef.current.keys())) {
//           if (!activeKeys.has(key)) {
//             await cancelFireKey(key);
//           }
//         }
//       } catch (err) {
//         console.warn('Reminder sync failed', err.message);
//       }
//     };

//     const init = async () => {
//       const granted = await ensurePermission();
//       permissionGrantedRef.current = granted;
//       if (!granted) {
//         console.warn('Notification permission not granted; reminders will not fire.');
//         return;
//       }
//       await ensureChannel();
//       sync();
//     };

//     init();
//     const interval = setInterval(sync, POLL_MS);
//     return () => {
//       cancelled = true;
//       clearInterval(interval);
//     };
//   }, []);

//   return null;
// }


// Schedules a real system notification (with sound) for each of the user's
// enabled reminders (see RemindersScreen) at its due time — a prayer's
// start time, plus/minus the reminder's offset in minutes.
//
// Previous approach (expo-av): played a bundled sound clip via JS while
// polling every 20s, which only worked while the app was open in the
// foreground — closing or backgrounding the app stopped it dead, since the
// JS thread and its setInterval loop don't run once the app isn't active.
//
// This version uses expo-notifications' scheduleNotificationAsync instead,
// which hands the trigger time off to the OS (AlarmManager on Android,
// UNUserNotificationCenter on iOS). The OS itself wakes up and delivers the
// notification — with sound — at the scheduled time, whether the app is
// foregrounded, backgrounded, or fully killed. Requires a custom dev/
// preview/production build — this does NOT work in Expo Go (Expo Go
// dropped expo-notifications support as of SDK 53).
//
// ReminderWatcher (mounted once in App.js, alongside LocationSync) still
// polls every 20s — not to fire sounds directly anymore, but to keep the
// day's schedule of pending OS notifications in sync: it (re)schedules any
// reminder whose trigger time hasn't passed yet today, cancels ones that
// got disabled/deleted, and cleans up stale entries once a new day starts.

import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as api from '../api/api';
import { CHANNEL_ID, ensurePermission, ensureChannel } from './notificationSetup';
import { loadVolumeLevel, getCurrentSoundFile, subscribeVolume } from './volumeStore';
import { loadSelectedSound, getEffectiveSoundFile, subscribeSelectedSound } from './notificationSoundStore';
import { loadMutedPrayers, isPrayerMuted, subscribeMutedPrayers } from './mutedPrayersStore';

const POLL_MS = 20000;

const PRAYER_LABELS = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Ishaa',
};

function todayKey(date) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

export default function ReminderWatcher() {
  // fireKey (`${reminderId}-${YYYY-MM-DD}`) -> OS notification identifier
  // for whatever's currently scheduled for that reminder today.
  const scheduledRef = useRef(new Map());
  const permissionGrantedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const cancelFireKey = async (fireKey) => {
      const id = scheduledRef.current.get(fireKey);
      if (!id) return;
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      scheduledRef.current.delete(fireKey);
    };

    const sync = async () => {
      if (!permissionGrantedRef.current) return;
      try {
        const [{ data: reminders }, { data: prayerData }] = await Promise.all([
          api.getReminders(),
          api.getTodayPrayerTimes(),
        ]);
        if (cancelled) return;

        const times = prayerData?.times;
        if (!times || !reminders) return;

        const now = new Date();
        const dayKey = todayKey(now);
        const activeKeys = new Set();

        for (const reminder of reminders) {
          const fireKey = `${reminder._id}-${dayKey}`;
          activeKeys.add(fireKey);

          if (!reminder.enabled || isPrayerMuted(reminder.prayer)) {
            await cancelFireKey(fireKey);
            continue;
          }

          const base = times[reminder.prayer];
          if (!base) continue;

          const triggerDate = new Date(new Date(base).getTime() + reminder.offsetMinutes * 60000);

          // Already passed today, or already scheduled - nothing to do.
          if (triggerDate.getTime() <= now.getTime()) {
            await cancelFireKey(fireKey);
            continue;
          }
          if (scheduledRef.current.has(fireKey)) continue;

          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: reminder.label,
              body: PRAYER_LABELS[reminder.prayer] || reminder.prayer,
              // Read fresh each time rather than captured once — on iOS this
              // is the value that actually determines playback (no channel
              // concept there), so a sound change should apply to any
              // reminder scheduled from this point on. Prefers the user's
              // explicit "Choose Notification Sound" pick; falls back to
              // the Volume intensity clip if they haven't picked one.
              sound: getEffectiveSoundFile(),
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: triggerDate,
              // channelId belongs on the trigger, not content — confirmed
              // against expo-notifications' DateTriggerInput type. Putting
              // it in content (as before) silently drops it, so the
              // notification never gets routed to the "reminders" channel
              // and Android 8+ falls back to the default channel's sound
              // instead of the reminders channel's custom sound.
              ...(CHANNEL_ID ? { channelId: CHANNEL_ID } : {}),
            },
          });
          scheduledRef.current.set(fireKey, id);
        }

        // Anything still tracked from a previous sync that's no longer in
        // today's active set (reminder deleted, or day rolled over) gets
        // cancelled so it doesn't fire stale.
        for (const key of Array.from(scheduledRef.current.keys())) {
          if (!activeKeys.has(key)) {
            await cancelFireKey(key);
          }
        }
      } catch (err) {
        console.warn('Reminder sync failed', err.message);
      }
    };

    const init = async () => {
      const granted = await ensurePermission();
      permissionGrantedRef.current = granted;
      if (!granted) {
        console.warn('Notification permission not granted; reminders will not fire.');
        return;
      }
      await loadVolumeLevel();
      await loadSelectedSound();
      await loadMutedPrayers();
      await ensureChannel(getEffectiveSoundFile());
      sync();
    };

    init();
    const interval = setInterval(sync, POLL_MS);
    // Android locks a channel's sound at creation time (see ensureChannel's
    // comment), so picking a new intensity from the Volume screen — or a
    // new sound from "Choose Notification Sound" — only takes effect once
    // the channel is deleted and recreated with the new file; both
    // listeners below do that immediately rather than waiting for the next
    // app launch. iOS doesn't use channels, so it doesn't need this: the
    // next scheduled reminder just reads the new file directly.
    const unsubscribeVolume = subscribeVolume(() => {
      ensureChannel(getEffectiveSoundFile());
    });
    const unsubscribeSound = subscribeSelectedSound(() => {
      ensureChannel(getEffectiveSoundFile());
    });
    // Muting/unmuting a prayer from the Prayer List screen should cancel or
    // reschedule its notifications right away, not wait up to POLL_MS for
    // the next scheduled sync.
    const unsubscribeMuted = subscribeMutedPrayers(() => {
      sync();
    });
    return () => {
      cancelled = true;
      clearInterval(interval);
      unsubscribeVolume();
      unsubscribeSound();
      unsubscribeMuted();
    };
  }, []);

  return null;
}