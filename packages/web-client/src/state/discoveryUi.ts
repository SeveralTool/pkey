import type { ConnState, DiscoveryState } from './appStore';

export type DiscoveryUiMode = 'hidden' | 'searching' | 'guidance';

/**
 * Which discovery chrome to show. Searching and guidance replace the login
 * conn-status line so the same copy is not rendered twice.
 */
export function discoveryUiMode(
  discovery: DiscoveryState,
  discoveryExhausted: boolean,
  connState: ConnState,
): DiscoveryUiMode {
  if (connState === 'authenticated') return 'hidden';
  if (discovery === 'active') return 'searching';
  if (discoveryExhausted) return 'guidance';
  return 'hidden';
}
