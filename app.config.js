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
module.exports = {
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    bundledGroqKey: process.env.EXPO_PUBLIC_BUNDLED_GROQ_KEY ?? '',
    bundledHfToken: process.env.EXPO_PUBLIC_BUNDLED_HF_TOKEN ?? '',
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? DEFAULT_GOOGLE_WEB_CLIENT_ID,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  },
};
