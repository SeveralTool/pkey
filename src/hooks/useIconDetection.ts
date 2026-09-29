/**
 * Hook for automatic icon detection in card components
 * Manages async detection lifecycle, loading state, and error handling
 *
 * NOTE: Detection is MANUAL (no auto-trigger on title/link change)
 * Call the detect() function explicitly when needed (e.g., on save)
 */

import { useState, useCallback } from 'react';
import { detectIcon } from '../services/iconDetection';
import { CardIcon } from '../types'; // Importar CardIcon
import { useCoreState } from '../context/CoreStateContext';

/**
 * Detection state
 */
export interface IconDetectionState {
  /** Current icon (may be default while loading) */
  icon: CardIcon; // Cambiado a CardIcon
  /** Whether detection is in progress */
  isLoading: boolean;
  /** Detection method used */
  source: 'host' | 'favicon' | 'fuzzy' | 'default' | null;
  /** Error message if detection failed */
  error?: string;
}

/**
 * Hook for manual icon detection (not automatic)
 *
 * @param title - Card title
 * @param link - Card URL (optional)
 * @param initialIcon - Initial icon while detecting (default: 'key-outline')
 * @returns Detection state and detect function for manual trigger
 *
 * USAGE:
 * const { icon, isLoading, detect } = useIconDetection(title, link, initialIcon);
 *
 * // Trigger detection manually (e.g., on save button click)
 * await detect(title, link);
 */
export const useIconDetection = (
  title: string,
  link?: string,
  initialIcon: CardIcon = { type: 'icon', value: 'key-outline' } // Cambiado a CardIcon
) => {
  const [state, setState] = useState<IconDetectionState>({
    icon: initialIcon,
    isLoading: false,
    source: null,
  });
  const { db } = useCoreState();
  const allowRemoteFavicon =
    db?.settings?.enableFaviconLookup === true && db?.settings?.strictOffline !== true;

  /**
   * Trigger icon detection (manual, not automatic)
   */
  const detect = useCallback(
    async (overrideTitle?: string, overrideLink?: string): Promise<CardIcon> => {
      // Cambiado a Promise<CardIcon>
      const titleToUse = overrideTitle ?? title;
      const linkToUse = overrideLink ?? link;

      if (!titleToUse.trim() && !(linkToUse ?? '').trim()) {
        console.debug('[useIconDetection] Skipping detection: empty title and link');
        setState({
          icon: initialIcon,
          isLoading: false,
          source: null,
          error: 'Empty title',
        });
        return initialIcon;
      }

      // Set loading state
      console.debug('[useIconDetection] Starting detection for:', titleToUse, linkToUse);
      setState((prev) => ({
        ...prev,
        isLoading: true,
      }));

      try {
        // Call detection service — pass explicit opt-in for remote favicon.
        const result = await detectIcon(titleToUse, linkToUse, { allowRemoteFavicon });

        console.debug('[useIconDetection] Detection result:', result);

        // Update state with result
        setState({
          icon: result.icon,
          isLoading: false,
          source: result.source,
          error: result.error,
        });

        return result.icon; // Devolver CardIcon
      } catch (err: unknown) {
        console.error('[useIconDetection] Detection error:', err);
        const message = err instanceof Error ? err.message : 'Detection error';
        setState({
          icon: initialIcon,
          isLoading: false,
          source: 'default',
          error: message,
        });
        return initialIcon; // Devolver CardIcon
      }
    },
    [title, link, initialIcon, allowRemoteFavicon]
  );

  return {
    ...state,
    detect, // Manual trigger for detection
  };
};

export default useIconDetection;
