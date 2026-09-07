import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { setCoords, setCity, setLocationReady } from './locationStore';

/**
 * Asks for location permission and reads GPS coordinates once when the app
 * opens. The coordinates are written into locationStore, so every
 * getTodayPrayerTimes() call can attach them as lat/lng query params —
 * there's no backend user account to save a location to, so this is the
 * only source of truth for "where am I".
 *
 * After the GPS fix, it also reverse-geocodes the coordinates into a
 * human-readable city name (e.g. "Kolkata") and writes that into
 * locationStore too, so the header can show the device's real location
 * instead of a hardcoded default.
 */
export default function useLocationOnLaunch() {
  // 'checking' | 'granted' | 'denied' | 'servicesDisabled' | 'error'
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          if (!cancelled) { setStatus('servicesDisabled'); setLocationReady(true); }
          return;
        }

        const { status: permission } = await Location.requestForegroundPermissionsAsync();

        if (permission !== 'granted') {
          if (!cancelled) { setStatus('denied'); setLocationReady(true); }
          return;
        }

        // Always ask for a fresh fix — no cached-position shortcut. Android's
        // "last known position" cache doesn't reliably update the instant
        // `adb emu geo fix` (or Extended Controls) sets a new location, so
        // relying on it here would keep returning stale coordinates.
        const position = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Location request timed out')), 15000)
          ),
        ]);
        const { latitude, longitude } = position.coords;

        setCoords({ latitude, longitude });
        console.log('latitude', latitude, 'longitude', longitude);
        if (!cancelled) { setStatus('granted'); setLocationReady(true); }

        // Reverse-geocode in a separate try/catch so a geocoding failure
        // (e.g. no network, or provider hiccup) never blocks the GPS status
        // above — prayer times only need lat/lng, the city name is purely
        // for display.
        try {
          const results = await Location.reverseGeocodeAsync({ latitude, longitude });
          const place = results?.[0];
          const cityName =
            place?.city || place?.subregion || place?.region || place?.district || null;
          if (cityName && !cancelled) {
            setCity(cityName);
            console.log('resolved city', cityName);
          }
        } catch (geoErr) {
          console.warn('Reverse geocoding failed:', geoErr.message);
        }
      } catch (err) {
        console.warn('Location fetch failed:', err.message);
        if (!cancelled) { setStatus('error'); setLocationReady(true); }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}