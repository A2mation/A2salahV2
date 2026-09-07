
import { Platform } from 'react-native';
import {
  requestBluetoothPermission,
  isBluetoothEnabled,
  startClassicScan,
  addEventListener,
  connectClassic,
  writeClassic,
  disconnectClassic,
} from 'munim-bluetooth';
import { buildYearPayloadLines } from '../sync/prayerPayload';

// Small delay between each line write so the ESP32's BluetoothSerial RX
// buffer (1KB by default on the Arduino core) has time to drain via the
// sketch's loop() before the next line arrives.
const LINE_DELAY_MS = 20;

export async function ensureBluetoothPermissions() {
  if (Platform.OS !== 'android') return false;
  return requestBluetoothPermission();
}

export { isBluetoothEnabled };

// Classic Bluetooth device discovery — resolves once discovery finishes,
// having collected devices via the classicDeviceFound event as they're found.
// The ESP32 must already be paired with the phone via Android's Bluetooth
// settings first.
export function discoverClassicDevices({ timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    const found = new Map();

    const removeFound = addEventListener('classicDeviceFound', (device) => {
      found.set(device.id, device);
    });
    const removeFinished = addEventListener('classicScanFinished', () => {
      cleanup();
      resolve(Array.from(found.values()));
    });
    const removeFailed = addEventListener('classicScanFailed', () => {
      cleanup();
      resolve(Array.from(found.values()));
    });

    const cleanup = () => {
      removeFound();
      removeFinished();
      removeFailed();
    };

    startClassicScan();

    // Safety net in case classicScanFinished never fires.
    setTimeout(() => {
      cleanup();
      resolve(Array.from(found.values()));
    }, timeoutMs);
  });
}

export async function connectToDevice(deviceId) {
  await connectClassic(deviceId);
  return deviceId;
}

// disconnectClassic (not the generic BLE disconnect()) — confirmed against
// munim-bluetooth@0.5.0's published type defs: disconnect() is scoped to
// BLE/GATT connections, while disconnectClassic() is the dedicated function
// for RFCOMM connections opened via connectClassic(). It's synchronous
// (returns void, not a Promise), so there's nothing to await/catch here.
export async function disconnectFromDevice(deviceId) {
  try {
    disconnectClassic(deviceId);
  } catch (_err) {
    // Best-effort only — mirrors the WiFi path's disconnect handling.
  }
}

function toHex(str) {
  let hex = '';
  for (let i = 0; i < str.length; i += 1) {
    hex += str.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return hex;
}

// onProgress(sentCount, totalCount) is called after each line so the UI can
// show a progress bar — sending ~365 lines with pacing takes a few seconds.
export async function sendYearData(deviceId, year, days, onProgress) {
  const lines = buildYearPayloadLines(year, days);
  for (let i = 0; i < lines.length; i += 1) {
    await writeClassic(deviceId, toHex(`${lines[i]}\n`));
    if (onProgress) onProgress(i + 1, lines.length);
    if (i < lines.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, LINE_DELAY_MS));
    }
  }
}