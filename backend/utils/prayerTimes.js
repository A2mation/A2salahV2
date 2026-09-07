const { PrayTime } = require('./praytime');

// Maps our API's method names -> praytimes.org's internal method keys.
// (Kept intentionally broader than what the app currently sends, so any
// method name used elsewhere in the codebase or added later still works.)
const METHOD_MAP = {
  Karachi: 'Karachi',
  MuslimWorldLeague: 'MWL',
  MWL: 'MWL',
  ISNA: 'ISNA',
  Egyptian: 'Egypt',
  Egypt: 'Egypt',
  UmmAlQura: 'Makkah',
  Makkah: 'Makkah',
  Tehran: 'Tehran',
  Jafari: 'Jafari',
  France: 'France',
  Russia: 'Russia',
  Singapore: 'Singapore',
};

// Base tune correction (minutes) applied for every user, independent of any
// personal tuning — compensates for the astronomical calculation method vs.
// commonly-used local mosque schedules.



// const BASE_TUNE = { fajr: -6, dhuhr: 21, maghrib: 4, isha: -5 };

// Ishraq and Chasht (Duha) are voluntary prayers with no separate
// astronomical formula of their own — both are timed relative to sunrise.
// These are sensible starting defaults; userTune.ishraq / userTune.chasht
// let a person nudge them further to match their own practice.
//   Ishraq: traditionally once the sun has fully cleared the horizon,
//     roughly a spear's height up — about 15-20 minutes after sunrise.
//   Chasht (Duha): later in the forenoon, well after Ishraq and before
//     Zawal — roughly a spear-and-a-half to two spears' height, which in
//     practice tends to land somewhere around 1.5-2 hours after sunrise.
const ISHRAQ_BASE_MINUTES = 15;
const CHASHT_BASE_MINUTES = 90;

/**
 * Calculate prayer times for a given date/location using the praytimes.org
 * astronomical formulas (utils/praytime.js — MIT licensed, no external
 * package, pure offline calculation from latitude/longitude).
 *
 * methodName: one of the keys in METHOD_MAP above, e.g. 'Karachi', 'ISNA'.
 * madhab: 'Hanafi' | 'Shafi' — controls the Asr shadow-length convention.
 * userTune: optional { fajr, dhuhr, asr, maghrib, isha } minute offsets from
 *   the "Tune Prayer Timings" screen — added on top of BASE_TUNE so a user
 *   can nudge each prayer to match their local mosque without affecting the
 *   underlying calculation for everyone else.
 */
function getPrayerTimes({ latitude, longitude, date = new Date(), methodName = 'MuslimWorldLeague', madhab = 'Hanafi', userTune = {} }) {
  const methodKey = METHOD_MAP[methodName] || 'Karachi';
  const asrParam = madhab === 'Hanafi' ? 'Hanafi' : 'Standard';

  // const combinedTune = {
  //   fajr: (BASE_TUNE.fajr || 0) + (userTune.fajr || 0),
  //   sunrise: (userTune.sunrise || 0),
  //   dhuhr: (BASE_TUNE.dhuhr || 0) + (userTune.dhuhr || 0),
  //   asr: (userTune.asr || 0),
  //   maghrib: (BASE_TUNE.maghrib || 0) + (userTune.maghrib || 0),
  //   isha: (BASE_TUNE.isha || 0) + (userTune.isha || 0),
  // };


    const combinedTune = {
    fajr:  (userTune.fajr || 0),
    sunrise: (userTune.sunrise || 0),
    dhuhr:  (userTune.dhuhr || 0),
    asr: (userTune.asr || 0),
    maghrib:  (userTune.maghrib || 0),
    isha:  (userTune.isha || 0),
  };

  const praytime = new PrayTime(methodKey);
  praytime
    .location([latitude, longitude])
    .adjust({ asr: asrParam })
    .tune(combinedTune)
    .format('x'); // raw millisecond epoch timestamps, so we can build real Date objects below

  const times = praytime.times(date);

  const toDate = (ms) => (Number.isFinite(ms) ? new Date(ms) : null);
  const dateObj = date instanceof Date ? date : new Date(date);

  const dhuhrDate = toDate(times.dhuhr);
  // Jummah has no separate astronomical formula — it's Dhuhr plus however
  // long the mosque's khutbah/gathering buffer is, which is purely a user
  // preference. Default (no tune set) is exactly the Dhuhr time.
  const jummahDate = dhuhrDate
    ? new Date(dhuhrDate.getTime() + (userTune.jummah || 0) * 60000)
    : null;

  const sunriseDate = toDate(times.sunrise);
  const ishraqDate = sunriseDate
    ? new Date(sunriseDate.getTime() + (ISHRAQ_BASE_MINUTES + (userTune.ishraq || 0)) * 60000)
    : null;
  const chashtDate = sunriseDate
    ? new Date(sunriseDate.getTime() + (CHASHT_BASE_MINUTES + (userTune.chasht || 0)) * 60000)
    : null;

  return {
    date: dateObj.toISOString().split('T')[0],
    fajr: toDate(times.fajr),
    sunrise: sunriseDate,
    dhuhr: dhuhrDate,
    zawal: toDate(times.zawal),   // solar noon instant, before the Dhuhr offset/tune
    jummah: jummahDate,
    ishraq: ishraqDate,
    chasht: chashtDate,
    asr: toDate(times.asr),
    maghrib: toDate(times.maghrib),
    isha: toDate(times.isha),

    // Ramadan-facing aliases — same underlying instants, clearer names for the UI
    sehri: toDate(times.fajr),
    iftar: toDate(times.maghrib),
  };
}

/** Returns the next upcoming prayer name + time relative to "now". */
function getNextPrayer(times, now = new Date()) {
  const order = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  for (const name of order) {
    if (times[name] && times[name] > now) {
      return { name, time: times[name] };
    }
  }
  // After Isha, next prayer is tomorrow's Fajr — caller should recompute for next day if needed.
  return { name: 'fajr', time: null };
}

// Which prayers get a separate jamat (congregation) row, and how many
// minutes after azan the jamat is held for each. Only prayers listed here
// produce rows — everything else is skipped. Change this list (or pass a
// custom one into buildDaySyncRows) to track more/fewer prayers.
const DEFAULT_JAMAT_CONFIG = [
  { prayer: 'dhuhr', jamatOffsetMinutes: 15 },
  { prayer: 'asr', jamatOffsetMinutes: 10 },
];

const pad2 = (n) => String(n).padStart(2, '0');
const formatDateKey = (date) =>
  `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
const formatHHMM = (date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

/**
 * Builds the "long format" rows the ESP32 now expects: one row per
 * (prayer, azan|jamat) pair instead of one wide row per day.
 *
 * For jamatConfig = [{prayer:'dhuhr',...}, {prayer:'asr',...}] this yields
 * exactly 4 rows for the day:
 *   YYYYMMDD,dhuhr,azan,<time>
 *   YYYYMMDD,dhuhr,jamat,<time>
 *   YYYYMMDD,asr,azan,<time>
 *   YYYYMMDD,asr,jamat,<time>
 *
 * times: the object returned by getPrayerTimes().
 * date: the Date the times were computed for (used for the YYYYMMDD key).
 * jamatConfig: array of { prayer, jamatOffsetMinutes }, defaults above.
 */
function buildDaySyncRows({ date, times, jamatConfig = DEFAULT_JAMAT_CONFIG }) {
  const dateObj = date instanceof Date ? date : new Date(date);
  const dateKey = formatDateKey(dateObj);
  const rows = [];

  jamatConfig.forEach(({ prayer, jamatOffsetMinutes = 0 }) => {
    const azanTime = times[prayer];
    if (!azanTime) return; // e.g. prayer name not present in computed times

    rows.push({ date: dateKey, prayer, type: 'azan', time: formatHHMM(azanTime) });

    const jamatTime = new Date(azanTime.getTime() + jamatOffsetMinutes * 60000);
    rows.push({ date: dateKey, prayer, type: 'jamat', time: formatHHMM(jamatTime) });
  });

  return rows;
}

/** Same as buildDaySyncRows but as CSV lines ready to POST to the ESP32:
 *  "YYYYMMDD,prayer,type,HH:MM" — matches the new firmware protocol. */
function buildDaySyncCsvLines(args) {
  return buildDaySyncRows(args).map((r) => `${r.date},${r.prayer},${r.type},${r.time}`);
}

module.exports = {
  getPrayerTimes,
  getNextPrayer,
  buildDaySyncRows,
  buildDaySyncCsvLines,
  DEFAULT_JAMAT_CONFIG,
};