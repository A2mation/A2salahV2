import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { subscribeCoords } from '../location/locationStore';
import { light as colors } from '../theme/colors';
import * as reminderApi from '../api/api';
import { sendDateTimeAndYearAllRowsOverWifi, sendDateTimeOverWifi } from '../wifi/espWifiSync';
import {
  ESP_HOTSPOT_SSID,
  ESP_HOTSPOT_PASSWORD,
  ESP_HOTSPOT_IP,
  connectToEspHotspot,
  disconnectFromEspHotspot,
  pingEspHotspot,
} from '../wifi/espHotspot';
import { getTune } from '../tune/tuneStore';
import { applyDateTuneToTimes, applyYearRoundTimesToTimes } from '../tune/dateTuneStore';
import { applyRamadanTuneToTimes } from '../tune/ramadanTuneStore';
import { setSyncing } from '../sync/syncStatusStore';

// Turns raw {index, total} from the onProgress callbacks in espWifiSync.js
// into a clamped 0-100 whole number. Those callbacks only advance once the
// ESP32 has actually responded to that row, so this always reflects rows
// confirmed by the device, not just rows fired off.
function calcPercent(index, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((index / total) * 100)));
}

export default function EspSyncScreen() {
  const insets = useSafeAreaInsets();

  // --- WiFi (hotspot) state ---
  // The app always connects to the same fixed SSID/password
  // (ESP_HOTSPOT_SSID / ESP_HOTSPOT_PASSWORD in espHotspot.js) — no network
  // picker or manual password entry needed.
  const [hotspotConnecting, setHotspotConnecting] = useState(false);
  const [hotspotConnected, setHotspotConnected] = useState(false);

  // After any disconnect (manual tap, or the ping-poll below detecting a
  // dropped connection), the Connect button is locked for a few seconds.
  // Reconnecting immediately tends to fail — Android hasn't finished
  // releasing the previous WiFi request yet (see MIN_RECONNECT_GAP_MS in
  // espHotspot.js) — so this gives it a moment and tells the user why if
  // they tap during that window instead of just quietly failing again.
  const CONNECT_LOCK_MS = 5000;
  const [connectLocked, setConnectLocked] = useState(false);
  const connectLockTimeoutRef = React.useRef(null);

  const lockConnectButton = useCallback(() => {
    setConnectLocked(true);
    if (connectLockTimeoutRef.current) {
      clearTimeout(connectLockTimeoutRef.current);
    }
    connectLockTimeoutRef.current = setTimeout(() => {
      setConnectLocked(false);
      connectLockTimeoutRef.current = null;
    }, CONNECT_LOCK_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (connectLockTimeoutRef.current) clearTimeout(connectLockTimeoutRef.current);
    };
  }, []);
  const [wifiSending, setWifiSending] = useState(false);
  // Tracks which of the 4 rows (Prayer+Azan, Prayer+Jama'at, Other+Azan,
  // Other+Jama'at) is currently being sent, so the button can show
  // "Sending… n%" instead of a plain spinner.
  const [wifiProgress, setWifiProgress] = useState({ index: 0, total: 0 });
  // True for a short window right after the last row's response comes
  // back and the whole send resolves successfully — lets the button read
  // "Done ✓ 100%" instead of just reverting the instant wifiSending flips
  // back to false.
  const [wifiDone, setWifiDone] = useState(false);
  // "Update Time" is a quick, separate 2-row send (Gregorian + Hijri
  // date/time only, no prayer data) — its own small progress/done state,
  // styled and driven the same way as the year-send button's fill bar
  // above, just over 2 steps instead of yearData.length * 4.
  const [timeSending, setTimeSending] = useState(false);
  const [timeDone, setTimeDone] = useState(false);
  const [timeProgress, setTimeProgress] = useState({ index: 0, total: 2 });

  // "Done ✓ 100%" is shown for a fixed window after a successful send, then
  // reverts back to the normal label — and the button stays disabled for
  // that same window so a user can't immediately re-trigger another send
  // while the "done" state is still being shown. Refs hold the timeout ids
  // so a still-pending revert can be cancelled if a fresh send starts.
  const DONE_DISPLAY_MS = 10000;
  const wifiDoneTimerRef = React.useRef(null);
  const timeDoneTimerRef = React.useRef(null);

  useEffect(() => {
    return () => {
      if (wifiDoneTimerRef.current) clearTimeout(wifiDoneTimerRef.current);
      if (timeDoneTimerRef.current) clearTimeout(timeDoneTimerRef.current);
    };
  }, []);

  // The ESP32's own hotspot has no internet access, and connectToEspHotspot
  // forces the phone's traffic over that WiFi link (forceWifiUsage(true)) —
  // so the backend (a2salahs.onrender.com) becomes unreachable the moment
  // the phone joins the hotspot. To avoid that, today's prayer times are
  // fetched up front, while the phone still has normal internet, and cached
  // here. The "Send" button on the WiFi tab only ever POSTs this cached
  // copy — it never re-fetches after the hotspot connects.
  const [todayData, setTodayData] = useState(null); // { date, times } | null
  const [preparingTodayData, setPreparingTodayData] = useState(false);
  const [todayDataError, setTodayDataError] = useState(null);

  // Needed for the "Send Year's Timings" button. Fetched up front for the
  // same no-internet-on-hotspot reason as todayData above.
  const [yearData, setYearData] = useState(null); // array of { date, times } | null
  const [preparingYearData, setPreparingYearData] = useState(false);
  const [yearDataError, setYearDataError] = useState(null);

  const prepareTodayData = useCallback(async () => {
    setPreparingTodayData(true);
    setTodayDataError(null);
    try {
      const { data } = await reminderApi.getTodayPrayerTimes();
      setTodayData(data);
    } catch (err) {
      setTodayData(null);
      setTodayDataError(err.message || 'Could not load prayer times.');
    } finally {
      setPreparingTodayData(false);
    }
  }, []);

  const prepareYearData = useCallback(async () => {
    setPreparingYearData(true);
    setYearDataError(null);
    try {
      const now = new Date();
      const days = await reminderApi.getYearPrayerTimes(now.getFullYear());
      // Replicate MonthPrayerScreen's exact display pipeline so the ESP32
      // gets what the chart actually shows, not just the raw backend times:
      // Ramadan tune first (no-op outside Ramadan), then year-round exact
      // time overwrites that key's clock time, then a date-specific tune
      // adds its offset on top of whatever's left.
      const effectiveDays = days.map((day) => {
        const ramadanTimes = applyRamadanTuneToTimes(day.hijri, day.times);
        const yearRoundApplied = applyYearRoundTimesToTimes(day.date, ramadanTimes);
        const effectiveTimes = applyDateTuneToTimes(day.date, yearRoundApplied);
        return { ...day, times: effectiveTimes };
      });
      setYearData(effectiveDays);  
    
    } catch (err) {
      setYearData(null);
      setYearDataError(err.message || 'Could not load year prayer times.');
    } finally {
      setPreparingYearData(false);
    }
  }, []);

  // Shared retry used by both status boxes below — always retries today's
// data first, then year's, mirroring the same safe sequencing already used
// by the initial-load effects and the GPS-update effect above. Whichever
// box the user sees, tapping Retry attempts to recover both.
const retryPrepData = useCallback(() => {
  prepareTodayData().finally(() => {
    prepareYearData();
  });
}, [prepareTodayData, prepareYearData]);

  // Fetch as soon as this screen opens — this is while the phone is still
  // on normal internet (WiFi/mobile data), well before the user connects
  // to the ESP32's no-internet hotspot.
  useEffect(() => {
    if (!todayData && !preparingTodayData && !todayDataError) {
      prepareTodayData();
    }
  }, [todayData, preparingTodayData, todayDataError, prepareTodayData]);

  useEffect(() => {
    if (!yearData && !preparingYearData && !yearDataError && (todayData || todayDataError)) {
      prepareYearData();
    }
  }, [yearData, preparingYearData, yearDataError, todayData, todayDataError, prepareYearData]);

  // Re-fetch if the GPS fix updates (e.g. an early low-accuracy fix gets
  // corrected a few seconds later) while we're still on real internet —
  // matches MonthPrayerScreen's behaviour, so the two screens don't drift
  // apart by a couple of minutes just because one cached an earlier,
  // slightly-off location than the other. Stops re-fetching the moment
  // we're on the ESP32's no-internet hotspot, same rationale as before —
  // a live fetch at that point would just hang/timeout.
  useEffect(() => {
    if (hotspotConnected) return undefined;
    const unsubscribe = subscribeCoords(() => {
      // Same reasoning as the initial-load effects above: let today's
      // small request land on its own before firing year's parallel
      // requests, so it isn't stuck queued behind them.
      prepareTodayData().finally(() => {
        prepareYearData();
      });
    });
    return unsubscribe;
  }, [hotspotConnected, prepareTodayData, prepareYearData]);

  const handleConnectHotspot = async () => {
    if (connectLocked) {
      console.log('[EspSyncScreen] handleConnectHotspot: tapped while locked, ignoring');
      Alert.alert('Please wait', 'Give it a few seconds after disconnecting before reconnecting.');
      return;
    }

    console.log('[EspSyncScreen] handleConnectHotspot: tapped, target ssid =', ESP_HOTSPOT_SSID);
    setHotspotConnecting(true);
    try {
      // Always joins the fixed ESP_HOTSPOT_SSID / ESP_HOTSPOT_PASSWORD —
      // no picker, no manual password entry.
      await connectToEspHotspot(ESP_HOTSPOT_PASSWORD, ESP_HOTSPOT_SSID);
      console.log('[EspSyncScreen] handleConnectHotspot: SUCCESS');
      setHotspotConnected(true);
    } catch (err) {
      // Logged in full so the real failure reason (permission denied, SSID
      // not found, connect timeout, ping failed, etc.) is visible in the
      // console — the alert below intentionally stays generic for the user,
      // except for the WiFi-off and Location-Services-off cases, which get
      // their own clear prompts.
      console.log('[EspSyncScreen] handleConnectHotspot: FAILED —', err?.message, err);
      if (err?.code === 'wifiDisabled') {
        Alert.alert('WiFi is off', 'Please turn on WiFi, then tap Connect to Device again.');
      } else if (err?.code === 'locationServicesOff') {
        Alert.alert(
          'Location Services is off',
          'Android requires Location Services to be turned on (in your phone\'s system settings, not just app permissions) to connect to a WiFi network. Turn it on, then tap Connect to Device again.'
        );
      } else {
        Alert.alert('No device found', 'Make sure the Device is powered on and in range, then try again.');
      }
    } finally {
      setHotspotConnecting(false);
    }
  };

  const handleDisconnectHotspot = async () => {
    await disconnectFromEspHotspot();
    setHotspotConnected(false);
    // Cleared so re-entering this flow fetches fresh prayer times (e.g. if
    // the user comes back tomorrow) rather than resending a stale cache.
    setTodayData(null);
    setTodayDataError(null);
    setYearData(null);
    setYearDataError(null);
    lockConnectButton();
  };

  // Once connected, the OS can keep reporting the WiFi link as "up" even
  // after the ESP32 itself goes away (powered off, out of range, etc.) —
  // the screen would otherwise just sit there showing "connected" forever.
  // So poll its /ping endpoint every few seconds for as long as
  // hotspotConnected is true, and flip back to the disconnected state the
  // moment it stops answering. A single miss is tolerated (one dropped
  // packet/slow response shouldn't cause a false alarm) — only two misses
  // in a row are treated as a real disconnect.
  useEffect(() => {
    if (!hotspotConnected) return undefined;

    const PING_INTERVAL_MS = 6000;
    const MAX_CONSECUTIVE_MISSES = 2;
    let consecutiveMisses = 0;
    let cancelled = false;

    const intervalId = setInterval(async () => {
      const reachable = await pingEspHotspot();
      if (cancelled) return;

      if (reachable) {
        consecutiveMisses = 0;
        return;
      }

      consecutiveMisses += 1;
      console.log('[EspSyncScreen] ping miss', consecutiveMisses, '/', MAX_CONSECUTIVE_MISSES);
      if (consecutiveMisses >= MAX_CONSECUTIVE_MISSES) {
        console.log('[EspSyncScreen] Device stopped responding, marking disconnected');
        setHotspotConnected(false);
        setTodayData(null);
        setTodayDataError(null);
        setYearData(null);
        setYearDataError(null);
        lockConnectButton();
        Alert.alert(
          'Device disconnected',
          'Lost connection to the Device. Reconnect and try again.'
        );
      }
    }, PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [hotspotConnected]);

  // Sends the device's date/time plus all 4 rows for every day of the
  // cached current year via sendDateTimeAndYearAllRowsOverWifi —
  // 365/366 days x 4 rows, so wifiProgress.total will be a big number and
  // this will take noticeably longer than the "Update Time" send.
  const handleSendYearOverWifi = async () => {
    if (!yearData) {
      Alert.alert(
        'Year data not ready',
        preparingYearData
          ? 'Still loading this year\'s prayer times — please wait a moment and try again.'
          : (yearDataError || 'Year prayer times failed to load. Disconnect, reconnect to normal WiFi, and try again.')
      );
      return;
    }
    if (!todayData) {
      Alert.alert('Date not ready', 'Still loading today\'s date — please wait a moment and try again.');
      return;
    }

    setWifiSending(true);
    setWifiDone(false);
    if (wifiDoneTimerRef.current) {
      clearTimeout(wifiDoneTimerRef.current);
      wifiDoneTimerRef.current = null;
    }
    setWifiProgress({ index: 0, total: yearData.length * 4 });
    try {
      await sendDateTimeAndYearAllRowsOverWifi(ESP_HOTSPOT_IP, todayData.hijri, yearData, getTune(), {
        onProgress: ({ dayIndex, rowIndex, rowsPerDay, totalDays }) =>
          setWifiProgress({ index: dayIndex * rowsPerDay + rowIndex + 1, total: totalDays * rowsPerDay }),
      });
      setWifiDone(true);
      wifiDoneTimerRef.current = setTimeout(() => {
        setWifiDone(false);
        wifiDoneTimerRef.current = null;
      }, DONE_DISPLAY_MS);
      Alert.alert('Done', `Sent device date/time and ${yearData.length} days of prayer times to the Device — all 4 rows each.`);
    } catch (err) {
      Alert.alert('Send failed', err?.response?.data?.message || err.message);
    } finally {
      setWifiSending(false);
    }
  };

  // "Update Time" — sends ONLY the device's current date/time (Gregorian +
  // Hijri rows), no prayer data. `todayData.hijri` is the same cached
  // value the year-send button already uses; the actual clock reading
  // (HHMMSS) is captured fresh inside sendDateTimeOverWifi right as each
  // request goes out, so it's accurate to the second regardless of how
  // long todayData has been sitting in state.
  const handleUpdateTimeOverWifi = async () => {
    if (!todayData) {
      Alert.alert('Date not ready', 'Still loading today\'s date — please wait a moment and try again.');
      return;
    }

    setTimeSending(true);
    setTimeDone(false);
    if (timeDoneTimerRef.current) {
      clearTimeout(timeDoneTimerRef.current);
      timeDoneTimerRef.current = null;
    }
    setTimeProgress({ index: 0, total: 2 });
    try {
      await sendDateTimeOverWifi(ESP_HOTSPOT_IP, todayData.hijri, {
        onProgress: (sent, total) => setTimeProgress({ index: sent, total }),
      });
      setTimeDone(true);
      timeDoneTimerRef.current = setTimeout(() => {
        setTimeDone(false);
        timeDoneTimerRef.current = null;
      }, DONE_DISPLAY_MS);
      Alert.alert('Done', 'Sent the current date and time to the Device.');
    } catch (err) {
      Alert.alert('Send failed', err?.response?.data?.message || err.message);
    } finally {
      setTimeSending(false);
    }
  };

  // Drives the fill-in-the-button effect for the Year send: 0-100 while
  // sending, pinned to 100 once wifiDone is set (so the last row's response
  // always lands on a full bar, even if integer rounding left it at 99).
  const yearSendPercent = wifiDone && !wifiSending ? 100 : calcPercent(wifiProgress.index, wifiProgress.total);
  const timeSendPercent = timeDone && !timeSending ? 100 : calcPercent(timeProgress.index, timeProgress.total);

  // True while either send is actively in flight — used to lock every
  // other button on this screen (Retry, Disconnect) so nothing can
  // interrupt or race an in-progress send to the ESP32. Deliberately does
  // NOT include wifiDone/timeDone — those are just the brief "Done ✓ 100%"
  // display window, not an active send, so other buttons stay usable then.
  const anySending = wifiSending || timeSending;

  // Mirror anySending into the shared syncStatusStore so HomeScreen (the
  // bottom nav tabs, pager swipe, and hamburger/drawer button — all
  // siblings of this screen, not parents/children of it) can also lock
  // down while a send is running. Cleared on unmount as a safety net in
  // case this screen is ever removed mid-send.
  useEffect(() => {
    setSyncing(anySending);
  }, [anySending]);
  useEffect(() => () => setSyncing(false), []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Sync to Device</Text>
      </View>

      <View style={[styles.wifiIndicator, hotspotConnected && styles.wifiIndicatorConnected]}>
        <Text style={styles.wifiIndicatorText}>
          {hotspotConnected ? 'Device Connected' : 'WiFi'}
        </Text>
      </View>

      <View style={styles.connectedBox}>
        {(preparingTodayData || todayDataError) && (
  <View style={styles.prepStatusBox}>
    {preparingTodayData ? (
      <>
        <ActivityIndicator color={colors.gold} />
        <Text style={styles.prepStatusText}>Loading today's date/time…</Text>
      </>
    ) : (
      <>
        <Text style={[styles.prepStatusText, { color: colors.textMuted }]}>
          {todayDataError}
        </Text>
        <TouchableOpacity onPress={retryPrepData} style={{ marginTop: 8 }} disabled={anySending}>
          <Text style={[styles.connectLabel, anySending && styles.disabledLabel]}>Retry</Text>
        </TouchableOpacity>
      </>
    )}
  </View>
)}
        {(preparingYearData || yearDataError) && (
          <View style={styles.prepStatusBox}>
            {preparingYearData ? (
              <>
                <ActivityIndicator color={colors.gold} />
                <Text style={styles.prepStatusText}>Loading this year's prayer times…</Text>
              </>
            ) : (
              <>
                <Text style={[styles.prepStatusText, { color: colors.textMuted }]}>
                  {yearDataError}
                </Text>
                <TouchableOpacity onPress={retryPrepData} style={{ marginTop: 8 }} disabled={anySending}>
                  <Text style={[styles.connectLabel, anySending && styles.disabledLabel]}>Retry</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {!hotspotConnected ? (
          <>
            <Text style={styles.wifiHint}>
              Make sure the Device is powered on and in range. Tap below to connect.
            </Text>

            <TouchableOpacity
              style={[styles.primaryButton, { marginTop: 12 }, connectLocked && styles.primaryButtonDimmed]}
              onPress={handleConnectHotspot}
              disabled={hotspotConnecting}
            >
              {hotspotConnecting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {connectLocked ? 'Please wait…' : 'Connect to Device'}
                </Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.deviceName}>{ESP_HOTSPOT_SSID}</Text>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { marginTop: 12, overflow: 'hidden' },
                (wifiSending || wifiDone) && styles.primaryButtonTrack,
                timeSending && styles.primaryButtonDimmed,
              ]}
              onPress={handleSendYearOverWifi}
              disabled={wifiSending || wifiDone || !yearData || anySending}
            >
              {(wifiSending || wifiDone) && (
                <View
                  pointerEvents="none"
                  style={[styles.primaryButtonFill, { width: `${yearSendPercent}%` }]}
                />
              )}
              <Text style={[styles.primaryButtonText, timeSending && styles.primaryButtonTextDimmed]}>
                {wifiSending
                  ? `Sending… ${yearSendPercent}%`
                  : wifiDone
                  ? 'Done ✓ 100%'
                  : (yearData ? "Send Year's Timings" : 'Preparing data…')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { marginTop: 12, overflow: 'hidden' },
                (timeSending || timeDone) && styles.primaryButtonTrack,
                wifiSending && styles.primaryButtonDimmed,
              ]}
              onPress={handleUpdateTimeOverWifi}
              disabled={timeSending || timeDone || !todayData || anySending}
            >
              {(timeSending || timeDone) && (
                <View
                  pointerEvents="none"
                  style={[styles.primaryButtonFill, { width: `${timeSendPercent}%` }]}
                />
              )}
              <Text style={[styles.primaryButtonText, wifiSending && styles.primaryButtonTextDimmed]}>
                {timeSending
                  ? `Sending… ${timeSendPercent}%`
                  : timeDone
                  ? 'Done ✓ 100%'
                  : (todayData ? 'Update Time' : 'Preparing data…')}
              </Text>
            </TouchableOpacity>

            {!anySending && (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleDisconnectHotspot}
              >
                <Text style={styles.secondaryButtonText}>Disconnect</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  backButton: { paddingRight: 12, paddingVertical: 4 },
  backText: { fontSize: 28, color: colors.navy },
  title: { fontSize: 20, fontWeight: '700', color: colors.navy },
  // Full-width static "WiFi" label — replaces the old two-way Bluetooth/
  // WiFi tab switcher now that WiFi is the only transport. Kept visually
  // consistent with the old active tab (gold background, white text) so
  // it still reads as "you're in the WiFi flow" rather than looking bare.
  wifiIndicator: {
    backgroundColor: colors.gold,
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  // Swaps the indicator to green with "Device Connected" text once
  // hotspotConnected is true — replaces the old separate "Connected" row
  // + dot that used to sit above the SSID.
  wifiIndicatorConnected: {
    backgroundColor: colors.success,
  },
  wifiIndicatorText: { color: colors.white, fontWeight: '600', fontSize: 14 },
  primaryButton: {
    backgroundColor: colors.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // While a WiFi send is in flight (or has just finished), the button's own
  // background becomes the "track" — a muted/translucent gold — and
  // primaryButtonFill (below) is an absolutely-positioned overlay that
  // grows left-to-right as rows get confirmed, so the button itself reads
  // as a progress bar instead of showing a separate one underneath.
  primaryButtonTrack: {
    backgroundColor: colors.goldMuted,
  },
  // Applied to whichever send button is NOT the one currently sending —
  // makes "locked out by the other send" unmistakably obvious (not just
  // unresponsive to taps) while a send is in flight. A flat gray swap
  // rather than plain opacity, since opacity alone on a gold button reads
  // as barely-different and is easy to miss, especially during a short
  // send.
  primaryButtonDimmed: {
    backgroundColor: colors.border,
    opacity: 0.6,
  },
  primaryButtonFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.gold,
  },
  primaryButtonText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  primaryButtonTextDimmed: { color: colors.textMuted },
  secondaryButton: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
  secondaryButtonText: { color: colors.textMuted, fontWeight: '600' },
  deviceName: { fontSize: 15, fontWeight: '600', color: colors.navy },
  connectLabel: { color: colors.gold, fontWeight: '700' },
  disabledLabel: { color: colors.textMuted },
  connectedBox: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wifiHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 12 },
  prepStatusBox: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  prepStatusText: { color: colors.navy, fontSize: 13, marginTop: 6, textAlign: 'center' },
});