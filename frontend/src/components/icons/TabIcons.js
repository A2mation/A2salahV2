

// Tab bar icons. ReminderTabIcon is hand-drawn with react-native-svg
// primitives (unchanged, kept as-is on request). The other four load real
// .svg files from assets/icons/ via react-native-svg-transformer — see
// metro.config.js for the setup that makes `import X from '*.svg'` work.
import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

// If your .svg files use fill="currentColor" / stroke="currentColor"
// internally, the `color` prop below will recolor them for active/inactive
// state automatically. If they don't, they'll render with whatever solid
// color is baked into the file and the `color` prop will be ignored for
// tint (size/width/height still apply).
import ClockIconSvg from '../../../assets/icon/home.svg';
import ListIconSvg from '../../../assets/icon/chart.svg';
import GlobeIconSvg from '../../../assets/icon/device.svg';
import QiblaIconSvg from '../../../assets/icon/menu.svg';
import ReminderIconSvg from '../../../assets/icon/remainder.svg';

export function ClockTabIcon({ color = '#000', size = 22 }) {
  return <ClockIconSvg width={size} height={size} color={color} />;
}

export function ListTabIcon({ color = '#000', size = 22 }) {
  return <ListIconSvg width={size} height={size} color={color} />;
}


export function ReminderTabIcon({ color = '#000', size = 22 }) {
  return <ReminderIconSvg width={size} height={size} color={color} />;
}

// This was missing entirely — GlobeIconSvg was imported above but never
// wrapped/exported as a component, so `GlobeTabIcon` resolved to undefined
// wherever it was used.
export function GlobeTabIcon({ color = '#000', size = 22 }) {
  return <GlobeIconSvg width={size} height={size} color={color} />;
}

export function QiblaTabIcon({ color = '#000', size = 22 }) {
  return <QiblaIconSvg width={size} height={size} color={color} />;
}