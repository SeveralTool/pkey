/**
 * @fileoverview Shared helpers (password generator, settings, links, secure random)
 * plus React Native base64 `btoa`/`atob` polyfills.
 */

export * from './passwordGenerator';
export * from './secureRandom';
export * from './openExternalLink';
export * from './appSettings';
export * from './encryptedDatabase';
export * from './jsonUnknown';
export * from './devicePreferences';

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

/**
 * Encodes a string in base-64.
 *
 * @param {string} input - The standard string input to encode. Defaults to empty string.
 * @returns {string} The base64 encoded string.
 * @throws {Error} Throws if the input contains characters outside the Latin1 range.
 */
export const btoa = (input: string = '') => {
  let str = input;
  let output = '';
  for (
    let block = 0, charCode, i = 0, map = chars;
    str.charAt(i | 0) || ((map = '='), i % 1);
    output += map.charAt(63 & (block >> (8 - (i % 1) * 8)))
  ) {
    charCode = str.charCodeAt((i += 3 / 4));
    if (charCode > 0xff) {
      throw new Error(
        "'btoa' failed: The string to be encoded contains characters outside of the Latin1 range."
      );
    }
    block = (block << 8) | charCode;
  }
  return output;
};

/**
 * Decodes a base-64 encoded string.
 *
 * @param {string} input - The base64 encoded string. Defaults to empty string.
 * @returns {string} The decoded standard string.
 * @throws {Error} Throws if the input is not correctly base64 encoded.
 */
export const atob = (input: string = '') => {
  let str = input.replace(/=+$/, '');
  let output = '';
  if (str.length % 4 == 1) {
    throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
  }
  for (
    let bc = 0, bs = 0, buffer, i = 0;
    (buffer = str.charAt(i++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = chars.indexOf(buffer);
  }
  return output;
};
