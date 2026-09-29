module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      production: {
        plugins: [
          // Strip console.log / info / debug in production bundles; keep warn/error
          // so the AppErrorBoundary and native crash reporters still see recovery hints.
          ['transform-remove-console', { exclude: ['warn', 'error'] }],
        ],
      },
    },
  };
};
