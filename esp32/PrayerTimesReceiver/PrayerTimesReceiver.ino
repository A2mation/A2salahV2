// Receives prayer times from the A2salah app and stores them in SPIFFS so
// they survive a reboot. Two transports are supported at once:
//
//   1. Classic Bluetooth (SPP) — plain-text, line-delimited protocol.
//      Only works on the original ESP32 (WROOM-32 / WROVER) — Classic
//      Bluetooth does NOT exist on ESP32-S2/S3/C3/C6, which are BLE-only.
//
//   2. WiFi — the ESP32 creates its OWN hotspot (SoftAP) instead of
//      joining your home/router WiFi. Sends one row at a time as a raw
//      comma-separated string, so no JSON library is needed.
//
// Both transports write to the SAME /prayer_times.csv file in the SAME
// row format, via the shared beginYearWrite/writeDataRow/endYearWrite
// helpers below — so displayToday() and everything downstream doesn't
// care which transport the data arrived over.
//
// ---- Row format (long format — 4 rows per day for 2 tracked prayers) ----
// Each row is one (date, prayer, azan|jamat) reading, NOT a full day's
// worth of times. For a day tracking Dhuhr + Asr jamat, that's 4 rows:
//   20260101,dhuhr,azan,12:14
//   20260101,dhuhr,jamat,12:29
//   20260101,asr,azan,15:42
//   20260101,asr,jamat,15:52
// The first three fields (date,prayer,type) are the row's unique key —
// upserting replaces only the matching row, leaving the other 3 rows for
// that day untouched.
//
// Bluetooth protocol received (plain text, one line per message, '\n'-terminated):
//   BEGIN_YEAR:<year>
//   COUNT:<numberOfRows>
//   <YYYYMMDD>,<prayer>,<azan|jamat>,<HH:MM>
//   ... one line per row (4 lines per day for 2 tracked prayers) ...
//   END_YEAR
//
// WiFi hotspot flow:
//   1. ESP32 boots and starts broadcasting a WiFi network named AP_SSID,
//      protected by AP_PASSWORD (both set below). The app shows this SSID
//      and asks the user to enter AP_PASSWORD to join it, then connects
//      the phone to it (this is a real WiFi association, done by the OS/
//      the app's WiFi library — not app-level login).
//   2. Once the phone has joined the hotspot, the ESP32 is always reachable
//      at the fixed gateway address 192.168.4.1 — no need to read an IP
//      off the Serial monitor.
//   3. The app POSTs ONE row at a time as a raw comma-separated string body
//      (no JSON) to http://192.168.4.1/sync/day :
//        <YYYYMMDD>,<prayer>,<azan|jamat>,<HH:MM>
//      e.g.  20260101,dhuhr,azan,12:14
//      The row is upserted into /prayer_times.csv, matched on the
//      date+prayer+type key — so sending all 4 rows for a day (one POST
//      each) fills in that day without disturbing other days' rows.
//
// This sketch just displays (Serial monitor stand-in for a real screen) —
// swap the `displayToday()` body for your actual OLED/LCD/relay code.

#include "BluetoothSerial.h"
#include "SPIFFS.h"
#include <WiFi.h>
#include <WebServer.h>

#if !defined(CONFIG_BT_ENABLED) || !defined(CONFIG_BLUEDROID_ENABLED)
#error Bluetooth is not enabled! Use "Tools > Board" to select an ESP32 board, and enable Classic BT in menuconfig if needed.
#endif

// ---- Hotspot (SoftAP) settings — change these before uploading ----
// AP_SSID is what shows up when the phone scans for WiFi networks, and
// AP_PASSWORD is what the app will ask the user to type in to join it.
// WPA2 passwords must be at least 8 characters.
const char* AP_SSID = "A2_SALAH";
const char* AP_PASSWORD = "A2_ma_tion";
// ---------------------------------------------------------------------

BluetoothSerial SerialBT;
WebServer server(80);

const char* DATA_FILE = "/prayer_times.csv"; // one line per (date,prayer,type) row: YYYYMMDD,prayer,azan|jamat,HH:MM

File writeFile;
bool receivingYear = false;
int expectedCount = 0;
int receivedCount = 0;
String currentYear = "";

String pendingLine = ""; // accumulates bytes until a '\n' is seen (Bluetooth only)

void setup() {
  Serial.begin(115200);
  delay(500);

  if (!SPIFFS.begin(true)) {
    Serial.println("SPIFFS mount failed");
  }

  // "A2salah_ESP32" is the name that will show up when pairing from the
  // phone's Bluetooth settings — pair with this exact name before using
  // the app's "Sync to ESP32" screen (Bluetooth tab).
  SerialBT.begin("A2salah_ESP32");
  Serial.println("Bluetooth SPP started. Pair as 'A2salah_ESP32', then send data from the app.");

  setupWifiHotspot();

  displayToday(); // show whatever was last saved, in case we rebooted
}

void loop() {
  while (SerialBT.available()) {
    char c = SerialBT.read();
    if (c == '\n') {
      handleLine(pendingLine);
      pendingLine = "";
    } else if (c != '\r') {
      pendingLine += c;
    }
  }

  server.handleClient();
}

// ---------------- WiFi hotspot (SoftAP) setup + HTTP server ----------------

void setupWifiHotspot() {
  WiFi.mode(WIFI_AP);

  // softAP() returns true immediately once the AP is up — unlike joining an
  // existing network, there's no "waiting to associate" step here.
  bool ok = WiFi.softAP(AP_SSID, AP_PASSWORD);
  if (!ok) {
    Serial.println("Failed to start WiFi hotspot!");
    return;
  }

  IPAddress ip = WiFi.softAPIP(); // always 192.168.4.1 unless reconfigured
  Serial.println("WiFi hotspot started.");
  Serial.printf("  SSID: %s\n", AP_SSID);
  Serial.printf("  Password: %s\n", AP_PASSWORD);
  Serial.print("  IP address: ");
  Serial.println(ip);
  Serial.println("Connect your phone to this hotspot, then use the app's WiFi tab to sync.");

  server.on("/sync/day", HTTP_POST, handleWifiSyncDay);
  // Simple GET the app can hit right after joining the hotspot, to confirm
  // it's really talking to the ESP32 before sending the full year payload.
  server.on("/ping", HTTP_GET, []() {
    server.send(200, "application/json", "{\"status\":\"ok\",\"device\":\"A2salah_ESP32\"}");
  });
  server.begin();
  Serial.println("HTTP server started on port 80.");
}

// Handles a single POST /sync/day whose body is ONE raw comma-separated
// row (no JSON):
//   <YYYYMMDD>,<prayer>,<azan|jamat>,<HH:MM>
// e.g. 20260101,dhuhr,azan,12:14
// The row is upserted into DATA_FILE, matched on the date+prayer+type key
// (the first three fields) — so the 4 rows making up one day (2 prayers x
// azan/jamat) can each be synced independently, one POST per row, without
// clobbering the other 3 rows for that day.
void handleWifiSyncDay() {
  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"message\":\"Missing request body\"}");
    return;
  }

  String row = server.arg("plain");
  row.trim(); // drop any trailing \r\n the client sent

  // Basic shape check: 4 comma-separated fields — YYYYMMDD, prayer, type,
  // HH:MM — not a full parse, just enough to reject garbage before it
  // lands in the CSV.
  int firstComma = row.indexOf(',');
  if (firstComma != 8) {
    server.send(400, "application/json", "{\"message\":\"Invalid row format, expected YYYYMMDD,prayer,azan|jamat,HH:MM\"}");
    return;
  }
  String dateKey = row.substring(0, firstComma);
  for (size_t i = 0; i < dateKey.length(); i++) {
    if (!isDigit(dateKey[i])) {
      server.send(400, "application/json", "{\"message\":\"Invalid date in row\"}");
      return;
    }
  }

  int secondComma = row.indexOf(',', firstComma + 1);
  int thirdComma = secondComma >= 0 ? row.indexOf(',', secondComma + 1) : -1;
  if (secondComma < 0 || thirdComma < 0) {
    server.send(400, "application/json", "{\"message\":\"Invalid row format, expected YYYYMMDD,prayer,azan|jamat,HH:MM\"}");
    return;
  }
  // rowKey = "YYYYMMDD,prayer,type" — the part before the HH:MM time, used
  // to find/replace this exact row (as opposed to the whole day).
  String rowKey = row.substring(0, thirdComma);

  upsertRow(rowKey, row);

  String response = "{\"received\":\"" + rowKey + "\"}";
  server.send(200, "application/json", response);
}

// Rewrites DATA_FILE with `row` in place of any existing row whose
// date+prayer+type key matches `rowKey`, appending it if no such row
// exists yet. Done via a temp file since SPIFFS has no in-place line
// editing. Only the ONE matching row is touched — the other rows for that
// day (and every other day) are copied through unchanged.
void upsertRow(const String& rowKey, const String& row) {
  const char* TMP_FILE = "/prayer_times.tmp";
  File in = SPIFFS.open(DATA_FILE, FILE_READ);
  File out = SPIFFS.open(TMP_FILE, FILE_WRITE);

  bool replaced = false;
  String matchPrefix = rowKey + ",";
  if (in) {
    while (in.available()) {
      String line = in.readStringUntil('\n');
      line.trim();
      if (line.length() == 0) continue;
      if (line.startsWith(matchPrefix)) {
        out.println(row);
        replaced = true;
      } else {
        out.println(line);
      }
    }
    in.close();
  }
  if (!replaced) {
    out.println(row);
  }
  out.close();

  SPIFFS.remove(DATA_FILE);
  SPIFFS.rename(TMP_FILE, DATA_FILE);

  Serial.printf("Upserted row %s (%s)\n", rowKey.c_str(), replaced ? "replaced" : "appended");
  displayToday();
}

// ---------------- Shared year-write helpers (used by both transports) ----------------

void beginYearWrite(const String& year, int count) {
  currentYear = year;
  receivingYear = true;
  receivedCount = 0;
  expectedCount = count;
  writeFile = SPIFFS.open(DATA_FILE, FILE_WRITE); // truncates any previous year
  Serial.printf("Receiving prayer times for %s...\n", currentYear.c_str());
}

void writeDataRow(const String& row) {
  if (!receivingYear || row.length() == 0) return;
  writeFile.println(row);
  receivedCount++;
}

void endYearWrite() {
  if (writeFile) writeFile.close();
  receivingYear = false;
  Serial.printf("Done: received %d/%d rows for %s\n", receivedCount, expectedCount, currentYear.c_str());
  displayToday();
}

// ---------------- Bluetooth line protocol (unchanged) ----------------

void handleLine(const String& line) {
  if (line.startsWith("BEGIN_YEAR:")) {
    beginYearWrite(line.substring(String("BEGIN_YEAR:").length()), 0);
    return;
  }

  if (line.startsWith("COUNT:")) {
    expectedCount = line.substring(String("COUNT:").length()).toInt();
    return;
  }

  if (line == "END_YEAR") {
    endYearWrite();
    return;
  }

  if (receivingYear) {
    writeDataRow(line);
  }
}

// Scans the saved CSV for ALL rows matching today's date (YYYYMMDD) and
// prints each one. Unlike the old wide-row format, a day can now have
// several rows (4, for 2 tracked prayers x azan/jamat) so this collects
// them all instead of stopping at the first match. Replace this body with
// real OLED/LCD/relay-trigger logic — row format is:
// YYYYMMDD,prayer,azan|jamat,HH:MM
void displayToday() {
  // NOTE: ESP32 has no RTC battery by default, so "today" here needs a real
  // time source (NTP over Wi-Fi, or a DS3231 RTC module) wired up — this
  // is left as a placeholder using a fixed date for demonstration. Since
  // the ESP32 is now the one hosting the hotspot (not joined to your
  // router), it has no internet access and can't reach an NTP server
  // unless you add a DS3231 or similar RTC module.
  String todayKey = "20260101"; // TODO: replace with real date source

  File f = SPIFFS.open(DATA_FILE, FILE_READ);
  if (!f) {
    Serial.println("No prayer_times.csv saved yet.");
    return;
  }

  int matches = 0;
  Serial.println("Today's rows:");
  while (f.available()) {
    String row = f.readStringUntil('\n');
    row.trim();
    if (row.startsWith(todayKey)) {
      Serial.print("  ");
      Serial.println(row); // e.g. "20260101,dhuhr,jamat,12:29"
      matches++;
    }
  }
  f.close();

  if (matches == 0) {
    Serial.println("  (no rows found for today's date)");
  }
}
