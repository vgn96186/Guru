const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = true;

// Termux-specific: only apply polling/worker limits locally
if (!process.env.EAS_BUILD) {
  config.maxWorkers = 1;
  config.watcher = { ...config.watcher, usePolling: true, interval: 1000 };
}

module.exports = config;
