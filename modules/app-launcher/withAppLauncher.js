const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

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
  const withManifest = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // ── Permissions ──────────────────────────────────────────────
    const perms = manifest['uses-permission'] ?? [];
    const needed = [
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
      'android.permission.FOREGROUND_SERVICE_CAMERA',
      'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
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
    const existingPackages = (queries[0]?.package ?? []).map((p) => p.$?.['android:name']);
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
      app.$ = app.$ ?? {};
      app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
      app.$['android:usesCleartextTraffic'] = 'true';

      const services = app.service ?? [];
      const svcName = 'expo.modules.applauncher.RecordingService';
      const overlaySvcName = 'expo.modules.applauncher.OverlayService';
      // Remove existing entries if present (to update)
      const filtered = services.filter(
        (s) => s.$?.['android:name'] !== svcName && s.$?.['android:name'] !== overlaySvcName,
      );
      filtered.push({
        $: {
          'android:name': svcName,
          'android:foregroundServiceType': 'microphone|mediaProjection',
          'android:exported': 'false',
        },
      });
      filtered.push({
        $: {
          'android:name': overlaySvcName,
          'android:foregroundServiceType': 'camera|microphone|specialUse|dataSync',
          'android:exported': 'false',
        },
        property: [
          {
            $: {
              'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
              'android:value': 'Timer overlay for study sessions',
            },
          },
        ],
      });
      app.service = filtered;
    }

    return config;
  });

  return withDangerousMod(withManifest, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const xmlDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'xml');
      const xmlPath = path.join(xmlDir, 'network_security_config.xml');

      fs.mkdirSync(xmlDir, { recursive: true });
      const networkSecurityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">10.0.2.2</domain>
    <domain includeSubdomains="true">localhost</domain>
    <domain includeSubdomains="true">127.0.0.1</domain>
    <domain includeSubdomains="true">192.168.1.20</domain>
  </domain-config>
</network-security-config>
`;
      fs.writeFileSync(xmlPath, networkSecurityConfig, 'utf8');
      return config;
    },
  ]);
}

module.exports = withAppLauncher;
