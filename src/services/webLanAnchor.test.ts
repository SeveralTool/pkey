import { EMPTY_LAN_NETWORK, type LanNetworkSnapshot } from './networkUtils';
import {
  WEB_LAN_NOTIFY_COOLDOWN_MS,
  anchorFromSnapshot,
  classifyLanChange,
  decideWebLanAnchorUpdate,
  parseWebLanAnchor,
  shouldNotifyWebAddressChange,
  type WebLanAnchor,
} from './webLanAnchor';

const wifi = (
  ip: string,
  ssid: string | null,
  extras: Partial<LanNetworkSnapshot> = {}
): LanNetworkSnapshot => ({
  kind: 'wifi',
  isLikelyLan: true,
  ip,
  ssid,
  ...extras,
});

const prev = (ip: string, ssid: string | null = 'Casa'): WebLanAnchor => ({ ip, ssid });

describe('parseWebLanAnchor', () => {
  it('accepts a LAN IPv4 with optional SSID', () => {
    expect(parseWebLanAnchor({ ip: '192.168.1.10', ssid: 'Casa' })).toEqual({
      ip: '192.168.1.10',
      ssid: 'Casa',
    });
    expect(parseWebLanAnchor({ ip: '10.0.0.5', ssid: '' })).toEqual({
      ip: '10.0.0.5',
      ssid: null,
    });
    expect(parseWebLanAnchor({ ip: '172.16.0.2' })).toEqual({ ip: '172.16.0.2', ssid: null });
  });

  it('rejects junk, public IPs, and missing ip', () => {
    expect(parseWebLanAnchor(null)).toBeNull();
    expect(parseWebLanAnchor({ ssid: 'Casa' })).toBeNull();
    expect(parseWebLanAnchor({ ip: '8.8.8.8', ssid: 'x' })).toBeNull();
    expect(parseWebLanAnchor({ ip: 'not-an-ip' })).toBeNull();
  });
});

describe('anchorFromSnapshot', () => {
  it('returns null off-LAN', () => {
    expect(anchorFromSnapshot(EMPTY_LAN_NETWORK)).toBeNull();
    expect(
      anchorFromSnapshot({ kind: 'cellular', isLikelyLan: false, ip: '100.64.1.2', ssid: null })
    ).toBeNull();
  });

  it('copies ip and ssid on likely LAN', () => {
    expect(anchorFromSnapshot(wifi('192.168.0.12', 'Fibra'))).toEqual({
      ip: '192.168.0.12',
      ssid: 'Fibra',
    });
  });
});

describe('classifyLanChange', () => {
  it('seeds when there is no previous anchor', () => {
    expect(classifyLanChange(null, wifi('192.168.1.4', 'Casa'))).toBe('seed');
  });

  it('returns none for the same IP', () => {
    expect(classifyLanChange(prev('192.168.1.4'), wifi('192.168.1.4', 'Casa'))).toBe('none');
    expect(classifyLanChange(prev('192.168.1.4', null), wifi('192.168.1.4', null))).toBe('none');
  });

  it('returns network when both SSIDs are present and differ', () => {
    expect(classifyLanChange(prev('192.168.1.4', 'Casa'), wifi('192.168.0.9', 'Trabajo'))).toBe(
      'network'
    );
  });

  it('returns ip when the address changes with the same or unknown SSID', () => {
    expect(classifyLanChange(prev('192.168.1.4', 'Casa'), wifi('192.168.1.50', 'Casa'))).toBe('ip');
    expect(classifyLanChange(prev('192.168.1.4', null), wifi('192.168.1.50', null))).toBe('ip');
    expect(classifyLanChange(prev('192.168.1.4', 'Casa'), wifi('192.168.1.50', null))).toBe('ip');
  });

  it('returns lost on non-LAN and keeps the previous identity for later compare', () => {
    expect(classifyLanChange(prev('192.168.1.4'), EMPTY_LAN_NETWORK)).toBe('lost');
    expect(classifyLanChange(null, EMPTY_LAN_NETWORK)).toBe('none');
  });
});

describe('shouldNotifyWebAddressChange', () => {
  const base = {
    kind: 'ip' as const,
    serverOn: true,
    authenticatedCount: 0,
    lastNotifyAt: 0,
    now: 10_000,
  };

  it('notifies on ip or network change when the server is on and no browsers are authed', () => {
    expect(shouldNotifyWebAddressChange(base)).toBe(true);
    expect(shouldNotifyWebAddressChange({ ...base, kind: 'network' })).toBe(true);
  });

  it('does not notify when the server is off, browsers are connected, or kind is not a move', () => {
    expect(shouldNotifyWebAddressChange({ ...base, serverOn: false })).toBe(false);
    expect(shouldNotifyWebAddressChange({ ...base, authenticatedCount: 1 })).toBe(false);
    expect(shouldNotifyWebAddressChange({ ...base, kind: 'seed' })).toBe(false);
    expect(shouldNotifyWebAddressChange({ ...base, kind: 'none' })).toBe(false);
    expect(shouldNotifyWebAddressChange({ ...base, kind: 'lost' })).toBe(false);
  });

  it('respects the notify cooldown', () => {
    expect(
      shouldNotifyWebAddressChange({
        ...base,
        lastNotifyAt: 10_000,
        now: 10_000 + WEB_LAN_NOTIFY_COOLDOWN_MS - 1,
      })
    ).toBe(false);
    expect(
      shouldNotifyWebAddressChange({
        ...base,
        lastNotifyAt: 10_000,
        now: 10_000 + WEB_LAN_NOTIFY_COOLDOWN_MS,
      })
    ).toBe(true);
  });
});

describe('decideWebLanAnchorUpdate', () => {
  const now = 50_000;
  const opts = {
    serverOn: true,
    authenticatedCount: 0,
    lastNotifyAt: 0,
    now,
  };

  it('seeds on first LAN while the server is on', () => {
    expect(
      decideWebLanAnchorUpdate({ ...opts, prev: null, snap: wifi('192.168.1.4', 'Casa') })
    ).toEqual({ action: 'seed', anchor: { ip: '192.168.1.4', ssid: 'Casa' } });
  });

  it('ignores the same IP and lost LAN', () => {
    expect(
      decideWebLanAnchorUpdate({
        ...opts,
        prev: prev('192.168.1.4'),
        snap: wifi('192.168.1.4', 'Casa'),
      })
    ).toEqual({ action: 'ignore' });
    expect(
      decideWebLanAnchorUpdate({
        ...opts,
        prev: prev('192.168.1.4'),
        snap: EMPTY_LAN_NETWORK,
      })
    ).toEqual({ action: 'ignore' });
  });

  it('notifies when the IP changes and no browser is authenticated', () => {
    expect(
      decideWebLanAnchorUpdate({
        ...opts,
        prev: prev('192.168.1.4'),
        snap: wifi('192.168.1.50', 'Casa'),
      })
    ).toEqual({ action: 'notify', anchor: { ip: '192.168.1.50', ssid: 'Casa' } });
  });

  it('silently adopts when browsers are still authenticated', () => {
    expect(
      decideWebLanAnchorUpdate({
        ...opts,
        authenticatedCount: 2,
        prev: prev('192.168.1.4'),
        snap: wifi('192.168.1.50', 'Casa'),
      })
    ).toEqual({ action: 'silent-adopt', anchor: { ip: '192.168.1.50', ssid: 'Casa' } });
  });

  it('does not adopt during cooldown so a flap cannot spam after the gap', () => {
    expect(
      decideWebLanAnchorUpdate({
        ...opts,
        lastNotifyAt: now - 1_000,
        prev: prev('192.168.1.4'),
        snap: wifi('192.168.1.50', 'Casa'),
      })
    ).toEqual({ action: 'ignore' });
  });

  it('ignores snapshots while the server is off', () => {
    expect(
      decideWebLanAnchorUpdate({
        ...opts,
        serverOn: false,
        prev: null,
        snap: wifi('192.168.1.4', 'Casa'),
      })
    ).toEqual({ action: 'ignore' });
  });
});
