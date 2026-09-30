import React, { createContext, useContext, useState } from 'react';

// Shares "is the phone currently connected to the ESP32's WiFi hotspot"
// between HomeScreen (renders the Connected/Disconnected badge in the
// header) and EspSyncScreen (owns the actual connect/disconnect calls and
// ping-poll, and reports state changes in here).
//
// HomeScreen and EspSyncScreen are siblings — EspSyncScreen is just one
// page inside HomeScreen's own pager — so neither is an ancestor of the
// other. The provider therefore can't be mounted inside either of them;
// it's mounted in AppNavigator.js, wrapped around the "Home" screen, which
// is the lowest point that's a common ancestor of both.
const EspConnectionContext = createContext({
  espConnected: false,
  setEspConnected: () => {},
});

export function EspConnectionProvider({ children }) {
  const [espConnected, setEspConnected] = useState(false);
  return (
    <EspConnectionContext.Provider value={{ espConnected, setEspConnected }}>
      {children}
    </EspConnectionContext.Provider>
  );
}

// Convenience hook — components just call useEspConnection() instead of
// importing createContext/useContext themselves.
export function useEspConnection() {
  return useContext(EspConnectionContext);
}