const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = true;

config.resolver.blockList = [
  /.*\/android\/build\/.*/,
  /.*\/android\/\.cxx\/.*/,
  /.*\.llama\.rn.*/,
];

const isTermux =
  process.env.TERMUX_VERSION != null ||
  (process.platform === 'linux' && process.env.PREFIX?.includes('com.termux'));

// Keep local Metro conservative, but only force polling in Termux-like environments.
if (!process.env.EAS_BUILD) {
  if (isTermux) {
    config.watcher = { ...config.watcher, usePolling: true, interval: 1000 };
  }
}

module.exports = config;
