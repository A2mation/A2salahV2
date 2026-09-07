// Gregorian -> Hijri conversion using the standard tabular (arithmetic) Islamic calendar.
// This is an approximation (±1 day around month boundaries is normal for any tabular method,
// since the "real" Hijri calendar follows local moon sighting) but is accurate enough for
// a prayer-times app and has no external dependency.

const HIJRI_MONTHS = [
  'Muharram',
  'Safar',
  "Rabi' al-awwal",
  "Rabi' al-thani",
  'Jumada al-awwal',
  'Jumada al-thani',
  'Rajab',
  "Sha'ban",
  'Ramadan',
  'Shawwal',
  "Dhu al-Qi'dah",
  'Dhu al-Hijjah',
];

function toHijri(date) {
  // Convert Gregorian date to Julian Day Number.
  let y = date.getFullYear();
  let m = date.getMonth() + 1;
  const d = date.getDate();

  if (m < 3) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  const jd =
    Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;

  // Julian Day -> tabular Hijri date (civil/Friday epoch).
  const jdInt = Math.floor(jd) + 1;
  let l = jdInt - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
    Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l =
    l -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const hMonth = Math.floor((24 * l) / 709);
  const hDay = l - Math.floor((709 * hMonth) / 24);
  const hYear = 30 * n + j - 30;

  return {
    day: hDay,
    month: hMonth,
    monthName: HIJRI_MONTHS[hMonth - 1],
    year: hYear,
  };
}

module.exports = { toHijri };
