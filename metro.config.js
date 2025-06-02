const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = false;

config.resolver.alias = {
  ...config.resolver.alias,
  stream: 'stream-browserify',
  events: 'events',
  util: 'util',
  buffer: 'buffer',
  process: 'process/browser',
};

// Add shims for globals
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

module.exports = config;