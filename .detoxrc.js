/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      '$0': 'jest',
      config: 'e2e/jest.config.js'
    },
    jest: {
      setupTimeout: 120000
    }
  },
  apps: {
    'android.debug': {
      type: 'android.apk',
      build:
        'cd android && ANDROID_HOME="$HOME/Library/Android/sdk" ANDROID_SDK_ROOT="$HOME/Library/Android/sdk" ./gradlew :app:assembleDebug :app:assembleAndroidTest -DtestBuildType=debug -PreactNativeArchitectures=arm64-v8a --build-cache --configuration-cache',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      reversePorts: [8081]
    },
    'android.release': {
      type: 'android.apk',
      build:
        'cd android && ANDROID_HOME="$HOME/Library/Android/sdk" ANDROID_SDK_ROOT="$HOME/Library/Android/sdk" ./gradlew :app:assembleRelease :app:assembleAndroidTest -DtestBuildType=release -PreactNativeArchitectures=arm64-v8a --build-cache',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk'
    }
  },
  devices: {
    phone: {
      type: 'android.emulator',
      device: {
        avdName: 'Medium_Phone_API_36.0'
      }
    },
    tablet: {
      type: 'android.emulator',
      device: {
        avdName: 'Medium_Tablet'
      }
    },
    attached: {
      type: 'android.attached',
      device: {
        adbName: 'emulator-5554'
      }
    }
  },
  configurations: {
    'android.emu.debug': {
      device: 'tablet',
      app: 'android.debug'
    },
    'android.phone.debug': {
      device: 'phone',
      app: 'android.debug'
    },
    'android.emu.release': {
      device: 'tablet',
      app: 'android.release'
    },
    'android.att.release': {
      device: 'attached',
      app: 'android.release'
    }
  }
};
