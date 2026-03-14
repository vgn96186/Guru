require('dotenv').config();

const requiredEnvVars = [
  'EXPO_PUBLIC_BUNDLED_GROQ_KEY',
];

const missing = requiredEnvVars.filter(key => !process.env[key]);
if (missing.length > 0 && __DEV__) {
  console.warn(`[app.config] Missing environment variables: ${missing.join(', ')}`);
}

const appJson = require('./app.json');
module.exports = {
  ...appJson,
  extra: {
    bundledGroqKey: process.env.EXPO_PUBLIC_BUNDLED_GROQ_KEY ?? '',
  },
};
