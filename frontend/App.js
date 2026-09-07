import React, { useState, useEffect, useCallback } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import useLocationOnLaunch from './src/location/useLocationOnLaunch';
import { subscribeCity, getCity } from './src/location/locationStore';
import { subscribeDrawer, getDrawerOpen, closeDrawer } from './src/drawer/drawerStore';
import DrawerMenu from './src/screens/DrawerMenu';
import ReminderWatcher from './src/notifications/reminderAlerts';
import { loadTune } from './src/tune/tuneStore';
import { loadDateTunes, loadYearRoundTimes } from './src/tune/dateTuneStore';
import { loadRamadanTune } from './src/tune/ramadanTuneStore';
// import { LogBox } from 'react-native';
//    LogBox.ignoreLogs(['expo-notifications: Android Push notifications']);

// Keep Android/iOS's native splash screen on screen (instead of letting it
// auto-dismiss the instant the JS root view attaches) until we explicitly
// call SplashScreen.hideAsync() below. This closes the blank white gap
// that otherwise appears between the native splash disappearing and our
// own SplashScreen.js / first real screen actually painting.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Requests location once on launch so prayer time calculations can use the
// device's real coordinates as soon as they're available.
function LocationSync() {
  useLocationOnLaunch();
  return null;
}

export default function App() {
  // Drawer is rendered here — as a sibling of AppNavigator, outside every
  // Stack.Screen — instead of inside HomeScreen. Rendering it inside a
  // screen put it under react-native-screens' native Screen container,
  // which conflicted with the overlay (it stayed invisible but still
  // captured every touch, freezing the whole app). Up here, it's a plain
  // top-level overlay with nothing to conflict with. HomeScreen's
  // hamburger button opens it via drawerStore instead of local state.
  const [drawerOpen, setDrawerOpen] = useState(getDrawerOpen());
  const [city, setCity] = useState(getCity() || 'Kolkata');

  useEffect(() => {
    const unsubscribeDrawer = subscribeDrawer((value) => {
      console.log('App.js: received drawer update ->', value);
      setDrawerOpen(value);
    });
    const unsubscribeCity = subscribeCity((newCity) => { if (newCity) setCity(newCity); });
    // Loads this device's saved per-prayer tune offsets from AsyncStorage
    // before the prayer-times screens' first fetch, so a returning user's
    // own tuning shows up immediately instead of defaulting to 0 until
    // they revisit Tune Prayer Timings. Not awaited — ClockScreen etc.
    // already re-fetch via subscribeTune the moment this resolves, so
    // there's nothing to block the splash hand-off on.
    loadTune();
    // Same idea, for per-date overrides saved from "Tune a Specific Date" —
    // loaded up front so the month chart can mark modified dates as soon
    // as it renders instead of flashing unmarked first.
    loadDateTunes();
    // Same idea, for the exact "every day" fixed prayer times set from
    // Tune a Date's checkbox — loaded up front so the month chart's blue
    // highlight and the fixed clock times are already correct on first
    // render instead of flashing the server's un-fixed times first.
    loadYearRoundTimes();
    // Same idea again, for the Ramadan-specific offsets saved from "Tune
    // Prayer Timings" -> Ramadan mode — loaded up front so the first
    // Ramadan day rendered already reflects it instead of a flash of
    // untuned times.
    loadRamadanTune();
    return () => {
      unsubscribeDrawer();
      unsubscribeCity();
    };
  }, []);

  const onRootLayout = useCallback(() => {
    // Root view has mounted and painted at least once — safe to hand off
    // from the native splash to our own JS SplashScreen.js now.
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <LocationSync />
      <ReminderWatcher />
      <View style={{ flex: 1 }} onLayout={onRootLayout}>
        <AppNavigator />
        <DrawerMenu visible={drawerOpen} onClose={closeDrawer} city={city} />
      </View>
    </SafeAreaProvider>
  );
}