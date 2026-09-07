// WiFi sync with an ESP32 running a fixed server sketch (not ours to
// change) that exposes GET /send?msg=<text>, where handleSend() reads
// server.arg("msg") as a plain string. This is a plain HTTP request to the
// ESP32's own IP address (not the app's backend), so it uses axios directly
// rather than the api.js instance, which points at the backend.
//
// The ESP32 runs its own WiFi hotspot (SoftAP) rather than joining your
// router's network, so its IP is always the fixed AP gateway address
// (192.168.4.1) once the phone has joined the hotspot — see espHotspot.js
// for the join flow. ipAddress defaults to that fixed address but can still
// be overridden if you ever repurpose the firmware to join an existing
// network instead.
import {
  buildDeviceDayPayloadRaw,
  buildAllDeviceDayPayloads,
  buildDeviceDateTimePayloadRaw,
  buildDeviceHijriDateTimePayloadRaw,
} from '../sync/prayerPayload';
import axios from 'axios';
import { ESP_HOTSPOT_IP } from './espHotspot';

const TIMEOUT_MS = 15000;

// Basic sanity check before firing a request at whatever the user typed —
// catches empty/garbled input early with a clear message instead of a
// confusing network-layer error.
function isValidIp(ip) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip.trim());
}

// --- OLD: single-row-per-day senders (Prayer chart, Azan only, 1,1) ---
// Superseded by sendDayAllRowsOverWifi / sendMonthAllRowsOverWifi below,
// which send the full 4-row set (Prayer/Other x Azan/Jama'at) per day.
// Kept here, commented out, in case a single-row send is ever needed again
// (e.g. a lightweight "quick sync" option).
//
// day: a single entry from the array api.getYearPrayerTimes(year) returns
// (or api.getTodayPrayerTimes()'s response) — { date, times: {...} }.
// Sends just that one day, as a raw comma-separated string, in the "msg"
// query param of a GET to /send — matching the server's existing
// handleSend(), which reads server.arg("msg") and doesn't accept a POST
// body. axios URL-encodes the query param automatically, same as the
// server's own HTML page does client-side with encodeURIComponent.
//
// export async function sendDayDataOverWifi(ipAddress, day) {
//   const ip = (ipAddress || ESP_HOTSPOT_IP).trim();
//   if (!isValidIp(ip)) {
//     throw new Error('Enter a valid IP address, e.g. 192.168.4.1');
//   }
//
//   const row = buildDeviceDayPayloadRaw(day, { chartFlag: 1, azanFlag: 1 });
//   const url = `http://${ip}/send`;
//
//   console.log('[espWifiSync] GET', url, 'msg =', row);
//
//   const response = await axios.get(url, {
//     params: { msg: row },
//     timeout: TIMEOUT_MS,
//   });
//   return response.data; // plain text, e.g. "OK: prayer times updated for 20260101"
// }
//
// export async function sendMonthDataOverWifi(ipAddress, days, { onProgress } = {}) {
//   for (let i = 0; i < days.length; i++) {
//     const day = days[i];
//     try {
//       await sendDayDataOverWifi(ipAddress, day);
//       if (onProgress) onProgress({ index: i, total: days.length, date: day.date, success: true });
//     } catch (err) {
//       if (onProgress) onProgress({ index: i, total: days.length, date: day.date, success: false, error: err });
//       const wrapped = new Error(
//         `Failed sending ${day.date} (day ${i + 1} of ${days.length}): ${err?.response?.data?.message || err.message}`
//       );
//       wrapped.sentCount = i;
//       wrapped.failedDate = day.date;
//       wrapped.cause = err;
//       throw wrapped;
//     }
//   }
//   return { sentCount: days.length };
// }

// Sends all 4 rows for ONE day (Prayer+Azan, Prayer+Jama'at, Other+Azan,
// Other+Jama'at), strictly in that order, one HTTP request at a time —
// each row only goes out once the previous one is confirmed. Stops at the
// first failure.
export async function sendDayAllRowsOverWifi(ipAddress, day, tune = {}, { onProgress } = {}) {
  const ip = (ipAddress || ESP_HOTSPOT_IP).trim();
  if (!isValidIp(ip)) {
    throw new Error('Enter a valid IP address, e.g. 192.168.4.1');
  }

  const rows = buildAllDeviceDayPayloads(day, tune);
  const url = `http://${ip}/send`;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      console.log('[espWifiSync] GET', url, 'msg =', row);
      // eslint-disable-next-line no-await-in-loop -- intentionally sequential
      const response = await axios.get(url, { params: { msg: row }, timeout: TIMEOUT_MS });
      if (onProgress) onProgress({ index: i, total: rows.length, row, success: true, data: response.data });
    } catch (err) {
      if (onProgress) onProgress({ index: i, total: rows.length, row, success: false, error: err });
      const wrapped = new Error(`Failed sending row ${i + 1} of ${rows.length} (${row}): ${err?.response?.data?.message || err.message}`);
      wrapped.sentCount = i;
      wrapped.failedRow = row;
      throw wrapped;
    }
  }
  return { sentCount: rows.length };
}

// Sends a whole month's worth of days over WiFi — 4 rows per day (Prayer+
// Azan, Prayer+Jama'at, Other+Azan, Other+Jama'at), in date order, one HTTP
// request at a time for the entire month. Stops at the very first failure
// anywhere in the month, leaving every row already sent in place on the
// device and every row from that point on (including the rest of the
// failed day) not sent.
//
// days: array of { date, times } — e.g. one month's worth from
// api.getMonthPrayerTimes(year, month).data.days, or a slice of
// api.getYearPrayerTimes(year) filtered down to the month you want.
// tune: per-namaz Jama'at offset minutes, same shape as sendDayAllRowsOverWifi.
// onProgress: called after every row (not just every day) with enough
// detail to show something like "Day 12 of 30 — row 3/4":
//   { dayIndex, totalDays, date, rowIndex, rowsPerDay, row, success, data|error }
export async function sendMonthAllRowsOverWifi(ipAddress, days, tune = {}, { onProgress } = {}) {
  const ip = (ipAddress || ESP_HOTSPOT_IP).trim();
  if (!isValidIp(ip)) {
    throw new Error('Enter a valid IP address, e.g. 192.168.4.1');
  }

  const url = `http://${ip}/send`;
  const totalDays = days.length;
  const rowsPerDay = 4;

  for (let d = 0; d < totalDays; d++) {
    const day = days[d];
    const rows = buildAllDeviceDayPayloads(day, tune);

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      try {
        console.log('[espWifiSync] GET', url, 'msg =', row, `(day ${d + 1}/${totalDays}, row ${r + 1}/${rowsPerDay})`);
        // eslint-disable-next-line no-await-in-loop -- intentionally sequential
        const response = await axios.get(url, { params: { msg: row }, timeout: TIMEOUT_MS });
        if (onProgress) {
          onProgress({
            dayIndex: d,
            totalDays,
            date: day.date,
            rowIndex: r,
            rowsPerDay,
            row,
            success: true,
            data: response.data,
          });
        }
      } catch (err) {
        if (onProgress) {
          onProgress({
            dayIndex: d,
            totalDays,
            date: day.date,
            rowIndex: r,
            rowsPerDay,
            row,
            success: false,
            error: err,
          });
        }
        const wrapped = new Error(
          `Failed sending ${day.date}, row ${r + 1}/${rowsPerDay} (day ${d + 1} of ${totalDays}): ${err?.response?.data?.message || err.message}`
        );
        wrapped.sentDays = d; // fully-completed days before the failure
        wrapped.sentRowsInFailedDay = r; // rows completed within the failed day
        wrapped.failedDate = day.date;
        wrapped.failedRow = row;
        throw wrapped;
      }
    }
  }

  return { sentDays: totalDays, sentRows: totalDays * rowsPerDay };
}

// Sends a WHOLE YEAR's worth of days over WiFi — same 4-rows-per-day
// protocol as sendMonthAllRowsOverWifi, same one-request-at-a-time
// sequencing, same stop-on-first-failure behavior. This is really just
// sendMonthAllRowsOverWifi under a year-specific name for clarity at the
// call site — the function itself doesn't care whether `days` is 30 or
// 365/366 entries long, it just iterates whatever array it's given.
//
// days: array of { date, times } for the whole year — e.g.
// api.getYearPrayerTimes(year) (which itself just concatenates 12 months'
// worth of api.getMonthPrayerTimes calls).
// tune / onProgress: same shape as sendMonthAllRowsOverWifi.
//
// NOTE: a full year is 365-366 days x 4 rows = 1460-1464 sequential HTTP
// requests, each triggering a full-file SPIFFS rewrite on the device side
// (see upsertRow in the firmware) — expect this to take a while and to be
// more failure-prone the further into the year it gets, simply because
// there's more time for the hotspot connection to drop. Consider surfacing
// progress prominently (see onProgress) so a mid-year failure is obvious
// rather than looking like a silent hang.
export async function sendYearAllRowsOverWifi(ipAddress, days, tune = {}, { onProgress } = {}) {
  return sendMonthAllRowsOverWifi(ipAddress, days, tune, { onProgress });
}

// Sends ONLY the device's exact date/time (2 rows: Gregorian, then Hijri) —
// no prayer data. Used by the standalone "Update Time" button, separate
// from the full year-send flow below (which also sets the clock, as a
// courtesy, before sending a whole year's worth of rows).
//
// Both rows are built from the SAME captured `now` (see
// buildDeviceDateTimePayloadRaw's comment) so the Gregorian and Hijri rows
// report the identical clock time, seconds included, down to the actual
// moment each request goes out.
//
// hijriToday: { day, month, year } for today — e.g. todayData.hijri from
// api.getTodayPrayerTimes().
// onProgress(sentCount, totalCount) fires after each of the 2 rows, same
// shape as sendYearData's callback — lets the UI drive a fill-bar like the
// year-send button's.
export async function sendDateTimeOverWifi(ipAddress, hijriToday, { onProgress } = {}) {
  const ip = (ipAddress || ESP_HOTSPOT_IP).trim();
  if (!isValidIp(ip)) {
    throw new Error('Enter a valid IP address, e.g. 192.168.4.1');
  }
  const url = `http://${ip}/send`;

  const now = new Date();
  const gregorianRow = buildDeviceDateTimePayloadRaw(now);
  const hijriRow = buildDeviceHijriDateTimePayloadRaw(hijriToday, now);

  try {
    console.log('[espWifiSync] GET', url, 'msg =', gregorianRow);
    await axios.get(url, { params: { msg: gregorianRow }, timeout: TIMEOUT_MS });
    if (onProgress) onProgress(1, 2);
  } catch (err) {
    throw new Error(`Failed sending Gregorian date/time (${gregorianRow}): ${err?.response?.data?.message || err.message}`);
  }

  try {
    console.log('[espWifiSync] GET', url, 'msg =', hijriRow);
    await axios.get(url, { params: { msg: hijriRow }, timeout: TIMEOUT_MS });
    if (onProgress) onProgress(2, 2);
  } catch (err) {
    throw new Error(`Failed sending Hijri date/time (${hijriRow}): ${err?.response?.data?.message || err.message}`);
  }

  return { sentAt: now };
}

// Sends the device's exact date/time (2 rows: Gregorian, then Hijri),
// followed by a whole year's worth of prayer data (same as
// sendYearAllRowsOverWifi). The two date/time rows are built from a Date
// captured right here, immediately before each request fires — not from
// anything cached earlier (e.g. when yearData/todayData were fetched) — so
// the HHMMSS the device receives matches the actual moment the request
// goes out, down to the second. Both rows share the SAME captured moment,
// so their clock time matches even though one is Gregorian and one Hijri.
//
// hijriToday: { day, month, year } for today — e.g. todayData.hijri from
// api.getTodayPrayerTimes().
// days/tune/onProgress: same as sendYearAllRowsOverWifi.
export async function sendDateTimeAndYearAllRowsOverWifi(ipAddress, hijriToday, days, tune = {}, { onProgress } = {}) {
  await sendDateTimeOverWifi(ipAddress, hijriToday);
  return sendMonthAllRowsOverWifi(ipAddress, days, tune, { onProgress });
}