// // A minimal in-memory store for the side drawer's open/closed state.
// //
// // Why a plain module instead of local state in HomeScreen: DrawerMenu is
// // rendered in App.js as a sibling of AppNavigator (see the comment there
// // for why), not inside HomeScreen. This store is the bridge between the
// // hamburger button (in HomeScreen, several component levels away) and the
// // drawer overlay (in App.js) — same pattern as locationStore.js.

// let drawerOpen = false;
// const listeners = new Set();

// export function setDrawerOpen(value) {
//   drawerOpen = value;
//   listeners.forEach((listener) => listener(drawerOpen));
// }

// export function getDrawerOpen() {
//   return drawerOpen;
// }

// // Returns an unsubscribe function for use in a useEffect cleanup.
// export function subscribeDrawer(listener) {
//   listeners.add(listener);
//   return () => listeners.delete(listener);
// }

// export function openDrawer() {
//   setDrawerOpen(true);
// }

// export function closeDrawer() {
//   setDrawerOpen(false);
// }




// A minimal in-memory store for the side drawer's open/closed state.
//
// Why a plain module instead of local state in HomeScreen: DrawerMenu is
// rendered in App.js as a sibling of AppNavigator (see the comment there
// for why), not inside HomeScreen. This store is the bridge between the
// hamburger button (in HomeScreen, several component levels away) and the
// drawer overlay (in App.js) — same pattern as locationStore.js.

let drawerOpen = false;
const listeners = new Set();

export function setDrawerOpen(value) {
  console.log('[drawerStore] setDrawerOpen ->', value, '| listener count =', listeners.size);
  drawerOpen = value;
  listeners.forEach((listener) => listener(drawerOpen));
}

export function getDrawerOpen() {
  return drawerOpen;
}

// Returns an unsubscribe function for use in a useEffect cleanup.
export function subscribeDrawer(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function openDrawer() {
  setDrawerOpen(true);
}

export function closeDrawer() {
  setDrawerOpen(false);
}
