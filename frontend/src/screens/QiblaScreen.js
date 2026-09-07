import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { light as colors } from '../theme/colors';
import { getCoords, subscribeCoords } from '../location/locationStore';

const MAKKAH = { latitude: 21.4225, longitude: 39.8262 };

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad) {
  return (rad * 180) / Math.PI;
}

function getBearing(start, destination) {
  const φ1 = toRadians(start.latitude);
  const φ2 = toRadians(destination.latitude);
  const Δλ = toRadians(destination.longitude - start.longitude);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  return (toDegrees(θ) + 360) % 360;
}

export default function QiblaScreen() {
  const insets = useSafeAreaInsets();
  const [coords, setCoordsState] = useState(getCoords());

  useEffect(() => {
    const unsubscribe = subscribeCoords((nextCoords) => {
      setCoordsState(nextCoords);
    });

    return () => unsubscribe();
  }, []);

  const bearing = useMemo(() => {
    if (!coords) return null;
    return getBearing(coords, MAKKAH);
  }, [coords]);

  const direction = bearing === null ? 'Waiting for location…' : `${Math.round(bearing)}°`;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}> 
      <Text style={styles.title}>Qibla Direction</Text>
      <Text style={styles.subtitle}>Face the direction of the Kaaba from your current location.</Text>

      <View style={styles.compassCircle}>
        <View style={styles.compassRing}>
          <View style={styles.compassCenter}>
            <Text style={styles.arrow}>↑</Text>
            <Text style={styles.degree}>{direction}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.helpText}>
        {coords
          ? `Turn slightly until your phone points toward ${direction}.`
          : 'Enable location access to calculate the Qibla direction.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  compassCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.navBar,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  compassRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 4,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compassCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    fontSize: 44,
    color: colors.primary,
    fontWeight: '700',
  },
  degree: {
    marginTop: 6,
    fontSize: 20,
    color: colors.navy,
    fontWeight: '700',
  },
  helpText: {
    marginTop: 24,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
