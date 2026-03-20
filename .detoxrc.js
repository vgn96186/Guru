/* global module */
/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    'android.debug': {
      type: 'android.apk',
      build:
        'cd android && ANDROID_HOME="${ANDROID_SDK_ROOT:-/Users/vishnugnair/Library/Android/sdk}" ./gradlew :app:assembleDebug :app:assembleAndroidTest -DtestBuildType=debug -PreactNativeArchitectures=arm64-v8a --build-cache',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      reversePorts: [8081],
    },
    'android.release': {
      type: 'android.apk',
      build:
        'cd android && ANDROID_HOME="${ANDROID_SDK_ROOT:-/Users/vishnugnair/Library/Android/sdk}" ./gradlew :app:assembleRelease :app:assembleAndroidTest -DtestBuildType=release -PreactNativeArchitectures=arm64-v8a --build-cache',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
    },
  },
  devices: {
    tablet: {
      type: 'android.emulator',
      device: {
        avdName: 'Medium_Tablet',
      },
    },
    phone: {
      type: 'android.emulator',
      device: {
        avdName: 'Medium_Phone_API_36.0',
      },
    },
  },
  configurations: {
    // Primary test config — release build, no Metro/dev-client needed.
    'android.emu.debug': {
      device: 'tablet',
      app: 'android.release',
    },
    'android.phone.debug': {
      device: 'phone',
      app: 'android.release',
    },
    // For debugging tests with Metro & dev-client (manual use only).
    'android.emu.dev': {
      device: 'tablet',
      app: 'android.debug',
    },
  },
};
