// A minimal in-memory store for the device's last known GPS coordinates
// and the human-readable city name resolved from them.
//
// Why a plain module instead of React Context: api.js needs to read the
// current coordinates synchronously when building a request, without every
// screen having to thread coords through props or call useContext just to
// pass them along. This file is the single source of truth; useLocationOnLaunch
// (in this same folder) is what actually populates it.

let currentCoords = null; // { latitude, longitude } | null
let currentCity = null;   // string | null
// Becomes true once useLocationOnLaunch has settled — granted, denied, an
// error, or its own internal GPS timeout — regardless of whether a fix was
// actually obtained. Lets other code (SplashScreen's prefetch) know it's
// safe to stop waiting on location and proceed with whatever it has.
let locationReady = false;
const coordListeners = new Set();
const cityListeners = new Set();
const readyListeners = new Set();

export function setCoords(coords) {
  currentCoords = coords;
  coordListeners.forEach((listener) => listener(currentCoords));
}

export function getCoords() {
  return currentCoords;
}

// Lets a component (e.g. HomeScreen) find out when GPS coordinates arrive
// *after* it has already mounted and done its first fetch. Returns an
// unsubscribe function for use in a useEffect cleanup.
export function subscribeCoords(listener) {
  coordListeners.add(listener);
  return () => coordListeners.delete(listener);
}

export function setCity(city) {
  currentCity = city;
  cityListeners.forEach((listener) => listener(currentCity));
}

export function getCity() {
  return currentCity;
}

// Same pattern as subscribeCoords, but fires once reverse-geocoding
// resolves a city name from the coordinates.
export function subscribeCity(listener) {
  cityListeners.add(listener);
  return () => cityListeners.delete(listener);
}

export function setLocationReady(value) {
  locationReady = value;
  readyListeners.forEach((listener) => listener(locationReady));
}

export function getLocationReady() {
  return locationReady;
}

export function subscribeLocationReady(listener) {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}