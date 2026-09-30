// Expo config plugin for react-native-background-actions.
//
// Android 14+ refuses to start a foreground service unless the <service>
// entry in AndroidManifest.xml declares a foregroundServiceType. The
// library's own manifest declares the service without one, so this plugin
// adds android:foregroundServiceType="dataSync" to it during prebuild
// (Android's manifest merger combines it with the library's entry).
//
// The matching permission (FOREGROUND_SERVICE_DATA_SYNC) is listed in
// app.json > android.permissions.
const { withAndroidManifest } = require('@expo/config-plugins');

const SERVICE_NAME = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';

module.exports = function withBackgroundActionsService(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;

    app.service = app.service || [];
    let service = app.service.find((s) => s.$?.['android:name'] === SERVICE_NAME);
    if (!service) {
      service = { $: { 'android:name': SERVICE_NAME } };
      app.service.push(service);
    }
    service.$['android:foregroundServiceType'] = 'dataSync';
    service.$['android:exported'] = 'false';
    return cfg;
  });
};