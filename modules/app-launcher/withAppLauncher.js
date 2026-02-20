const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo config plugin for the GuruAppLauncher native module.
 *
 * Adds:
 *  - FOREGROUND_SERVICE, FOREGROUND_SERVICE_MICROPHONE, FOREGROUND_SERVICE_MEDIA_PROJECTION permissions
 *  - RecordingService declaration with foregroundServiceType="microphone|mediaProjection"
 *  - RECORD_AUDIO, MODIFY_AUDIO_SETTINGS permissions
 *  - <queries> for the medical app packages
 */
function withAppLauncher(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // ── Permissions ──────────────────────────────────────────────
    const perms = manifest['uses-permission'] ?? [];
    const needed = [
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
    ];
    for (const perm of needed) {
      if (!perms.some((p) => p.$?.['android:name'] === perm)) {
        perms.push({ $: { 'android:name': perm } });
      }
    }
    manifest['uses-permission'] = perms;

    // ── Queries — medical app packages ───────────────────────────
    const queries = manifest.queries ?? [{}];
    const packages = [
      'com.marrow',
      'one.dbmci',
      'com.cerebellummobileapp',
      'com.prepladder.learningapp',
      'com.dbmci.bhatia',
    ];
    const existingPackages = (queries[0]?.package ?? []).map(
      (p) => p.$?.['android:name']
    );
    for (const pkg of packages) {
      if (!existingPackages.includes(pkg)) {
        queries[0].package = queries[0].package ?? [];
        queries[0].package.push({ $: { 'android:name': pkg } });
      }
    }
    manifest.queries = queries;

    // ── RecordingService in <application> ────────────────────────
    const app = manifest.application?.[0];
    if (app) {
      const services = app.service ?? [];
      const svcName = 'expo.modules.applauncher.RecordingService';
      // Remove existing entry if present (to update)
      const filtered = services.filter(
        (s) => s.$?.['android:name'] !== svcName
      );
      filtered.push({
        $: {
          'android:name': svcName,
          'android:foregroundServiceType': 'microphone|mediaProjection',
          'android:exported': 'false',
        },
      });
      app.service = filtered;
    }

    return config;
  });
}

module.exports = withAppLauncher;
