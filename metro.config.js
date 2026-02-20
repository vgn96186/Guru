const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = true;
config.maxWorkers = 1;
config.watcher.usePolling = true;
config.watcher.interval = 1000;
module.exports = config;
