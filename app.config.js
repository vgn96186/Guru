require('dotenv').config();

const requiredEnvVars = ['EXPO_PUBLIC_BUNDLED_GROQ_KEY'];

const missing = requiredEnvVars.filter((key) => !process.env[key]);
const isDev = process.env.NODE_ENV !== 'production';
if (missing.length > 0 && isDev) {
  console.warn(`[app.config] Missing environment variables: ${missing.join(', ')}`);
}

const appJson = require('./app.json');
const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '132201315043-443j8hva0nhoapt6j4brcdb9n57kb1rv.apps.googleusercontent.com';

// Use .dev package suffix for development builds
const androidPackage = 'com.anonymous.gurustudy.dev';

module.exports = {
  ...appJson.expo,
  android: {
    ...appJson.expo.android,
    package: androidPackage,
  },
  plugins: [
    ...appJson.expo.plugins,
    [
      '@sentry/react-native/expo',
      {
        url: 'https://sentry.io/',
        project: process.env.SENTRY_PROJECT || 'guru-study',
        organization: process.env.SENTRY_ORG || 'guru',
      },
    ],
  ],
  extra: {
    ...appJson.expo.extra,
    bundledGroqKey: process.env.EXPO_PUBLIC_BUNDLED_GROQ_KEY ?? '',
    bundledHfToken: process.env.EXPO_PUBLIC_BUNDLED_HF_TOKEN ?? '',
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? DEFAULT_GOOGLE_WEB_CLIENT_ID,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  },
};
