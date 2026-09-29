/**
 * @fileoverview View-state for the receive-migration QR / pairing panel.
 */
import type { MigrationPhase, MigrationRole } from '../../services/migrationProtocol';

export type ReceiverConnectPanelMode = 'hidden' | 'preparing' | 'ready';

/**
 * When the receiver modal opens, TLS listen can take seconds on a slow phone.
 * The QR payload is empty until then — we still paint a preparing panel so the
 * layout is not a blank gap under the phase stepper.
 */
export function getReceiverConnectPanelMode(input: {
  role: MigrationRole;
  phase: MigrationPhase;
  hasError: boolean;
  hasQr: boolean;
  hasPairing: boolean;
}): ReceiverConnectPanelMode {
  if (input.role !== 'receiving') return 'hidden';
  if (input.hasQr || input.hasPairing) return 'ready';
  if (input.hasError) return 'hidden';
  if (input.phase === 'discovering' || input.phase === 'idle') return 'preparing';
  return 'hidden';
}
