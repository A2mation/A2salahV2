// Mirrors the tune math in backend/utils/prayerTimes.js's getPrayerTimes()
// EXACTLY, so a day's raw (untuned) times — fetched and cached once — can
// be re-tuned locally as many times as the user adjusts their offsets,
// with zero extra API calls.
//
// Keep this in sync with the backend function if that logic ever changes:
//   fajr/sunrise/dhuhr/asr/maghrib/isha: raw time + that prayer's tune (min)
//   jummah: tuned dhuhr + tune.jummah
//   ishraq: tuned sunrise + 15 + tune.ishraq
//   chasht: tuned sunrise + 90 + tune.chasht
//   zawal: untouched (no tune concept for solar noon)
//   sehri/iftar: aliases for tuned fajr/maghrib

const MINUTE_MS = 60000;

const ISHRAQ_BASE_MINUTES = 15;
const CHASHT_BASE_MINUTES = 90;

// Adds `minutes` (may be undefined/0/negative) to an ISO string or Date,
// always returning a fresh Date (or null if there was nothing to tune).
function addMinutes(isoOrDate, minutes) {
  if (!isoOrDate) return null;
  const ms = new Date(isoOrDate).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + (minutes || 0) * MINUTE_MS);
}

/**
 * rawTimes: one day's `times` object exactly as returned by the backend
 *   when called with NO tune query params — i.e. fajr/sunrise/dhuhr/zawal/
 *   asr/maghrib/isha straight from the astronomical calculation.
 * tune: same shape as tuneStore's getTune() — { fajr, sunrise, dhuhr, asr,
 *   maghrib, isha, jummah, ishraq, chasht, ... } minute offsets.
 *
 * Returns a new times object shaped exactly like the backend's tuned
 * response (same keys: fajr, sunrise, dhuhr, zawal, jummah, ishraq, chasht,
 * asr, maghrib, isha, sehri, iftar), so it's a drop-in replacement for
 * whatever previously came from the network.
 */
export function applyBaseTuneToTimes(rawTimes, tune = {}) {
  if (!rawTimes) return rawTimes;

  const fajr = addMinutes(rawTimes.fajr, tune.fajr);
  const sunrise = addMinutes(rawTimes.sunrise, tune.sunrise);
  const dhuhr = addMinutes(rawTimes.dhuhr, tune.dhuhr);
  const asr = addMinutes(rawTimes.asr, tune.asr);
  const maghrib = addMinutes(rawTimes.maghrib, tune.maghrib);
  const isha = addMinutes(rawTimes.isha, tune.isha);

  const jummah = dhuhr ? addMinutes(dhuhr, tune.jummah) : null;
  const ishraq = sunrise ? addMinutes(sunrise, ISHRAQ_BASE_MINUTES + (tune.ishraq || 0)) : null;
  const chasht = sunrise ? addMinutes(sunrise, CHASHT_BASE_MINUTES + (tune.chasht || 0)) : null;

  return {
    date: rawTimes.date,
    fajr,
    sunrise,
    dhuhr,
    zawal: rawTimes.zawal ? new Date(rawTimes.zawal) : null,
    jummah,
    ishraq,
    chasht,
    asr,
    maghrib,
    isha,
    sehri: fajr,
    iftar: maghrib,
  };
}
