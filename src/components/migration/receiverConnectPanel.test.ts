/**
 * @fileoverview Receive-migration connect panel should not stay blank while TLS starts.
 */
import { getReceiverConnectPanelMode } from './receiverConnectPanel';

describe('getReceiverConnectPanelMode', () => {
  it('shows a preparing panel on receive while discovering with no payload yet', () => {
    expect(
      getReceiverConnectPanelMode({
        role: 'receiving',
        phase: 'discovering',
        hasError: false,
        hasQr: false,
        hasPairing: false,
      })
    ).toBe('preparing');
  });

  it('keeps pairing/QR visible once credentials exist', () => {
    expect(
      getReceiverConnectPanelMode({
        role: 'receiving',
        phase: 'discovering',
        hasError: false,
        hasQr: false,
        hasPairing: true,
      })
    ).toBe('ready');
    expect(
      getReceiverConnectPanelMode({
        role: 'receiving',
        phase: 'transferring',
        hasError: false,
        hasQr: true,
        hasPairing: true,
      })
    ).toBe('ready');
  });

  it('hides the panel on start failure before any credentials', () => {
    expect(
      getReceiverConnectPanelMode({
        role: 'receiving',
        phase: 'error',
        hasError: true,
        hasQr: false,
        hasPairing: false,
      })
    ).toBe('hidden');
  });

  it('does not show the panel on the send flow or finalize-only resume', () => {
    expect(
      getReceiverConnectPanelMode({
        role: 'sending',
        phase: 'discovering',
        hasError: false,
        hasQr: false,
        hasPairing: false,
      })
    ).toBe('hidden');
    expect(
      getReceiverConnectPanelMode({
        role: 'receiving',
        phase: 'ready_to_finalize',
        hasError: false,
        hasQr: false,
        hasPairing: false,
      })
    ).toBe('hidden');
  });
});
