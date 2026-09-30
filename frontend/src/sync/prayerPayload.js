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

// Tarabih has no field of its own anywhere in this app — same convention
// as MonthPrayerScreen.js: it's Isha + tune.tarabih (default 15, tunable
// in Tune Prayer Timings — see tuneStore.js's DEFAULT_TUNE). Falls back
// to that same 15 here only if tune.tarabih is missing entirely.
const TARABIH_DEFAULT_MINUTES = 15;

function isFriday(dateStr) {
  // dateStr: "YYYY-MM-DD". Parsed at noon to dodge timezone-driven
  // off-by-one-day issues near midnight.
  return new Date(`${dateStr}T12:00:00`).getDay() === 5;
}

// Builds a date -> Jummah-time lookup covering every day in `days`, where
// a Friday maps to its OWN Jummah time and every other day maps to the
// NEXT upcoming Friday's Jummah time (so Sat/Sun/Mon/Tue/Wed/Thu all point
// forward at the coming Friday, never back at the one that already
// passed). Used by the year/month send so non-Friday rows show "when is
// Jummah next", rather than the previous F0000 placeholder.
//
// Implementation: walk `days` from its LAST entry back to its FIRST,
// remembering the most recent Friday's Jummah time seen so far. Because
// the walk goes future -> past, "most recently seen Friday" at any point
// is always the closest Friday at or after the day currently being
// visited — exactly "the upcoming Friday" from that day's perspective.
// Requires `days` to be in ascending date order (true for every caller —
// api.getYearPrayerTimes/getMonthPrayerTimes build them that way).
//
// Edge case: days after the LAST Friday present in `days` (e.g. the final
// few days of a year, if no next Friday is included in this particular
// array) have no upcoming Friday to find and fall back to null — callers
// treat that the same as before (F0000), rather than reaching outside the
// given `days` into another API call just for a handful of trailing days.
export function buildUpcomingJummahMap(days) {
  const map = new Map();
  let upcomingJummah = null;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (isFriday(d.date)) {
      upcomingJummah = d.times?.jummah ?? null;
    }
    map.set(d.date, upcomingJummah);
  }
  return map;
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
//     Jummah (F) is a Friday-only prayer. On a Friday itself, F is that
//     day's own Jummah time. On any other day, F is the UPCOMING Friday's
//     Jummah time (see buildUpcomingJummahMap) when the caller supplied
//     one — otherwise it falls back to F0000.
//
// e.g. 010126,1,1,A0457,B1140,C1610,D1802,E1936,F1142  (not a Friday —
//   F is the upcoming Friday's Jummah time, not 0000)
// e.g. 060826,1,1,A0349,B1142,C1618,D1816,E1936,F1142  (a Friday — F is
//   this day's own Jummah time)
//
//   Other chart (chartFlag=0) fields, A-F — matches MonthPrayerScreen's
//   "Other" tab order. Unlike the Prayer chart, slot B's MEANING itself
//   changes between the two rows (not just its value):
//     Azan row  (azanFlag=1): A Sehri, B Tarabih, C Ishraq, D Chasht, E Zawal, F Iftar
//     Jama'at row (azanFlag=0): A Sehri, B Sunrise, C Ishraq, D Chasht, E Zawal, F Iftar
//   (Tarabih = Isha + tune.tarabih, default 15 — see
//   TARABIH_DEFAULT_MINUTES above.)
//
// day: a single entry from the array api.getYearPrayerTimes(year) returns,
// or the object returned by api.getTodayPrayerTimes() — { date, times }.
// chartFlag/azanFlag default to 1/1 (Prayers chart, Azan time) since that's
// what `day.times` holds today — pass 0 explicitly if a caller is ever
// built to send the "Other" chart or Jama'at (tuned) times instead.
// upcomingJummah: the next Friday's raw Jummah time to use on a non-Friday
// day (see buildUpcomingJummahMap above). Omit/pass null to fall back to
// the old F0000 behavior — e.g. a lone single-day send with no surrounding
// year to look ahead into.
export function buildDeviceDayPayloadRaw(day, { chartFlag = 1, azanFlag = 1, tune = {}, upcomingJummah = null } = {}) {
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
      // On Friday, use the day's own Jummah time. On any other day, use
      // the upcoming Friday's Jummah time if one was supplied — falls
      // back to null (renders as F0000) when it wasn't.
      { raw: isFriday(day.date) ? t.jummah : upcomingJummah, offset: tune.jummahEnd },
    ];
  } else {
    // Slot B differs by row, matching MonthPrayerScreen's two "Other"
    // views exactly: the Start/Azan row shows Tarabih (Isha + tune.tarabih
    // — see TARABIH_DEFAULT_MINUTES), the End/Jama'at row shows Sunrise's
    // real time instead. Ishraq/Chasht have no congregation concept at
    // all, so they're sent the same on both rows (no offset either way).
    // Sehri follows Fajr's offset, Zawal follows Dhuhr's, Iftar follows
    // Maghrib's — same convention as before.
    slots = [
      { raw: t.sehri ?? t.fajr, offset: tune.fajrEnd },
      { raw: isAzan ? applyJamaatOffset(t.isha, tune.tarabih ?? TARABIH_DEFAULT_MINUTES) : t.sunrise, offset: null },
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

  // Ishraq/Chasht (Other chart, slots C/D) have no Jama'at concept at all
  // — there's no congregation for them. Their Azan/Start row still shows
  // their real calculated time (untouched above), but their End row must
  // always read 0000, fixed, regardless of tune or raw time — NOT
  // whatever applyJamaatOffset happened to produce (which was silently
  // echoing the start time back, since their offset is always null).
  // Slot B (Sunrise on this row) is deliberately left out of this list
  // now — unlike Ishraq/Chasht, it has a real time to show on the End row
  // (set above), not a placeholder.
  if (!isPrayerChart && !isAzan) {
    fields[2] = 'C0000'; // Ishraq
    fields[3] = 'D0000'; // Chasht
  }

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


// Same 2 fields as the functions above, plus a trailing weekday field:
//   $,0,0,<HHMMSS>,<DDMMYYYY english>,<DDMMYYYY hijri>,<weekday>
// weekday is 1-7 with Monday=1 ... Sunday=7 (NOT JS's native Sunday=0
// convention — getDay() is remapped below so the device always gets this
// scheme regardless of what JS itself considers day 0).
export function buildDeviceDateTimeCombinedPayloadRaw(hijriToday, now = new Date()) {
  const hh = pad2(now.getHours());
  const mi = pad2(now.getMinutes());
  const ss = pad2(now.getSeconds());
 
  const engDD = pad2(now.getDate());
  const engMO = pad2(now.getMonth() + 1);
  const engYYYY = String(now.getFullYear());
 
  const hijDD = pad2(hijriToday?.day ?? 0);
  const hijMO = pad2(hijriToday?.month ?? 0);
  const hijYYYY = String(hijriToday?.year ?? 0);

  // now.getDay(): Sunday=0 ... Saturday=6. Device wants Monday=1 ...
  // Sunday=7, so Sunday (0) maps to 7 and every other day keeps its
  // existing JS value unchanged (Monday=1 already matches, etc.).
  const jsDay = now.getDay();
  const weekday = jsDay === 0 ? 7 : jsDay;
 
  return `$,0,0,${hh}${mi}${ss},${engDD}${engMO}${engYYYY},${hijDD}${hijMO}${hijYYYY},${weekday}`;
}
export function buildAllDeviceDayPayloads(day, tune = {}, upcomingJummah = null) {
  console.log(`[prayerPayload] buildAllDeviceDayPayloads: building 4 rows for ${day.date}`);
  const rows = [
    buildDeviceDayPayloadRaw(day, { chartFlag: 1, azanFlag: 1, tune, upcomingJummah }),
    buildDeviceDayPayloadRaw(day, { chartFlag: 1, azanFlag: 0, tune, upcomingJummah }),
    buildDeviceDayPayloadRaw(day, { chartFlag: 0, azanFlag: 1, tune, upcomingJummah }),
    buildDeviceDayPayloadRaw(day, { chartFlag: 0, azanFlag: 0, tune, upcomingJummah }),
  ];
  console.log('[prayerPayload] all 4 rows:\n' + rows.join('\n'));
  return rows;
}