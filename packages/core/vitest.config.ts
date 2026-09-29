import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/sync/encryptedChannel.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/importers/**', 'src/crypto/totp.ts'],
      exclude: [
        'src/importers/__fixtures__/**',
        'src/importers/**/__tests__/**',
        'src/crypto/__fixtures__/**',
      ],
      thresholds: {
        lines: 80,
        'src/crypto/totp.ts': {
          lines: 90,
        },
      },
    },
  },
});
