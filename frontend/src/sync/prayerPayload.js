// Shared payload builders for sending prayer times to the ESP32. Both
// transports (Bluetooth Classic in espSync.js, WiFi in espWifiSync.js) use
// these so the date/time formatting stays identical regardless of how the
// bytes actually get to the device — Bluetooth sends a whole year as
// line-delimited CSV rows, WiFi sends one day at a time as a single raw
// CSV row.

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Formats a Date as 24-hour HH:MM — simplest for the ESP32 firmware to
// parse either as CSV text or as a JSON string field.
function toHHMM(isoOrDate) {
  if (!isoOrDate) return '--:--';
  const d = new Date(isoOrDate);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function dateCompact(dateStr) {
  return dateStr.replace(/-/g, ''); // YYYY-MM-DD -> YYYYMMDD
}

// Builds the raw comma-separated row for a single day — the same field
// order/shape as one line of the Bluetooth CSV protocol below, factored
// out so the single-day WiFi payload can reuse it directly.
//   <YYYYMMDD>,<fajr>,<sunrise>,<dhuhr>,<asr>,<maghrib>,<isha>
function buildDayRow(day) {
  const t = day.times;
  return [
    dateCompact(day.date),
    toHHMM(t.fajr),
    toHHMM(t.sunrise),
    toHHMM(t.dhuhr),
    toHHMM(t.asr),
    toHHMM(t.maghrib),
    toHHMM(t.isha),
  ].join(',');
}

// Bluetooth (Classic SPP) protocol — plain text, line-delimited:
//   BEGIN_YEAR:<year>
//   COUNT:<numberOfDays>
//   <YYYYMMDD>,<fajr>,<sunrise>,<dhuhr>,<asr>,<maghrib>,<isha>
//   ... one line per day ...
//   END_YEAR
// days: the array returned by api.getYearPrayerTimes(year).
export function buildYearPayloadLines(year, days) {
  const lines = [`BEGIN_YEAR:${year}`, `COUNT:${days.length}`];
  for (const day of days) {
    lines.push(buildDayRow(day));
  }
  lines.push('END_YEAR');
  return lines;
}

// WiFi protocol — sends ONE day at a time, as a raw comma-
// separated string body (no JSON envelope), identical in shape to a
// single Bluetooth CSV row:
//   <YYYYMMDD>,<fajr>,<sunrise>,<dhuhr>,<asr>,<maghrib>,<isha>
// day: a single entry from the array api.getYearPrayerTimes(year) returns,
// or the object returned by api.getTodayPrayerTimes().
// NOTE: this was the format for the original PrayerTimesReceiver.ino
// firmware. The device currently in use runs a different, fixed sketch
// (see buildDeviceDayPayloadRaw below) — this is kept only in case that
// firmware is used again.
export function buildDayPayloadRaw(day) {
  return buildDayRow(day);
}

function pad2Str(n) {
  return pad2(n);
}

// dateStr: "YYYY-MM-DD" -> "DDMMYY" (day, month, 2-digit year) — the date
// format the device's fixed /send handler expects.
function toDDMMYY(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}${m}${y.slice(2)}`;
}

// Compact 4-digit time with no colon, e.g. "04:57" -> "0457". Falls back
// to "0000" (not "----") when the time is missing/unavailable — e.g.
// Jummah on a day it doesn't apply — since the device expects a numeric
// HHMM in every field, not a placeholder string.
function toHHMMCompact(isoOrDate) {
  if (!isoOrDate) return '0000';
  const d = new Date(isoOrDate);
  return `${pad2Str(d.getHours())}${pad2Str(d.getMinutes())}`;
}

function applyJamaatOffset(isoOrDate, offsetMin) {
  if (!isoOrDate || !offsetMin) return isoOrDate;
  return new Date(new Date(isoOrDate).getTime() + offsetMin * 60000).toISOString();
}

function isFriday(dateStr) {
  // dateStr: "YYYY-MM-DD". Parsed at noon to dodge timezone-driven
  // off-by-one-day issues near midnight.
  return new Date(`${dateStr}T12:00:00`).getDay() === 5;
}

// Current device protocol — ONE raw comma-separated string per /send
// request (see the fixed server sketch's handleSend(), which reads
// server.arg("msg") and doesn't accept a POST body):
//
//   <DDMMYY>,<chartFlag>,<azanFlag>,A<HHMM>,B<HHMM>,C<HHMM>,D<HHMM>,E<HHMM>,F<HHMM>
//
//   DDMMYY    - date: day, month, 2-digit year (e.g. 010126 = 1 Jan 2026)
//   chartFlag - 1 = "Prayers" chart (MonthPrayerScreen), 0 = "Other" chart
//   azanFlag  - 1 = Azan (raw time), 0 = Jama'at (tuned time, per-namaz
//               offset from Tune Prayer Timings / ClockScreen) — applied
//               only to the fields that have a matching tune offset (see
//               field notes below); fields with no natural Jama'at concept
//               (Sunrise, Ishraq, Chasht) are the same on both rows.
//
//   Prayer chart (chartFlag=1) fields, A-F:
//     A Fajr, B Dhuhr, C Asr, D Maghrib, E Isha, F Jummah
//     Jummah (F) is a Friday-only prayer — on any other day of the week
//     it's sent as F0000 rather than a computed (but meaningless) time.
//
//   Other chart (chartFlag=0) fields, A-F — matches MonthPrayerScreen's
//   "Other" tab order:
//     A Sehri, B Sunrise, C Ishraq, D Chasht, E Zawal, F Iftar
//
// e.g. 010126,1,1,A0457,B1140,C1610,D1802,E1936,F0000  (not a Friday)
// e.g. 060826,1,1,A0349,B1142,C1618,D1816,E1936,F1142  (a Friday)
//
// day: a single entry from the array api.getYearPrayerTimes(year) returns,
// or the object returned by api.getTodayPrayerTimes() — { date, times }.
// chartFlag/azanFlag default to 1/1 (Prayers chart, Azan time) since that's
// what `day.times` holds today — pass 0 explicitly if a caller is ever
// built to send the "Other" chart or Jama'at (tuned) times instead.
export function buildDeviceDayPayloadRaw(day, { chartFlag = 1, azanFlag = 1, tune = {} } = {}) {
  const t = day.times;
  const isPrayerChart = Number(chartFlag) === 1;
  const isAzan = Number(azanFlag) === 1;

  // Pick the raw (Azan) time for each of the 6 slots, and (for slots that
  // have a matching tune offset) the Jama'at-adjusted time, depending on
  // which chart is being sent.
  let slots;
  if (isPrayerChart) {
    slots = [
      { raw: t.fajr, offset: tune.fajrEnd },
      { raw: t.dhuhr, offset: tune.dhuhrEnd },
      { raw: t.asr, offset: tune.asrEnd },
      { raw: t.maghrib, offset: tune.maghribEnd },
      { raw: t.isha, offset: tune.ishaEnd },
      // null on non-Fridays so it renders as F0000 regardless of azanFlag.
      { raw: isFriday(day.date) ? t.jummah : null, offset: tune.jummahEnd },
    ];
  } else {
    // Sunrise, Ishraq, and Chasht have no congregation/Jama'at concept, so
    // they're sent the same on both the Azan and Jama'at rows (no offset).
    // Sehri follows Fajr's offset, Zawal follows Dhuhr's, Iftar follows
    // Maghrib's — same convention as before.
    slots = [
      { raw: t.sehri ?? t.fajr, offset: tune.fajrEnd },
      { raw: t.sunrise, offset: null },
      { raw: t.ishraq, offset: null },
      { raw: t.chasht, offset: null },
      { raw: t.zawal, offset: tune.dhuhrEnd },
      { raw: t.iftar ?? t.maghrib, offset: tune.maghribEnd },
    ];
  }

  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const fields = slots.map(({ raw, offset }, i) => {
    const time = isAzan ? raw : applyJamaatOffset(raw, offset);
    return `${letters[i]}${toHHMMCompact(time)}`;
  });

  const row = [`$${toDDMMYY(day.date)}`, chartFlag, azanFlag, ...fields].join(',');

  console.log(
    `[prayerPayload] ${day.date} chart=${isPrayerChart ? 'Prayer' : 'Other'}(${chartFlag}) ` +
    `type=${isAzan ? 'Azan' : "Jama'at"}(${azanFlag}) ->`,
    row
  );

  return row;
}

// "Set the device's exact date & time" row — a different shape from the
// prayer-data rows above ($,0,0,... instead of $<DDMMYY>,<chartFlag>,...),
// so the fixed firmware sketch can tell the two apart:
//   $,0,0,<HHMMSS>,<DDMMYYYY>
// e.g. $,0,0,063012,12082026  ->  06:30:12 on 12 Aug 2026
//
// now: a JS Date to read the clock/date from. ALWAYS pass a freshly-created
// `new Date()` right before this is sent (not one cached from whenever
// yearData/todayData were fetched earlier) — the whole point of this row
// is that the device's clock gets set to the exact moment the request
// actually goes out, seconds included.
export function buildDeviceDateTimePayloadRaw(now = new Date()) {
  const hh = pad2(now.getHours());
  const mi = pad2(now.getMinutes());
  const ss = pad2(now.getSeconds());
  const dd = pad2(now.getDate());
  const mo = pad2(now.getMonth() + 1);
  const yyyy = String(now.getFullYear());
  return `$,0,0,${hh}${mi}${ss},${dd}${mo}${yyyy}`;
}

// Same row shape as buildDeviceDateTimePayloadRaw, but the date half is
// the Hijri date instead of the Gregorian one — hijri: { day, month,
// year }, the same shape returned alongside a day's prayer times (see
// getTodayPrayerTimes/getMonthPrayerTimes, and formatHijriDate in
// ClockScreen.js).
// now: pass the SAME Date instance used for the Gregorian row (see
// buildDeviceDateTimePayloadRaw above) so both rows report the identical
// clock time — only the calendar half differs between the two.
export function buildDeviceHijriDateTimePayloadRaw(hijri, now = new Date()) {
  const hh = pad2(now.getHours());
  const mi = pad2(now.getMinutes());
  const ss = pad2(now.getSeconds());
  const dd = pad2(hijri?.day ?? 0);
  const mo = pad2(hijri?.month ?? 0);
  const yyyy = String(hijri?.year ?? 0);
  return `$,0,0,${hh}${mi}${ss},${dd}${mo}${yyyy}`;
}

export function buildAllDeviceDayPayloads(day, tune = {}) {
  console.log(`[prayerPayload] buildAllDeviceDayPayloads: building 4 rows for ${day.date}`);
  const rows = [
    buildDeviceDayPayloadRaw(day, { chartFlag: 1, azanFlag: 1, tune }),
    buildDeviceDayPayloadRaw(day, { chartFlag: 1, azanFlag: 0, tune }),
    buildDeviceDayPayloadRaw(day, { chartFlag: 0, azanFlag: 1, tune }),
    buildDeviceDayPayloadRaw(day, { chartFlag: 0, azanFlag: 0, tune }),
  ];
  console.log('[prayerPayload] all 4 rows:\n' + rows.join('\n'));
  return rows;
}