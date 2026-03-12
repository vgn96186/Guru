// Load .env so EXPO_PUBLIC_* (e.g. EXPO_PUBLIC_BUNDLED_GROQ_KEY) are available at build/start.
require('dotenv').config();

const appJson = require('./app.json');
module.exports = {
  ...appJson,
};
