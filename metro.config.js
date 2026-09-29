const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.resolve(projectRoot, 'packages')];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.extraNodeModules = {
  ...require('node-libs-browser'),
  Buffer: require.resolve('buffer/'),
  '@pkey/core': path.resolve(projectRoot, 'packages/core/src/index.ts'),
};

module.exports = config;
