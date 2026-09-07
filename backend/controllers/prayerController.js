
 
const { getPrayerTimes, getNextPrayer, buildDaySyncRows } = require('../utils/prayerTimes');
const { toHijri } = require('../utils/hijri');
 
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
 
const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
 
// @route GET /api/prayer/today?date=YYYY-MM-DD&lat=&lng=&method=&madhab=&city=
// No authentication: location/method/madhab come from query params (with
// sensible defaults), typically supplied by the app from device GPS.
const getToday = async (req, res) => {
  try {
    const latitude = parseFloat(req.query.lat) || 22.5726;
    const longitude = parseFloat(req.query.lng) || 88.3639;
    const methodName = req.query.method || 'Karachi';
    const madhab = req.query.madhab || 'Hanafi';
    const city = req.query.city || 'Kolkata';
 
    // Per-prayer personal tune offsets (minutes) from the "Tune Prayer
    // Timings" screen, e.g. ?tuneFajr=2&tuneAsr=-3. Missing/invalid values
    // default to 0 (no extra adjustment for that prayer).
    const parseTuneParam = (value) => {
      const n = parseInt(value, 10);
      return Number.isFinite(n) ? n : 0;
    };
    const userTune = {
      fajr: parseTuneParam(req.query.tuneFajr),
      sunrise: parseTuneParam(req.query.tuneSunrise),
      dhuhr: parseTuneParam(req.query.tuneDhuhr),
      asr: parseTuneParam(req.query.tuneAsr),
      maghrib: parseTuneParam(req.query.tuneMaghrib),
      isha: parseTuneParam(req.query.tuneIsha),
      jummah: parseTuneParam(req.query.tuneJummah),
      ishraq: parseTuneParam(req.query.tuneIshraq),
      chasht: parseTuneParam(req.query.tuneChasht),
    };
 
    const now = new Date();
    const targetDate = req.query.date ? new Date(`${req.query.date}T12:00:00`) : now;
 
    const times = await getPrayerTimes({ latitude, longitude, date: targetDate, methodName, madhab, userTune });
    const hijri = toHijri(targetDate);
 
    // Countdown to the next prayer only makes sense relative to right now,
    // so only attach it when the viewed date is actually today.
    const next = isSameDay(targetDate, now) ? getNextPrayer(times, now) : null;
 
    res.json({
      city,
      latitude,
      longitude,
      methodName,
      madhab,
      date: targetDate.toISOString().split('T')[0],
      weekday: WEEKDAYS[targetDate.getDay()],
      hijri,
      times,
      next,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
 
// @route GET /api/prayer/month?year=YYYY&month=1-12&lat=&lng=&method=&madhab=&city=
// Same query params as /today, plus year/month. Returns one entry per day
// of that month with that day's prayer times (and Hijri date), so the app
// can render a full month-wise timetable instead of a single day.
const getMonth = async (req, res) => {
  try {
    const latitude = parseFloat(req.query.lat) || 22.5726;
    const longitude = parseFloat(req.query.lng) || 88.3639;
    const methodName = req.query.method || 'Karachi';
    const madhab = req.query.madhab || 'Hanafi';
    const city = req.query.city || 'Kolkata';
 
    const parseTuneParam = (value) => {
      const n = parseInt(value, 10);
      return Number.isFinite(n) ? n : 0;
    };
    const userTune = {
      fajr: parseTuneParam(req.query.tuneFajr),
      sunrise: parseTuneParam(req.query.tuneSunrise),
      dhuhr: parseTuneParam(req.query.tuneDhuhr),
      asr: parseTuneParam(req.query.tuneAsr),
      maghrib: parseTuneParam(req.query.tuneMaghrib),
      isha: parseTuneParam(req.query.tuneIsha),
      jummah: parseTuneParam(req.query.tuneJummah),
      ishraq: parseTuneParam(req.query.tuneIshraq),
      chasht: parseTuneParam(req.query.tuneChasht),
    };
 
    const now = new Date();
    // month in query is 1-12 (human-friendly); default to the current month.
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const month = req.query.month ? parseInt(req.query.month, 10) - 1 : now.getMonth();
 
    const daysInMonth = new Date(year, month + 1, 0).getDate();
 
    const days = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const targetDate = new Date(year, month, day, 12, 0, 0);
      const times = getPrayerTimes({ latitude, longitude, date: targetDate, methodName, madhab, userTune });
      const hijri = toHijri(targetDate);
      days.push({
        date: targetDate.toISOString().split('T')[0],
        day,
        weekday: WEEKDAYS[targetDate.getDay()],
        isToday: isSameDay(targetDate, now),
        hijri,
        times,
      });
    }
 
    res.json({
      city,
      latitude,
      longitude,
      methodName,
      madhab,
      year,
      month: month + 1,
      monthName: new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long' }),
      days,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
 
// @route GET /api/prayer/day-rows?date=YYYY-MM-DD&lat=&lng=&method=&madhab=
// Returns that day's azan/jamat times as the new "long format" rows — one
// row per (prayer, azan|jamat) pair, e.g. 4 rows for Dhuhr+Asr — instead of
// the old single wide row with every prayer's azan time.
// Pass ?prayers=dhuhr,asr and matching ?jamatOffsetDhuhr=15&jamatOffsetAsr=10
// to override which prayers get jamat rows and by how many minutes.
const getDayRows = async (req, res) => {
  try {
    const latitude = parseFloat(req.query.lat) || 22.5726;
    const longitude = parseFloat(req.query.lng) || 88.3639;
    const methodName = req.query.method || 'Karachi';
    const madhab = req.query.madhab || 'Hanafi';
 
    const now = new Date();
    const targetDate = req.query.date ? new Date(`${req.query.date}T12:00:00`) : now;
 
    const times = await getPrayerTimes({ latitude, longitude, date: targetDate, methodName, madhab });
 
    // Optional overrides: ?prayers=dhuhr,asr&jamatOffsetDhuhr=15&jamatOffsetAsr=10
    let jamatConfig;
    if (req.query.prayers) {
      const prayerList = req.query.prayers.split(',').map((p) => p.trim()).filter(Boolean);
      jamatConfig = prayerList.map((prayer) => {
        const paramName = `jamatOffset${prayer.charAt(0).toUpperCase()}${prayer.slice(1)}`;
        const offset = parseInt(req.query[paramName], 10);
        return { prayer, jamatOffsetMinutes: Number.isFinite(offset) ? offset : 0 };
      });
    }
 
    const rows = buildDaySyncRows({ date: targetDate, times, jamatConfig });
    const csvLines = rows.map((r) => `${r.date},${r.prayer},${r.type},${r.time}`);
 
    res.json({
      date: targetDate.toISOString().split('T')[0],
      rows, // [{ date, prayer, type, time }, ...] — 4 rows for the default config
      csvLines, // same rows pre-formatted as "YYYYMMDD,prayer,type,time" for ESP32 sync
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
 
module.exports = { getToday, getMonth, getDayRows };