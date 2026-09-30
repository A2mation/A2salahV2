// Connects the phone to the ESP32's own WiFi hotspot (SoftAP) instead of
// requiring the phone and ESP32 to already share a home/router network.
//
// Flow:
//   1. ESP32 boots and broadcasts a WiFi network named ESP_HOTSPOT_SSID,
//      protected by whatever password was set in the firmware.
//   2. The app asks the user for that password (see EspSyncScreen.js),
//      then calls connectToEspHotspot(password) below, which joins the
//      network programmatically (no need to leave the app and use the
//      phone's WiFi settings).
//   3. Once joined, the ESP32 is always reachable at the fixed gateway
//      address ESP_HOTSPOT_IP — sendDayDataOverWifi (espWifiSync.js)
//      posts the JSON payload there.
//
// Requires the "react-native-wifi-reborn" package (native module — needs a
// custom dev client / prebuilt app, same as this project already does for
// Bluetooth via "munim-bluetooth"). Run `npx expo install react-native-wifi-reborn`
// and rebuild the dev client before this will work.
//
// Platform notes:
//   - Android: needs ACCESS_FINE_LOCATION (already granted for Bluetooth in
//     this app) plus ACCESS_WIFI_STATE/CHANGE_WIFI_STATE (added in app.json).
//     Because the hotspot has no internet access, Android may otherwise try
//     to route traffic over mobile data instead — forceWifiUsage(true)
//     below tells it to actually use the WiFi link for our requests.
//   - iOS: joining a password-protected network programmatically uses
//     Apple's NEHotspotConfiguration API, which requires the "Hotspot
//     Configuration" capability/entitlement enabled for this app in your
//     Apple Developer account before it will work in a real build.

import { Platform, PermissionsAndroid, Alert } from 'react-native';
import WifiManager from 'react-native-wifi-reborn';


export const ESP_HOTSPOT_SSID = 'A2_SALAH';
export const ESP_HOTSPOT_PASSWORD = 'A2_ma_tion';
export const ESP_HOTSPOT_IP = '192.168.4.1';

const CONNECT_TIMEOUT_MS = 15000;

// Track the last time we tore down a connection. Android's
// ConnectivityManager doesn't release a WifiNetworkSpecifier request
// (used by connectToProtectedSSID's joinOnce=true mode, below) instantly
// when we ask it to — there's a brief transitional window where the OS
// still considers the previous request "active". Starting a new connect
// attempt inside that window is the main reason reconnects fail/hang
// after the very first connection, so we enforce a minimum gap here.
const MIN_RECONNECT_GAP_MS = 3000;
let lastDisconnectAt = 0;

export async function ensureWifiPermissions() {
  if (Platform.OS !== 'android') {
    console.log('[espHotspot] ensureWifiPermissions: non-android platform, skipping');
    return true;
  }
  console.log('[espHotspot] ensureWifiPermissions: requesting ACCESS_FINE_LOCATION');
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Location permission is required',
      message:
        'Android requires location permission to scan for and connect to WiFi networks, ' +
        "like the Device's hotspot.",
      buttonNegative: 'Deny',
      buttonPositive: 'Allow',
    }
  );
  console.log('[espHotspot] ensureWifiPermissions: result =', granted);
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

// Lists nearby WiFi networks so the user can pick the right one themselves
// instead of the app silently assuming ESP_HOTSPOT_SSID is the only hotspot
// around — useful since other WiFi hotspots/APs may be in range too.
// Android only: iOS does not allow apps to enumerate nearby WiFi networks
// at all (a deliberate Apple privacy restriction), so this function should
// not be called on iOS — the caller should fall back to blind-joining
// ESP_HOTSPOT_SSID directly via connectToEspHotspot there instead.
export async function scanNearbyNetworks() {
  if (Platform.OS !== 'android') {
    throw new Error('Scanning for nearby networks is only available on Android.');
  }

  const hasPermission = await ensureWifiPermissions();
  if (!hasPermission) {
    throw new Error('Location permission is required to scan for WiFi networks.');
  }

  let results;
  try {
    // Forces a fresh scan rather than returning a possibly-stale cached
    // list (loadWifiList would return cached results instead).
    results = await WifiManager.reScanAndLoadWifiList();
  } catch (err) {
    if (err?.code === 'locationPermissionMissing') {
      throw new Error('Location permission is required to scan for WiFi networks.');
    }
    if (err?.code === 'locationServicesOff') {
      throw new Error('Turn on Location Services to scan for WiFi networks.');
    }
    throw new Error(err?.message || 'Could not scan for WiFi networks.');
  }

  // De-duplicate by SSID (the same network can show up once per nearby
  // access point/BSSID) and sort strongest signal first.
  const bySsid = new Map();
  for (const net of results || []) {
    if (!net.SSID) continue; // skip hidden/blank SSIDs
    const existing = bySsid.get(net.SSID);
    if (!existing || net.level > existing.level) {
      bySsid.set(net.SSID, net);
    }
  }
  return Array.from(bySsid.values()).sort((a, b) => b.level - a.level);
}

// Joins the Device's WiFi hotspot using the fixed SSID/password configured
// above. ssid/password can still be overridden by a caller if ever needed,
// but the app always uses the fixed ESP_HOTSPOT_SSID/ESP_HOTSPOT_PASSWORD.
// Throws a user-friendly Error on failure.
export async function connectToEspHotspot(password = ESP_HOTSPOT_PASSWORD, ssid = ESP_HOTSPOT_SSID) {
  const trimmedPassword = (password || '').trim();
  console.log('[espHotspot] connectToEspHotspot: starting, ssid =', JSON.stringify(ssid), 'passwordLength =', trimmedPassword.length);

  const hasPermission = await ensureWifiPermissions();
  if (!hasPermission) {
    console.log('[espHotspot] connectToEspHotspot: permission denied, aborting');
    throw new Error('Location permission is required to connect to the Device hotspot.');
  }

  // Check WiFi is actually on before attempting to join anything. On
  // Android 10+, apps can no longer toggle WiFi on/off programmatically
  // (WifiManager.setWifiEnabled was restricted starting API 29), so if it's
  // off here, the underlying connectToProtectedSSID call would eventually
  // fail with a generic library error ("On Android 10, the user has to
  // enable wifi manually") — we check up front instead so we can show a
  // clear, specific message rather than that raw library string.
  if (Platform.OS === 'android' && WifiManager.isEnabled) {
    let wifiEnabled = true;
    try {
      wifiEnabled = await WifiManager.isEnabled();
    } catch (err) {
      console.log('[espHotspot] connectToEspHotspot: isEnabled() check failed, assuming on', err?.message);
    }
    console.log('[espHotspot] connectToEspHotspot: wifiEnabled =', wifiEnabled);
    if (!wifiEnabled) {
      const err = new Error('WiFi is turned off. Please turn on WiFi, then try again.');
      err.code = 'wifiDisabled';
      throw err;
    }
  }

  // If we recently disconnected, wait out the rest of the cooldown before
  // touching WiFi again — otherwise this connect races Android's teardown
  // of the previous WifiNetworkSpecifier request and reliably fails.
  const sinceDisconnect = Date.now() - lastDisconnectAt;
  if (lastDisconnectAt && sinceDisconnect < MIN_RECONNECT_GAP_MS) {
    const waitMs = MIN_RECONNECT_GAP_MS - sinceDisconnect;
    console.log(`[espHotspot] connectToEspHotspot: waiting ${waitMs}ms reconnect cooldown before attempting`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  console.log('[espHotspot] connectToEspHotspot: permission granted, calling WifiManager.connectToProtectedSSID');

  // The very first connect attempt often fails right after the hotspot
  // appears, because Android's WiFi scan cache doesn't have a fresh entry
  // for it yet — connectToProtectedSSID rejects immediately (not a
  // timeout) when the OS doesn't already know the SSID exists. Retrying
  // connect itself (the old approach) causes a SECOND OS system dialog to
  // pop up on the retry, which is the "asks to connect twice" symptom.
  // Instead, actively scan and wait until the SSID is actually visible to
  // Android BEFORE calling connect at all, so connect only ever runs once
  // and only one system dialog appears.
  const SCAN_MAX_ATTEMPTS = 6;
  const SCAN_RETRY_DELAY_MS = 1000;
  let ssidVisible = false;

  for (let attempt = 1; attempt <= SCAN_MAX_ATTEMPTS; attempt++) {
    try {
      const list = await WifiManager.reScanAndLoadWifiList();
      if (Array.isArray(list) && list.some((n) => n?.SSID === ssid)) {
        ssidVisible = true;
        console.log(`[espHotspot] connectToEspHotspot: SSID visible after scan attempt ${attempt}/${SCAN_MAX_ATTEMPTS}`);
        break;
      }
    } catch (scanErr) {
      console.log(`[espHotspot] connectToEspHotspot: scan attempt ${attempt}/${SCAN_MAX_ATTEMPTS} failed (non-fatal)`, scanErr?.message);
    }
    if (attempt < SCAN_MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, SCAN_RETRY_DELAY_MS));
    }
  }
  if (!ssidVisible) {
    // Still attempt to connect below rather than failing outright — some
    // devices/OEMs don't reliably surface scan results even when the
    // network is right there.
    console.log('[espHotspot] connectToEspHotspot: SSID never showed up in a scan, attempting connect anyway');
  }

  let connectErr = null;
  try {
    // isWep = false (WPA/WPA2), isHidden = false (SSID is broadcast
    // normally). joinOnce = true uses Android's WifiNetworkSpecifier API
    // on Android 10+, which connects immediately for this app session
    // (one system confirmation dialog) — this used to be passed as
    // `false`, which uses the WiFi Suggestion API instead. Suggestions
    // are joined "whenever Android feels like it", not immediately, which
    // is the main reason connects were inconsistent.
    const result = await withTimeout(
      WifiManager.connectToProtectedSSID(ssid, trimmedPassword, false, true),
      CONNECT_TIMEOUT_MS,
      'Connecting to the hotspot timed out. Make sure the Device is powered on and in range.'
    );
    console.log('[espHotspot] connectToEspHotspot: connectToProtectedSSID resolved with', result);
  } catch (err) {
    connectErr = err;
    console.log('[espHotspot] connectToEspHotspot: connectToProtectedSSID FAILED', {
      message: err?.message,
      code: err?.code,
      raw: err,
    });
  }

  if (connectErr) {
    const err = connectErr;
    // Same "WiFi is off" case can also surface here (belt-and-braces, in
    // case the isEnabled() check above raced with the user toggling WiFi,
    // or on OEMs where isEnabled() isn't reliable) — recognize the
    // library's known message and normalize it to the same wifiDisabled
    // code so the caller shows one consistent message either way.
    if (err?.message?.toLowerCase().includes('enable wifi manually')) {
      const normalized = new Error('WiFi is turned off. Please turn on WiFi, then try again.');
      normalized.code = 'wifiDisabled';
      throw normalized;
    }
    // Android requires the phone's Location Services (the GPS toggle, not
    // just the ACCESS_FINE_LOCATION permission granted above) to be on
    // before it will let any app join a WiFi network programmatically —
    // scanNearbyNetworks already handles this code; normalize it the same
    // way here so the caller can show one clear, specific message instead
    // of the raw "Location service is turned off" library string.
    if (err?.code === 'locationServicesOff') {
      const normalized = new Error('Turn on Location Services (device setting, not just the app permission), then try again.');
      normalized.code = 'locationServicesOff';
      throw normalized;
    }
    throw new Error(
      err?.message ||
        'Could not connect to the hotspot. Double-check the password and that the Device is on.'
    );
  }

  // The hotspot has no internet access — without this, Android may keep
  // routing app traffic over mobile data instead of the WiFi link, so the
  // request to the ESP32 would never actually go out over WiFi.
  if (Platform.OS === 'android' && WifiManager.forceWifiUsage) {
    try {
      console.log('[espHotspot] connectToEspHotspot: calling forceWifiUsage(true)');
      await WifiManager.forceWifiUsage(true);
      console.log('[espHotspot] connectToEspHotspot: forceWifiUsage(true) succeeded');
    } catch (err) {
      console.log('[espHotspot] connectToEspHotspot: forceWifiUsage(true) failed (non-fatal)', err?.message);
    }
  }

  // Right after connectToProtectedSSID resolves, the phone has joined the
  // network at the OS level, but Android's networking stack (DHCP/routing
  // setup for the new link) usually isn't fully ready for another
  // 1-2 seconds. Pinging immediately wastes the first couple of
  // verifyEspReachable's attempts on a race we already know we'll lose,
  // which is why connecting used to visibly "fail 2-3 times" before
  // succeeding. A short settle delay here means the first ping attempt is
  // far more likely to land after routing is actually ready.
  const SETTLE_DELAY_MS = 1500;
  console.log(`[espHotspot] connectToEspHotspot: waiting ${SETTLE_DELAY_MS}ms for the network route to settle`);
  await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS));

  // Confirm we're really talking to the ESP32 (not just "connected to some
  // WiFi network") by hitting its /ping endpoint before returning success.
  console.log('[espHotspot] connectToEspHotspot: verifying reachability at', ESP_HOTSPOT_IP);
  await verifyEspReachable();
  console.log('[espHotspot] connectToEspHotspot: SUCCESS, ESP32 confirmed reachable');
}

async function verifyEspReachable() {
  const url = `http://${ESP_HOTSPOT_IP}/ping`;
  const MAX_ATTEMPTS = 4;
  const ATTEMPT_TIMEOUT_MS = 4000;
  const RETRY_DELAY_MS = 1000;

  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`[espHotspot] verifyEspReachable: attempt ${attempt}/${MAX_ATTEMPTS} fetching`, url);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      console.log('[espHotspot] verifyEspReachable: response status =', response.status, 'ok =', response.ok);
      if (!response.ok) {
        throw new Error('Device did not respond as expected.');
      }
      const body = await response.text();
     // Optional: show the response for debugging
      console.log('[espHotspot] verifyEspReachable: response body =', body);
      return; // success
    } catch (err) {
     // Optional: show the error for debugging
      console.log(`[espHotspot] verifyEspReachable: attempt ${attempt} failed: ${err.message}`);
      clearTimeout(timeoutId);
      lastErr = err;
      console.log(`[espHotspot] verifyEspReachable: attempt ${attempt} FAILED`, {
        message: err?.message,
        name: err?.name, // repeated 'AbortError'/'timeout' across all attempts usually
                          // means the ESP32's HTTP server itself isn't answering,
                          // not just a one-off routing delay
      });
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  console.log('[espHotspot] verifyEspReachable: all attempts exhausted, last error =', lastErr?.message);
  throw new Error(
    "Connected to the hotspot, but couldn't reach the Device at " +
      `${ESP_HOTSPOT_IP}. Make sure you're connected to "${ESP_HOTSPOT_SSID}" and try again.`
  );
}

export async function disconnectFromEspHotspot() {
  // Order matters here. connectToProtectedSSID(..., joinOnce=true) opens a
  // WifiNetworkSpecifier request with Android's ConnectivityManager, and
  // that request — not just the app's traffic routing — is what has to be
  // released for a clean reconnect later.
  //
  //   1. disconnect() first: this is what actually unregisters the
  //      specifier request on the OS side. Calling forceWifiUsage(false)
  //      before this was the bug — it unbinds our traffic from the
  //      network but leaves the request itself open, so the next
  //      connectToProtectedSSID call collides with a request Android
  //      still thinks is active, which is a big part of why reconnects
  //      used to fail/hang after the first connection worked fine.
  //   2. forceWifiUsage(false) after: now safe to restore normal traffic
  //      routing.
  //   3. removeWifiNetwork(): on pre-Android-10 devices (and as a
  //      belt-and-suspenders cleanup on newer ones where supported), the
  //      SSID may also be left behind as a saved network config. Removing
  //      it avoids a stale/duplicate config conflicting with the next
  //      connect attempt.
  //
  // Every step is independently best-effort (a failure in one shouldn't
  // block the others), but each is logged instead of silently swallowed —
  // this bug was invisible before precisely because failures here made no
  // noise.
  try {
    if (WifiManager.disconnect) {
      await WifiManager.disconnect();
    }
  } catch (err) {
    console.log('[espHotspot] disconnectFromEspHotspot: disconnect() failed (non-fatal)', err?.message);
  }

  try {
    if (Platform.OS === 'android' && WifiManager.forceWifiUsage) {
      await WifiManager.forceWifiUsage(false);
    }
  } catch (err) {
    console.log('[espHotspot] disconnectFromEspHotspot: forceWifiUsage(false) failed (non-fatal)', err?.message);
  }

  try {
    if (Platform.OS === 'android' && WifiManager.removeWifiNetwork) {
      await WifiManager.removeWifiNetwork(ESP_HOTSPOT_SSID);
    }
  } catch (err) {
    // Expected to no-op/fail on API levels or library versions that don't
    // support removing a WifiNetworkSpecifier-based network — not fatal.
    console.log('[espHotspot] disconnectFromEspHotspot: removeWifiNetwork() failed (non-fatal)', err?.message);
  }

  // Mark the disconnect time — connectToEspHotspot checks this against
  // MIN_RECONNECT_GAP_MS before starting the next connect attempt.
  lastDisconnectAt = Date.now();

  // Same reasoning as the SETTLE_DELAY_MS in connectToEspHotspot, just in
  // reverse: the steps above resolving doesn't mean the OS has already
  // finished tearing the request down and re-routed traffic back to
  // normal WiFi/mobile data — that takes a moment. The caller
  // (EspSyncScreen) clears its cached prayer data and immediately
  // re-fetches the instant this promise resolves, so without this delay
  // that re-fetch can fire into a dead route and hang.
  const SETTLE_DELAY_MS = 1500;
  await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS));
}

// Lightweight single-shot reachability check for periodic "is it still
// there?" polling while already connected (unlike verifyEspReachable above,
// this does NOT retry — the caller decides how to handle a single failed
// ping, e.g. only flip to "disconnected" after a couple of misses in a
// row). Resolves true if the ESP32's /ping endpoint responds OK, false on
// any error/timeout — never throws, so it's safe to call from an interval.
export async function pingEspHotspot(timeoutMs = 4000) {
  const url = `http://${ESP_HOTSPOT_IP}/ping`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch (err) {
    clearTimeout(timeoutId);
    console.log('[espHotspot] pingEspHotspot: failed', err?.message);
    return false;
  }
}

function withTimeout(promise, ms, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}