// import React, { useEffect, useState, useCallback } from "react";
// import { View, Text, StyleSheet, ActivityIndicator, ScrollView, useWindowDimensions } from "react-native";
// import Svg, { Circle, Line, Text as SvgText } from "react-native-svg";
// import { useSafeAreaInsets } from "react-native-safe-area-context";
// import { light as colors } from "../theme/colors";
// import { subscribeCoords } from "../location/locationStore";
// import { getTune, subscribeTune } from "../tune/tuneStore";
// import { applyRamadanTuneToTimes, subscribeRamadanTune } from "../tune/ramadanTuneStore";
// import { getPrayerData, subscribePrayerData, setPrayerData } from "../prayer/prayerTimesStore";
// import { getYearRawDays } from "../prayer/yearRawStore";
// import { applyBaseTuneToTimes } from "../prayer/applyTune";

// // This screen was originally designed/measured against a phone around
// // 390pt wide. Every size below (clock diameter, font sizes) is expressed
// // as a fraction of that baseline and re-scaled per device by `scale`
// // (see inside the component), instead of being a fixed pixel number —
// // that's what makes the clock, text, and gaps grow or shrink together
// // instead of just staying the same absolute size on every phone
// // regardless of how big or small its screen actually is.
// const BASE_WIDTH = 390;
// const MIN_SCALE = 0.85;
// const MAX_SCALE = 1.15;
// function clamp(n, min, max) {
//   return Math.min(max, Math.max(min, n));
// }

// const BASE_SIZE = 240;
// const BASE_FACE_RADIUS = 94;
// const BASE_ARC_RADIUS = 113;
// const BASE_NUMBER_RADIUS = 79;

// const PRAYER_LABELS = {
//   fajr: "Fajr",
//   sunrise: "Sunrise",
//   dhuhr: "Zohar",
//   asr: "Asr",
//   maghrib: "Maghrib",
//   isha: "Ishaa",
// };

// function polarPoint(cx, cy, radius, angleDeg) {
//   const rad = ((angleDeg - 90) * Math.PI) / 180;
//   return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
// }

// function formatCountdown(targetIso) {
//   if (!targetIso) return "--:--:--";
//   const diffMs = new Date(targetIso).getTime() - Date.now();
//   if (diffMs <= 0) return "00:00:00";
//   const totalSec = Math.floor(diffMs / 1000);
//   const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
//   const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
//   const s = String(totalSec % 60).padStart(2, "0");
//   return `${h} : ${m} : ${s}`;
// }

// function formatTime(isoOrDate) {
//   if (!isoOrDate) return "--:--";
//   const d = new Date(isoOrDate);
//   return d
//     .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
//     .toLowerCase();
// }

// // Current digital time shown under the clock face, e.g. "9:49 AM".
// function formatNow(d) {
//   return d.toLocaleTimeString([], {
//     hour: "numeric",
//     minute: "2-digit",
//     second: "2-digit",
//   });
// }

// // English/Gregorian date, e.g. "Friday, 24 July 2026".
// function formatEnglishDate(dateStr, weekday) {
//   if (!dateStr) return "";
//   const d = new Date(`${dateStr}T12:00:00`);
//   const day = d.getDate();
//   const month = d.toLocaleDateString([], { month: "long" });
//   const year = d.getFullYear();
//   return weekday
//     ? `${weekday}, ${day} ${month} ${year}`
//     : `${day} ${month} ${year}`;
// }

// // Hijri date, e.g. "8 Muharram 1448 AH".
// function formatHijriDate(hijri) {
//   if (!hijri) return "";
//   return `${hijri.day} ${hijri.monthName} ${hijri.year} AH`;
// }

// // A prayer's default "end" (before any user tuning) is simply its own
// // start time — i.e. no window duration until the user sets one below.
// // The end-time tune offset (minutes) is added on top of that start time.
// const END_TUNE_KEY = {
//   fajr: "fajrEnd",
//   dhuhr: "dhuhrEnd",
//   asr: "asrEnd",
//   maghrib: "maghribEnd",
//   isha: "ishaEnd",
// };

// function getPrayerWindowEnd(times, prayerName, tune) {
//   const start = times?.[prayerName] ?? null;
//   if (!start) return { time: null, label: null };
//   const offsetMin = tune?.[END_TUNE_KEY[prayerName]] || 0;
//   if (!offsetMin) return { time: start, label: null };
//   const tunedEnd = new Date(new Date(start).getTime() + offsetMin * 60000);
//   return { time: tunedEnd.toISOString(), label: null };
// }

// // Builds a plain 'YYYY-MM-DD' string from the Date's LOCAL calendar fields —
// // same convention (and same reasoning) as toDateStr in DateTuneScreen.js.
// // Deliberately NOT date.toISOString().split('T')[0]: that converts to UTC
// // first, which in any positive-UTC-offset timezone can silently roll local
// // midnight back to the previous day, mismatching the `date` keys returned
// // by the backend for the days array.
// function toDateStr(date) {
//   const y = date.getFullYear();
//   const m = String(date.getMonth() + 1).padStart(2, "0");
//   const d = String(date.getDate()).padStart(2, "0");
//   return `${y}-${m}-${d}`;
// }

// // Mirrors backend/utils/prayerTimes.js's getNextPrayer() exactly, so that
// // once we're tuning raw days client-side (see fetchData below) we can work
// // out "next prayer" locally instead of relying on a `next` field the
// // backend no longer computes for us. Keep this in sync with that function
// // if its logic ever changes.
// function getNextPrayer(times, now) {
//   const order = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
//   for (const name of order) {
//     if (times?.[name] && new Date(times[name]) > now) {
//       return { name, time: times[name] };
//     }
//   }
//   return { name: "fajr", time: null };
// }

// // The 5 real daily prayers, in order. getNextPrayer (above) only ever
// // looks forward, so once a prayer's own start time has passed it stops
// // being "next" immediately — even while its (tuned) window is still open.
// // This finds that most-recently-started prayer instead, so we can tell
// // whether "now" is currently inside its start-to-end window.
// const PRAYER_ORDER = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

// function getCurrentPrayer(times, now) {
//   let current = null;
//   for (const name of PRAYER_ORDER) {
//     const start = times?.[name];
//     if (start && new Date(start) <= now) {
//       current = { name, time: start };
//     }
//   }
//   return current;
// }

// export default function ClockScreen({ pageHeight }) {
//   // pageHeight comes from HomeScreen — the actual measured space left for
//   // this tab after the header/city-row above and the bottom nav below
//   // have taken theirs (i.e. exactly "full screen minus header and
//   // footer"). Sizing the container to that known number, instead of
//   // relying on flex to resolve it (inside a horizontal ScrollView's
//   // pages, that resolution isn't always reliable) or guessing it via our
//   // own onLayout, is what makes the height deterministic and removes the
//   // rounding noise that was letting the screen scroll by a pixel or two
//   // even when nothing needed to.
//   const [contentHeight, setContentHeight] = useState(0);
//   const hasKnownHeight = pageHeight > 0;
//   const canScroll = hasKnownHeight && contentHeight > pageHeight + 8;

//   const insets = useSafeAreaInsets();

//   // Scale factor for this specific device's width, clamped so it never
//   // shrinks below 85% (keeps things legible on small phones) or grows
//   // past 115% (keeps the clock from looking oversized on tablets/large
//   // phones) of the baseline design.
//   const { width: SCREEN_WIDTH } = useWindowDimensions();
//   const scale = clamp(SCREEN_WIDTH / BASE_WIDTH, MIN_SCALE, MAX_SCALE);
//   const SIZE = Math.round(BASE_SIZE * scale);
//   const CENTER = SIZE / 2;
//   const FACE_RADIUS = Math.round(BASE_FACE_RADIUS * scale);
//   const ARC_RADIUS = Math.round(BASE_ARC_RADIUS * scale);
//   const NUMBER_RADIUS = Math.round(BASE_NUMBER_RADIUS * scale);
//   const styles = createStyles(scale);

//   // Seed from whatever Splash already prefetched — if it's there, we can
//   // skip the loading spinner entirely on first paint.
//   const [data, setData] = useState(getPrayerData());
//   const [loading, setLoading] = useState(!getPrayerData());
//   const [now, setNow] = useState(new Date());

//   // Pulls the WHOLE YEAR's raw (untuned) days from yearRawStore — which only
//   // actually calls the API on a genuine cache miss (new year, new location) —
//   // then finds today's entry and applies the user's current per-namaz tune
//   // offsets locally via applyBaseTuneToTimes, same pattern MonthPrayerScreen
//   // uses. "Next prayer" is recomputed locally too (see getNextPrayer above),
//   // since the backend only attaches that field to its own /today response,
//   // not to the raw /month days this now reads from. Net effect: tuning
//   // offsets, reopening the app on the same day, or just re-rendering costs
//   // zero extra API calls — only a new year or a real location change does.
//   const fetchData = useCallback(async () => {
//     try {
//       const now = new Date();
//       const yearDays = await getYearRawDays(now.getFullYear());
//       const todayStr = toDateStr(now);
//       const rawDay = yearDays.find((d) => d.date === todayStr);
//       if (!rawDay) {
//         setData(null);
//         return;
//       }
//       const tunedTimes = applyBaseTuneToTimes(rawDay.times, getTune());
//       const built = {
//         date: rawDay.date,
//         weekday: rawDay.weekday,
//         hijri: rawDay.hijri,
//         times: tunedTimes,
//         next: getNextPrayer(tunedTimes, now),
//       };
//       setData(built);
//       // Keep the shared prefetch cache in sync too, so PrayerListScreen (and
//       // Splash's handoff on cold start) stay consistent with what's shown here.
//       setPrayerData(built);
//     } catch (err) {
//       console.warn("Failed to fetch prayer times", err.message);
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   // Pick up the prefetched cache immediately if Splash's fetch resolves
//   // after this component has already mounted (a normal race, not an edge
//   // case, since Splash still shows for a moment as this mounts).
//   useEffect(() => {
//     const unsubscribe = subscribePrayerData((cached) => {
//       setData(cached);
//       setLoading(false);
//     });
//     return unsubscribe;
//   }, []);

//   useEffect(() => {
//     // Only fetch here if Splash didn't already hand us data — otherwise
//     // this would immediately re-request the same thing Splash just got,
//     // right as the cold Render instance is still spinning up.
//     if (!getPrayerData()) fetchData();
//   }, [fetchData]);

//   // Re-fetch whenever the device's GPS coordinates change (initial fix
//   // arriving after mount, or a location update later in the session), so
//   // the clock always reflects the current location's actual prayer times.
//   useEffect(() => {
//     const unsubscribe = subscribeCoords(() => {
//       fetchData();
//     });
//     return unsubscribe;
//   }, [fetchData]);

//   // Re-run whenever the user saves new per-namaz tune offsets from the
//   // "Tune Prayer Timings" screen. This no longer hits the network — fetchData
//   // re-tunes the already-cached raw year data locally (see prayer/applyTune.js)
//   // — it just needs to re-run so the recalculated times/next-prayer make it
//   // into `data`.
//   useEffect(() => {
//     const unsubscribe = subscribeTune(() => {
//       fetchData();
//     });
//     return unsubscribe;
//   }, [fetchData]);

//   // Ramadan offsets apply client-side on top of already-fetched `times`
//   // (see applyRamadanTuneToTimes) rather than triggering a re-fetch, so a
//   // saved change to Ramadan tune shows up instantly via a re-render — no
//   // network round trip needed like the normal-tune case above.
//   const [, forceRerender] = useState(0);
//   useEffect(() => {
//     const unsubscribe = subscribeRamadanTune(() => forceRerender((n) => n + 1));
//     return unsubscribe;
//   }, []);

//   // Drives both the live clock hands and the countdown text.
//   useEffect(() => {
//     const interval = setInterval(() => setNow(new Date()), 1000);
//     return () => clearInterval(interval);
//   }, []);

//   if (loading) {
//     return (
//       <View style={styles.center}>
//         <ActivityIndicator color={colors.gold} size="large" />
//       </View>
//     );
//   }

//   const hours = now.getHours() % 12;
//   const minutes = now.getMinutes();
//   const seconds = now.getSeconds();
//   const hourAngle = (hours + minutes / 60) * 30;
//   const minuteAngle = (minutes + seconds / 60) * 6;

//   const hourTip = polarPoint(CENTER, CENTER, FACE_RADIUS * 0.5, hourAngle);
//   const minuteTip = polarPoint(CENTER, CENTER, FACE_RADIUS * 0.75, minuteAngle);

//   // Decorative progress arc (matches the reference design's gold ring).
//   const arcCircumference = 2 * Math.PI * ARC_RADIUS;
//   const arcFraction = 300 / 360;

//   const tune = getTune();
//   const next = data?.next;

//   // Applies the saved Ramadan offsets on top of today's fetched times, but
//   // only when today's hijri date actually falls in Ramadan — every other
//   // month this just returns data?.times unchanged.
//   const times = applyRamadanTuneToTimes(data?.hijri, data?.times);

//   // If we're currently inside a just-started prayer's tuned window (start
//   // to end), show that prayer with a countdown to its end. Otherwise fall
//   // back to the normal "counting down to the next prayer's start" view.
//   const current = getCurrentPrayer(times, now);
//   const currentEnd = current
//     ? getPrayerWindowEnd(times, current.name, tune)
//     : null;
//   const inWindow = !!(
//     current &&
//     currentEnd?.time &&
//     now < new Date(currentEnd.time)
//   );

//   let displayName = null;
//   let displayStartTime = null;
//   let displayEndInfo = null;
//   let countdownTarget = null;
//   let remainingLabel = "Time Remaining";

//   if (inWindow) {
//     displayName = PRAYER_LABELS[current.name];
//     displayStartTime = current.time;
//     displayEndInfo = currentEnd;
//     countdownTarget = currentEnd.time;
//     remainingLabel = "Prayer Ends In";
//   } else if (next) {
//     displayName = PRAYER_LABELS[next.name];
//     displayStartTime = next.time;
//     displayEndInfo = getPrayerWindowEnd(times, next.name, tune);
//     countdownTarget = next.time;
//     remainingLabel = "Time Remaining";
//   }

//   return (
//     <ScrollView
//       style={[styles.container, hasKnownHeight && { height: pageHeight, flex: undefined }]}
//       contentContainerStyle={[
//         styles.contentContainer,
//         // paddingTop no longer needs insets.top — that was meant for a
//         // status bar this screen doesn't actually sit under (the header
//         // above it already accounts for that), and was adding extra,
//         // unnecessary space on top of the header gap.
//         { paddingTop: 8, paddingBottom: insets.bottom + 16 },
//       ]}
//       showsVerticalScrollIndicator={false}
//       // Static (no drag, no bounce) on any screen where the content fits
//       // within the known pageHeight; only becomes an actual scroll view
//       // if content is measured as taller than that exact space.
//       scrollEnabled={canScroll}
//       bounces={canScroll}
//       alwaysBounceVertical={canScroll}
//       overScrollMode={canScroll ? "auto" : "never"}
//       onContentSizeChange={(_, height) => setContentHeight(height)}
//     >
//       <View style={styles.dateBlock}>
//         <Text style={styles.englishDate}>
//           {formatEnglishDate(data?.date, data?.weekday)}
//         </Text>
//         <Text style={styles.hijriDate}>{formatHijriDate(data?.hijri)}</Text>
//       </View>

//       {/* Flexible gap instead of a fixed marginBottom — grows to absorb
//           extra room on a tall screen, shrinks (down to minHeight) on a
//           short one, instead of leaving a fixed-size gap that's too small
//           on some phones and leaves a dead patch of space on others. */}
//       <View style={{ flexGrow: 1, minHeight: Math.round(20 * scale) }} />

//       {/* Wrapped in an explicitly-sized View, centered via alignSelf, rather
//           than relying on the Svg element's own flexbox layout box — Svg
//           doesn't always resolve alignItems: 'center' from its parent as
//           precisely as a plain View does, which was leaving the clock
//           face measurably off-center (~18px left) even though the date
//           text above it, using the same centered container, sat exactly
//           on the true screen center. */}
//       <View style={{ width: SIZE, height: SIZE, alignSelf: "center" }}>
//         <Svg width={SIZE} height={SIZE}>
//         {/* Outer decorative gold arc */}
//         <Circle
//           cx={CENTER}
//           cy={CENTER}
//           r={ARC_RADIUS}
//           stroke={colors.gold}
//           strokeWidth={3}
//           fill="none"
//           strokeLinecap="round"
//           strokeDasharray={`${arcCircumference * arcFraction} ${arcCircumference}`}
//           rotation="-90"
//           origin={`${CENTER}, ${CENTER}`}
//         />
//         {/* Clock face */}
//         <Circle
//           cx={CENTER}
//           cy={CENTER}
//           r={FACE_RADIUS}
//           stroke={colors.border}
//           strokeWidth={1}
//           fill={colors.card}
//         />

//         {Array.from({ length: 12 }).map((_, i) => {
//           const num = i === 0 ? 12 : i;
//           const angle = i * 30;
//           const p = polarPoint(CENTER, CENTER, NUMBER_RADIUS, angle);
//           return (
//             <SvgText
//               key={i}
//               x={p.x}
//               y={p.y + 5}
//               fontSize={12}
//               fill={colors.navy}
//               textAnchor="middle"
//               opacity={0.65}
//             >
//               {num}
//             </SvgText>
//           );
//         })}

//         {/* Hour hand */}
//         <Line
//           x1={CENTER}
//           y1={CENTER}
//           x2={hourTip.x}
//           y2={hourTip.y}
//           stroke={colors.navy}
//           strokeWidth={5}
//           strokeLinecap="round"
//         />
//         {/* Minute hand */}
//         <Line
//           x1={CENTER}
//           y1={CENTER}
//           x2={minuteTip.x}
//           y2={minuteTip.y}
//           stroke={colors.navy}
//           strokeWidth={4}
//           strokeLinecap="round"
//         />
//         <Circle cx={CENTER} cy={CENTER} r={6} fill={colors.navy} />
//       </Svg>
//       </View>

//       <Text style={styles.digitalTime}>{formatNow(now)}</Text>

//       {/* A fixed (but still scale-based) gap here, not a flexible spacer —
//           a flexGrow spacer stretches by however much leftover vertical
//           room a given phone happens to have, so this gap would come out
//           a different size on a tall screen vs a short one. A set height
//           scaled the same way as the fonts keeps it visually identical
//           (proportionally) on every phone. */}
//       {/* flexGrow, not a fixed height — a fixed number can't know how
//           much room is actually left on a given phone, so on a shorter
//           screen it pushed total content past pageHeight and forced the
//           overflow-scroll fallback. flexGrow only ever spends *leftover*
//           space inside the fixed-height container, so it can never push
//           content past the bottom — giving it a bigger share (flexGrow: 3
//           vs the first gap's 1.2) than before makes it noticeably larger
//           wherever there's room, without ever causing overflow. */}
//       <View style={{ flexGrow: 5, minHeight: Math.round(60 * scale) }} />

//       {displayName ? (
//         <View style={styles.infoBlock}>
//           <Text style={styles.prayerName}>
//             {displayName}: {formatTime(displayStartTime)}
//           </Text>
//           <Text style={styles.windowRange}>
//             Azan {formatTime(displayStartTime)} · Jama"at{" "}
//             {displayEndInfo?.time
//               ? formatTime(displayEndInfo.time)
//               : displayEndInfo?.label}
//           </Text>
//           <Text style={styles.remainingLabel}>{remainingLabel}</Text>
//           <Text style={styles.countdown}>
//             {formatCountdown(countdownTarget)}
//           </Text>
//         </View>
//       ) : (
//         <View style={styles.infoBlock}>
//           <Text style={styles.prayerTime}>
//             No upcoming prayer for this date
//           </Text>
//         </View>
//       )}
//     </ScrollView>
//   );
// }

// function createStyles(scale) {
//   return StyleSheet.create({
//     center: { flex: 1, alignItems: "center", justifyContent: "center" },
//     container: { flex: 1 },
//     // flexGrow: 1 lets short content still center nicely via justifyContent
//     // when scrolling is off, while taller content is free to exceed the
//     // screen and become scrollable (see canScroll above) instead of
//     // getting clipped.
//     contentContainer: { flexGrow: 1, alignItems: "center", justifyContent: "flex-start" },
//     // marginBottom/marginTop removed — the gap on either side of the clock
//     // is now handled by the flexible spacer Views in the JSX above, so it
//     // scales with however much room the device actually has instead of
//     // being a fixed number.
//     dateBlock: { alignItems: "center" },
//     englishDate: { color: colors.navy, fontSize: Math.round(18 * scale), fontWeight: "600" },
//     hijriDate: {
//       color: colors.gold,
//       fontSize: Math.round(21 * scale),
//       fontWeight: "800",
//       marginTop: 4,
//       letterSpacing: 0.3,
//     },
//     digitalTime: {
//       color: colors.navy,
//       fontSize: Math.round(30 * scale),
//       fontWeight: "700",
//       marginTop: 8,
//     },
//     infoBlock: { alignItems: "center" },
//     prayerName: {
//       color: colors.gold,
//       fontSize: Math.round(22 * scale),
//       fontWeight: "800",
//       marginBottom: 4,
//     },
//     windowRange: {
//       color: colors.navy,
//       fontSize: Math.round(19 * scale),
//       fontWeight: "700",
//       marginBottom: 12,
//     },
//     prayerTime: { color: colors.gold, fontSize: Math.round(16 * scale), marginBottom: 16 },
//     remainingLabel: { color: colors.textMuted, fontSize: Math.round(13 * scale), marginBottom: 6 },
//     countdown: {
//       color: colors.gold,
//       fontSize: Math.round(26 * scale),
//       fontWeight: "700",
//       fontVariant: ["tabular-nums"],
//     },
//   });
// }




import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, useWindowDimensions } from "react-native";
import Svg, { Circle, Line, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { light as colors } from "../theme/colors";
import { subscribeCoords } from "../location/locationStore";
import { getTune, subscribeTune } from "../tune/tuneStore";
import { applyRamadanTuneToTimes, subscribeRamadanTune } from "../tune/ramadanTuneStore";
import {
  applyDateTuneToTimes,
  applyYearRoundTimesToTimes,
  subscribeDateTunes,
  subscribeYearRoundTimes,
} from "../tune/dateTuneStore";
import { getPrayerData, subscribePrayerData, setPrayerData } from "../prayer/prayerTimesStore";
import { getYearRawDays } from "../prayer/yearRawStore";
import { applyBaseTuneToTimes } from "../prayer/applyTune";

// This screen was originally designed/measured against a phone around
// 390pt wide. Every size below (clock diameter, font sizes) is expressed
// as a fraction of that baseline and re-scaled per device by `scale`
// (see inside the component), instead of being a fixed pixel number —
// that's what makes the clock, text, and gaps grow or shrink together
// instead of just staying the same absolute size on every phone
// regardless of how big or small its screen actually is.
const BASE_WIDTH = 390;
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.15;


function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

const BASE_SIZE = 240;
const BASE_FACE_RADIUS = 94;
const BASE_ARC_RADIUS = 113;
const BASE_NUMBER_RADIUS = 79;

const PRAYER_LABELS = {
  fajr: "Fajr",
  sunrise: "Sunrise",
  dhuhr: "Zohar",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Ishaa",
};

function polarPoint(cx, cy, radius, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function formatCountdown(targetIso) {
  if (!targetIso) return "--:--:--";
  const diffMs = new Date(targetIso).getTime() - Date.now();
  if (diffMs <= 0) return "00:00:00";
  const totalSec = Math.floor(diffMs / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${h} : ${m} : ${s}`;
}

function formatTime(isoOrDate) {
  if (!isoOrDate) return "--:--";
  const d = new Date(isoOrDate);
  return d
    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    .toLowerCase();
}

// Current digital time shown under the clock face, e.g. "9:49 AM".
function formatNow(d) {
  return d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

// English/Gregorian date, e.g. "Friday, 24 July 2026".
function formatEnglishDate(dateStr, weekday) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDate();
  const month = d.toLocaleDateString([], { month: "long" });
  const year = d.getFullYear();
  return weekday
    ? `${weekday}, ${day} ${month} ${year}`
    : `${day} ${month} ${year}`;
}

// Hijri date, e.g. "8 Muharram 1448 AH".
function formatHijriDate(hijri) {
  if (!hijri) return "";
  return `${hijri.day} ${hijri.monthName} ${hijri.year} AH`;
}

// A prayer's default "end" (before any user tuning) is simply its own
// start time — i.e. no window duration until the user sets one below.
// The end-time tune offset (minutes) is added on top of that start time.
const END_TUNE_KEY = {
  fajr: "fajrEnd",
  dhuhr: "dhuhrEnd",
  asr: "asrEnd",
  maghrib: "maghribEnd",
  isha: "ishaEnd",
};

function getPrayerWindowEnd(times, prayerName, tune) {
  const start = times?.[prayerName] ?? null;
  if (!start) return { time: null, label: null };
  const offsetMin = tune?.[END_TUNE_KEY[prayerName]] || 0;
  if (!offsetMin) return { time: start, label: null };
  const tunedEnd = new Date(new Date(start).getTime() + offsetMin * 60000);
  return { time: tunedEnd.toISOString(), label: null };
}

// Builds a plain 'YYYY-MM-DD' string from the Date's LOCAL calendar fields —
// same convention (and same reasoning) as toDateStr in DateTuneScreen.js.
// Deliberately NOT date.toISOString().split('T')[0]: that converts to UTC
// first, which in any positive-UTC-offset timezone can silently roll local
// midnight back to the previous day, mismatching the `date` keys returned
// by the backend for the days array.
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Mirrors backend/utils/prayerTimes.js's getNextPrayer() exactly, so that
// once we're tuning raw days client-side (see fetchData below) we can work
// out "next prayer" locally instead of relying on a `next` field the
// backend no longer computes for us. Keep this in sync with that function
// if its logic ever changes.
function getNextPrayer(times, now) {
  const order = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
  for (const name of order) {
    if (times?.[name] && new Date(times[name]) > now) {
      return { name, time: times[name] };
    }
  }
  return { name: "fajr", time: null };
}

// The 5 real daily prayers, in order. getNextPrayer (above) only ever
// looks forward, so once a prayer's own start time has passed it stops
// being "next" immediately — even while its (tuned) window is still open.
// This finds that most-recently-started prayer instead, so we can tell
// whether "now" is currently inside its start-to-end window.
const PRAYER_ORDER = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

function getCurrentPrayer(times, now) {
  let current = null;
  for (const name of PRAYER_ORDER) {
    const start = times?.[name];
    if (start && new Date(start) <= now) {
      current = { name, time: start };
    }
  }
  return current;
}

export default function ClockScreen({ pageHeight }) {
  // pageHeight comes from HomeScreen — the actual measured space left for
  // this tab after the header/city-row above and the bottom nav below
  // have taken theirs (i.e. exactly "full screen minus header and
  // footer"). Sizing the container to that known number, instead of
  // relying on flex to resolve it (inside a horizontal ScrollView's
  // pages, that resolution isn't always reliable) or guessing it via our
  // own onLayout, is what makes the height deterministic and removes the
  // rounding noise that was letting the screen scroll by a pixel or two
  // even when nothing needed to.
  const [contentHeight, setContentHeight] = useState(0);
  const hasKnownHeight = pageHeight > 0;
  const canScroll = hasKnownHeight && contentHeight > pageHeight + 8;

  const insets = useSafeAreaInsets();

  // Scale factor for this specific device's width, clamped so it never
  // shrinks below 85% (keeps things legible on small phones) or grows
  // past 115% (keeps the clock from looking oversized on tablets/large
  // phones) of the baseline design.
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const scale = clamp(SCREEN_WIDTH / BASE_WIDTH, MIN_SCALE, MAX_SCALE);
  const SIZE = Math.round(BASE_SIZE * scale);
  const CENTER = SIZE / 2;
  const FACE_RADIUS = Math.round(BASE_FACE_RADIUS * scale);
  const ARC_RADIUS = Math.round(BASE_ARC_RADIUS * scale);
  const NUMBER_RADIUS = Math.round(BASE_NUMBER_RADIUS * scale);
  const styles = createStyles(scale);

  // Seed from whatever Splash already prefetched — if it's there, we can
  // skip the loading spinner entirely on first paint.
  const [data, setData] = useState(getPrayerData());
  const [loading, setLoading] = useState(!getPrayerData());
  const [now, setNow] = useState(new Date());

  // Pulls the WHOLE YEAR's raw (untuned) days from yearRawStore — which only
  // actually calls the API on a genuine cache miss (new year, new location) —
  // then finds today's entry and applies the user's current per-namaz tune
  // offsets locally via applyBaseTuneToTimes, same pattern MonthPrayerScreen
  // uses. "Next prayer" is recomputed locally too (see getNextPrayer above),
  // since the backend only attaches that field to its own /today response,
  // not to the raw /month days this now reads from. Net effect: tuning
  // offsets, reopening the app on the same day, or just re-rendering costs
  // zero extra API calls — only a new year or a real location change does.



  const fetchData = useCallback(async () => {
    try {
      const now = new Date();
      const yearDays = await getYearRawDays(now.getFullYear());
      const todayStr = toDateStr(now);
      const rawDay = yearDays.find((d) => d.date === todayStr);
      if (!rawDay) {
        setData(null);
        return;
      }
      const tunedTimes = applyBaseTuneToTimes(rawDay.times, getTune());
      const built = {
        date: rawDay.date,
        weekday: rawDay.weekday,
        hijri: rawDay.hijri,
        times: tunedTimes,
        next: getNextPrayer(tunedTimes, now),
      };
      setData(built);
      // Keep the shared prefetch cache in sync too, so PrayerListScreen (and
      // Splash's handoff on cold start) stay consistent with what's shown here.
      setPrayerData(built);
    } catch (err) {
      console.warn("Failed to fetch prayer times", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Pick up the prefetched cache immediately if Splash's fetch resolves
  // after this component has already mounted (a normal race, not an edge
  // case, since Splash still shows for a moment as this mounts).
  useEffect(() => {
    const unsubscribe = subscribePrayerData((cached) => {
      setData(cached);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    // Only fetch here if Splash didn't already hand us data — otherwise
    // this would immediately re-request the same thing Splash just got,
    // right as the cold Render instance is still spinning up.
    if (!getPrayerData()) fetchData();
  }, [fetchData]);

  // Re-fetch whenever the device's GPS coordinates change (initial fix
  // arriving after mount, or a location update later in the session), so
  // the clock always reflects the current location's actual prayer times.
  useEffect(() => {
    const unsubscribe = subscribeCoords(() => {
      fetchData();
    });
    return unsubscribe;
  }, [fetchData]);

  // Re-run whenever the user saves new per-namaz tune offsets from the
  // "Tune Prayer Timings" screen. This no longer hits the network — fetchData
  // re-tunes the already-cached raw year data locally (see prayer/applyTune.js)
  // — it just needs to re-run so the recalculated times/next-prayer make it
  // into `data`.



  useEffect(() => {
    const unsubscribe = subscribeTune(() => {
      fetchData();
    });
    return unsubscribe;
  }, [fetchData]);

  // Ramadan offsets, date-specific overrides, and year-round fixed times all
  // apply client-side at render time on top of already-fetched `times` (see
  // the ramadanTimes/yearRoundApplied/times chain below), rather than
  // triggering a re-fetch — same no-network-round-trip rationale for all
  // three, mirroring the order MonthPrayerScreen already applies them in.
  const [, forceRerender] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeRamadanTune(() => forceRerender((n) => n + 1));
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeDateTunes(() => forceRerender((n) => n + 1));
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeYearRoundTimes(() => forceRerender((n) => n + 1));
    return unsubscribe;
  }, []);

  // Drives both the live clock hands and the countdown text.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
  console.log("ClockScreen times", times);
}, [times]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const hourAngle = (hours + minutes / 60) * 30;
  const minuteAngle = (minutes + seconds / 60) * 6;

  const hourTip = polarPoint(CENTER, CENTER, FACE_RADIUS * 0.5, hourAngle);
  const minuteTip = polarPoint(CENTER, CENTER, FACE_RADIUS * 0.75, minuteAngle);

  // Decorative progress arc (matches the reference design's gold ring).
  const arcCircumference = 2 * Math.PI * ARC_RADIUS;
  const arcFraction = 300 / 360;

  const tune = getTune();
  const next = data?.next;

  // Three more tune layers stack on top of today's already-fetched (and
  // regular-tuned) times, in the same order MonthPrayerScreen applies them:
  // Ramadan offsets first (a no-op outside Ramadan), then any year-round
  // fixed time OVERWRITES that key's clock time outright (not an offset —
  // see applyYearRoundTimesToTimes), then any specific-date override adds
  // its offset on top of whatever's left — so a date tuned during Ramadan,
  // or on top of a year-round time, stacks correctly instead of one
  // silently replacing another.
  const ramadanTimes = applyRamadanTuneToTimes(data?.hijri, data?.times);
  const yearRoundApplied = applyYearRoundTimesToTimes(data?.date, ramadanTimes);
  const times = applyDateTuneToTimes(data?.date, yearRoundApplied);


  // If we're currently inside a just-started prayer's tuned window (start
  // to end), show that prayer with a countdown to its end. Otherwise fall
  // back to the normal "counting down to the next prayer's start" view.
  const current = getCurrentPrayer(times, now);
  const currentEnd = current
    ? getPrayerWindowEnd(times, current.name, tune)
    : null;
  const inWindow = !!(
    current &&
    currentEnd?.time &&
    now < new Date(currentEnd.time)
  );

  let displayName = null;
  let displayStartTime = null;
  let displayEndInfo = null;
  let countdownTarget = null;
  let remainingLabel = "Time Remaining";

  if (inWindow) {
    displayName = PRAYER_LABELS[current.name];
    displayStartTime = current.time;
    displayEndInfo = currentEnd;
    countdownTarget = currentEnd.time;
    remainingLabel = "Prayer Ends In";
  } else if (next) {
    displayName = PRAYER_LABELS[next.name];
    displayStartTime = next.time;
    displayEndInfo = getPrayerWindowEnd(times, next.name, tune);
    countdownTarget = next.time;
    remainingLabel = "Time Remaining";
  }

  return (
    <ScrollView
      style={[styles.container, hasKnownHeight && { height: pageHeight, flex: undefined }]}
      contentContainerStyle={[
        styles.contentContainer,
        // paddingTop no longer needs insets.top — that was meant for a
        // status bar this screen doesn't actually sit under (the header
        // above it already accounts for that), and was adding extra,
        // unnecessary space on top of the header gap.
        { paddingTop: 8, paddingBottom: insets.bottom + 16 },
      ]}
      showsVerticalScrollIndicator={false}
      // Static (no drag, no bounce) on any screen where the content fits
      // within the known pageHeight; only becomes an actual scroll view
      // if content is measured as taller than that exact space.
      scrollEnabled={canScroll}
      bounces={canScroll}
      alwaysBounceVertical={canScroll}
      overScrollMode={canScroll ? "auto" : "never"}
      onContentSizeChange={(_, height) => setContentHeight(height)}
    >
      <View style={styles.dateBlock}>
        <Text style={styles.englishDate}>
          {formatEnglishDate(data?.date, data?.weekday)}
        </Text>
        <Text style={styles.hijriDate}>{formatHijriDate(data?.hijri)}</Text>
      </View>

      {/* Flexible gap instead of a fixed marginBottom — grows to absorb
          extra room on a tall screen, shrinks (down to minHeight) on a
          short one, instead of leaving a fixed-size gap that's too small
          on some phones and leaves a dead patch of space on others. */}
      <View style={{ flexGrow: 1, minHeight: Math.round(20 * scale) }} />

      {/* Wrapped in an explicitly-sized View, centered via alignSelf, rather
          than relying on the Svg element's own flexbox layout box — Svg
          doesn't always resolve alignItems: 'center' from its parent as
          precisely as a plain View does, which was leaving the clock
          face measurably off-center (~18px left) even though the date
          text above it, using the same centered container, sat exactly
          on the true screen center. */}
      <View style={{ width: SIZE, height: SIZE, alignSelf: "center" }}>
        <Svg width={SIZE} height={SIZE}>
        {/* Outer decorative gold arc */}
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={ARC_RADIUS}
          stroke={colors.gold}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${arcCircumference * arcFraction} ${arcCircumference}`}
          rotation="-90"
          origin={`${CENTER}, ${CENTER}`}
        />
        {/* Clock face */}
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={FACE_RADIUS}
          stroke={colors.border}
          strokeWidth={1}
          fill={colors.card}
        />

        {Array.from({ length: 12 }).map((_, i) => {
          const num = i === 0 ? 12 : i;
          const angle = i * 30;
          const p = polarPoint(CENTER, CENTER, NUMBER_RADIUS, angle);
          return (
            <SvgText
              key={i}
              x={p.x}
              y={p.y + 5}
              fontSize={12}
              fill={colors.navy}
              textAnchor="middle"
              opacity={0.65}
            >
              {num}
            </SvgText>
          );
        })}

        {/* Hour hand */}
        <Line
          x1={CENTER}
          y1={CENTER}
          x2={hourTip.x}
          y2={hourTip.y}
          stroke={colors.navy}
          strokeWidth={5}
          strokeLinecap="round"
        />
        {/* Minute hand */}
        <Line
          x1={CENTER}
          y1={CENTER}
          x2={minuteTip.x}
          y2={minuteTip.y}
          stroke={colors.navy}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <Circle cx={CENTER} cy={CENTER} r={6} fill={colors.navy} />
      </Svg>
      </View>

      <Text style={styles.digitalTime}>{formatNow(now)}</Text>

      {/* A fixed (but still scale-based) gap here, not a flexible spacer —
          a flexGrow spacer stretches by however much leftover vertical
          room a given phone happens to have, so this gap would come out
          a different size on a tall screen vs a short one. A set height
          scaled the same way as the fonts keeps it visually identical
          (proportionally) on every phone. */}
      {/* flexGrow, not a fixed height — a fixed number can't know how
          much room is actually left on a given phone, so on a shorter
          screen it pushed total content past pageHeight and forced the
          overflow-scroll fallback. flexGrow only ever spends *leftover*
          space inside the fixed-height container, so it can never push
          content past the bottom — giving it a bigger share (flexGrow: 3
          vs the first gap's 1.2) than before makes it noticeably larger
          wherever there's room, without ever causing overflow. */}
      <View style={{ flexGrow: 5, minHeight: Math.round(60 * scale) }} />

      {displayName ? (
        <View style={styles.infoBlock}>
          <Text style={styles.prayerName}>
            {displayName}: {formatTime(displayStartTime)}
          </Text>
          <Text style={styles.windowRange}>
            Azan {formatTime(displayStartTime)} · Jama"at{" "}
            {displayEndInfo?.time
              ? formatTime(displayEndInfo.time)
              : displayEndInfo?.label}
          </Text>
          <Text style={styles.remainingLabel}>{remainingLabel}</Text>
          <Text style={styles.countdown}>
            {formatCountdown(countdownTarget)}
          </Text>
        </View>
      ) : (
        <View style={styles.infoBlock}>
          <Text style={styles.prayerTime}>
            No upcoming prayer for this date
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function createStyles(scale) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    container: { flex: 1 },
    // flexGrow: 1 lets short content still center nicely via justifyContent
    // when scrolling is off, while taller content is free to exceed the
    // screen and become scrollable (see canScroll above) instead of
    // getting clipped.
    contentContainer: { flexGrow: 1, alignItems: "center", justifyContent: "flex-start" },
    // marginBottom/marginTop removed — the gap on either side of the clock
    // is now handled by the flexible spacer Views in the JSX above, so it
    // scales with however much room the device actually has instead of
    // being a fixed number.
    dateBlock: { alignItems: "center" },
    englishDate: { color: colors.navy, fontSize: Math.round(18 * scale), fontWeight: "600" },
    hijriDate: {
      color: colors.gold,
      fontSize: Math.round(21 * scale),
      fontWeight: "800",
      marginTop: 4,
      letterSpacing: 0.3,
    },
    digitalTime: {
      color: colors.navy,
      fontSize: Math.round(30 * scale),
      fontWeight: "700",
      marginTop: 8,
    },
    infoBlock: { alignItems: "center" },
    prayerName: {
      color: colors.gold,
      fontSize: Math.round(22 * scale),
      fontWeight: "800",
      marginBottom: 4,
    },
    windowRange: {
      color: colors.navy,
      fontSize: Math.round(19 * scale),
      fontWeight: "700",
      marginBottom: 12,
    },
    prayerTime: { color: colors.gold, fontSize: Math.round(16 * scale), marginBottom: 16 },
    remainingLabel: { color: colors.textMuted, fontSize: Math.round(13 * scale), marginBottom: 6 },
    countdown: {
      color: colors.gold,
      fontSize: Math.round(26 * scale),
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
  });
}