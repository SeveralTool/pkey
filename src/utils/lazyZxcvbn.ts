/**
 * @fileoverview Deferred loader for zxcvbn.
 *
 * zxcvbn ships multi-hundred-KB embedded dictionaries whose module
 * initialization is expensive on Hermes. Loading it on first use keeps that
 * cost out of app startup; the module instance is cached afterwards.
 */
import type zxcvbnType from 'zxcvbn';

let cached: typeof zxcvbnType | null = null;

export function getZxcvbn(): typeof zxcvbnType {
  if (!cached) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('zxcvbn');
    cached = mod.default ?? mod;
  }
  return cached!;
}
