// A minimal in-memory store for "is an ESP32 sync send currently in
// flight". EspSyncScreen and HomeScreen's bottom nav / hamburger button
// are siblings (both rendered inside HomeScreen's pager, not nested in
// each other), so this is the bridge between them — same pattern as
// drawerStore.js and locationStore.js.
//
// While true, HomeScreen should block navigating away from the sync tab
// (bottom nav taps, swiping the pager, opening the drawer) so a send to
// the device can't be interrupted mid-way.

let syncing = false;
const listeners = new Set();

export function setSyncing(value) {
  if (syncing === value) return; // avoid redundant notifies on every re-render
  syncing = value;
  listeners.forEach((listener) => listener(syncing));
}

export function getSyncing() {
  return syncing;
}

// Returns an unsubscribe function for use in a useEffect cleanup.
export function subscribeSyncing(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}