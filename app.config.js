require('dotenv').config();

const requiredEnvVars = [
  'EXPO_PUBLIC_BUNDLED_GROQ_KEY',
];

const missing = requiredEnvVars.filter(key => !process.env[key]);
const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
if (missing.length > 0 && isDev) {
  console.warn(`[app.config] Missing environment variables: ${missing.join(', ')}`);
}

const appJson = require('./app.json');
module.exports = {
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    bundledGroqKey: process.env.EXPO_PUBLIC_BUNDLED_GROQ_KEY ?? '',
    bundledHfToken: process.env.EXPO_PUBLIC_BUNDLED_HF_TOKEN ?? '',
  },
};
