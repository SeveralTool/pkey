/**
 * @fileoverview Dev-only debug logger for the import pipeline.
 */

const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

/**
 * Creates a logger that emits `[import]` debug lines only outside production.
 *
 * @returns Object with a `debug(...args)` method.
 */
export function createImportLogger() {
  return {
    debug(...args: unknown[]) {
      if (isDev) console.debug('[import]', ...args);
    },
  };
}
