import {
  EMPTY_LAN_NETWORK,
  isLikelyLanIpv4,
  lanSnapshotFromNetInfo,
  sameLanSnapshot,
  type LanNetworkSnapshot,
} from './networkUtils';

describe('sameLanSnapshot', () => {
  it('compares kind, LAN flag, IP, and SSID', () => {
    const wifi: LanNetworkSnapshot = {
      kind: 'wifi',
      isLikelyLan: true,
      ip: '192.168.1.10',
      ssid: 'Home',
    };
    expect(sameLanSnapshot(wifi, { ...wifi })).toBe(true);
    expect(sameLanSnapshot(wifi, { ...wifi, ssid: 'Other' })).toBe(false);
    expect(sameLanSnapshot(wifi, EMPTY_LAN_NETWORK)).toBe(false);
  });
});

describe('isLikelyLanIpv4', () => {
  it('accepts RFC1918 and link-local addresses', () => {
    expect(isLikelyLanIpv4('192.168.1.20')).toBe(true);
    expect(isLikelyLanIpv4('10.0.0.5')).toBe(true);
    expect(isLikelyLanIpv4('172.16.0.1')).toBe(true);
    expect(isLikelyLanIpv4('172.31.255.255')).toBe(true);
    expect(isLikelyLanIpv4('169.254.10.2')).toBe(true);
  });

  it('rejects CGNAT, loopback, public, and junk', () => {
    expect(isLikelyLanIpv4('100.64.0.1')).toBe(false);
    expect(isLikelyLanIpv4('100.127.1.1')).toBe(false);
    expect(isLikelyLanIpv4('127.0.0.1')).toBe(false);
    expect(isLikelyLanIpv4('8.8.8.8')).toBe(false);
    expect(isLikelyLanIpv4('172.32.0.1')).toBe(false);
    expect(isLikelyLanIpv4('not-an-ip')).toBe(false);
    expect(isLikelyLanIpv4(null)).toBe(false);
    expect(isLikelyLanIpv4('')).toBe(false);
  });
});

describe('lanSnapshotFromNetInfo', () => {
  it('maps wifi with LAN IP and SSID', () => {
    expect(
      lanSnapshotFromNetInfo({
        type: 'wifi',
        isConnected: true,
        details: { ipAddress: '192.168.0.12', ssid: 'Casa-Fibra' },
      })
    ).toEqual({
      kind: 'wifi',
      isLikelyLan: true,
      ip: '192.168.0.12',
      ssid: 'Casa-Fibra',
    });
  });

  it('strips quotes and ignores unknown Android SSIDs', () => {
    expect(
      lanSnapshotFromNetInfo({
        type: 'wifi',
        isConnected: true,
        details: { ipAddress: '192.168.1.4', ssid: '"Casa"' },
      }).ssid
    ).toBe('Casa');
    expect(
      lanSnapshotFromNetInfo({
        type: 'wifi',
        isConnected: true,
        details: { ipAddress: '192.168.1.4', ssid: '"<unknown ssid>"' },
      }).ssid
    ).toBeNull();
  });

  it('maps wifi with missing SSID', () => {
    const snap = lanSnapshotFromNetInfo({
      type: 'wifi',
      isConnected: true,
      details: { ipAddress: '10.1.1.8', ssid: null },
    });
    expect(snap.kind).toBe('wifi');
    expect(snap.isLikelyLan).toBe(true);
    expect(snap.ssid).toBeNull();
  });

  it('maps cellular CGNAT as not LAN', () => {
    expect(
      lanSnapshotFromNetInfo({
        type: 'cellular',
        isConnected: true,
        details: { ipAddress: '100.64.12.3' },
      })
    ).toEqual({
      kind: 'cellular',
      isLikelyLan: false,
      ip: '100.64.12.3',
      ssid: null,
    });
  });

  it('maps disconnected and null states to empty-ish none', () => {
    expect(lanSnapshotFromNetInfo({ type: 'none', isConnected: false, details: null })).toEqual({
      kind: 'none',
      isLikelyLan: false,
      ip: null,
      ssid: null,
    });
    expect(lanSnapshotFromNetInfo(null)).toEqual(EMPTY_LAN_NETWORK);
  });

  it('maps ethernet LAN', () => {
    const snap = lanSnapshotFromNetInfo({
      type: 'ethernet',
      isConnected: true,
      details: { ipAddress: '192.168.10.4' },
    });
    expect(snap.kind).toBe('ethernet');
    expect(snap.isLikelyLan).toBe(true);
  });
});
