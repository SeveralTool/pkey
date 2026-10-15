// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // SDK 56 enables stricter react-hooks rules that flag intentional RN patterns
    // (Animated.Value refs, dbRef sync during render, etc.).
    // `immutability` flags Reanimated `sharedValue.value = x` writes inside callbacks,
    // which is the documented Reanimated API, not a mutation of an effect dependency.
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
    },
  },
]);
