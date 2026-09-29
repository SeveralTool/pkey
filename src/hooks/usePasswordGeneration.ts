/**
 * @fileoverview Custom hook for generating secure entropy-based passwords.
 */
import { useCallback, useMemo } from 'react';
import { AppSettings } from '../types';
import { generateRandomPassword, isPasswordGeneratorConfigured } from '../utils/passwordGenerator';

/**
 * Hook that provides a function to generate a random password
 * based on the user's entropy configuration.
 *
 * @param {AppSettings} settings - The current application settings for password generation.
 * @returns {object} An object containing the `generateRandomEntropyKey` function and `canGeneratePassword` flag.
 */
export const usePasswordGeneration = (settings: Readonly<AppSettings>) => {
  const canGeneratePassword = useMemo(() => isPasswordGeneratorConfigured(settings), [settings]);

  /**
   * Generates a random cryptographic-like string using the configured
   * character pools and length.
   *
   * @returns {string | null} The randomly generated password, or null if generation is not possible.
   */
  const generateRandomEntropyKey = useCallback((): string | null => {
    return generateRandomPassword(settings);
  }, [settings]);

  return { generateRandomEntropyKey, canGeneratePassword };
};
