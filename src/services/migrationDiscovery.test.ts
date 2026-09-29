/**
 * @fileoverview Unit tests for migration mDNS discovery (no secret in TXT).
 */
import { MigrationDiscovery } from './migrationDiscovery';

const mockZeroconf = {
  on: jest.fn(),
  publishService: jest.fn(),
  unpublishService: jest.fn(),
  scan: jest.fn(),
  stop: jest.fn(),
  removeDeviceListeners: jest.fn(),
  removeAllListeners: jest.fn(),
  _publishedServices: { 'pkey-device': {} },
};

jest.mock('./zeroconfPlatform', () => ({
  isZeroconfAvailable: jest.fn(() => true),
  createZeroconfInstance: jest.fn(() => mockZeroconf),
  stopZeroconfInstance: jest.fn(),
}));

describe('MigrationDiscovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockZeroconf.on.mockImplementation(() => mockZeroconf);
  });

  it('publish does not include pairingSecret in TXT', () => {
    const discovery = new MigrationDiscovery();
    discovery.publish('MyDevice', 'abcd1234efgh5678', 'A1B2C3D4', 7393);

    expect(mockZeroconf.publishService).toHaveBeenCalled();
    const txt = mockZeroconf.publishService.mock.calls[0][5];
    expect(txt).not.toHaveProperty('pairingSecret');
    expect(txt).not.toHaveProperty('ps');
    expect(txt.fingerprint).toBe('A1B2C3D4');
  });

  it('parseService accepts device with fingerprint only', () => {
    let resolved: unknown[] = [];
    const d = new MigrationDiscovery((list) => {
      resolved = list;
    });

    mockZeroconf.on.mockImplementation((event: string, cb: (s: unknown) => void) => {
      if (event === 'resolved') {
        cb({
          addresses: ['192.168.1.20'],
          port: 7393,
          name: 'pkey-recv',
          txt: {
            sessionId: 'sess1234',
            fingerprint: 'deadbeef',
            deviceName: 'Office Phone',
          },
        });
      }
      return mockZeroconf;
    });

    d.startScan();
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      ip: '192.168.1.20',
      fingerprint: 'DEADBEEF',
      sessionId: 'sess1234',
    });
    expect((resolved[0] as { pairingSecret?: string }).pairingSecret).toBeUndefined();
  });

  it('parseService ignores legacy pairingSecret in TXT', () => {
    let resolved: unknown[] = [];
    const d = new MigrationDiscovery((list) => {
      resolved = list;
    });

    mockZeroconf.on.mockImplementation((event: string, cb: (s: unknown) => void) => {
      if (event === 'resolved') {
        cb({
          host: '192.168.1.21',
          port: 7393,
          txt: {
            sid: 'sess5678',
            ps: '0123456789ABCDEF',
            pairingSecret: '0123456789ABCDEF',
            fingerprint: 'CAFEBABE',
          },
        });
      }
      return mockZeroconf;
    });

    d.startScan();
    expect((resolved[0] as { pairingSecret?: string }).pairingSecret).toBeUndefined();
  });
});
