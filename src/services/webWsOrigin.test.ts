/**
 * @fileoverview Unit tests for WebSocket Origin allowlist helper.
 */
import { isAllowedWsOrigin } from './webWsOrigin';

describe('isAllowedWsOrigin', () => {
  it('allows missing Origin', () => {
    expect(isAllowedWsOrigin(undefined, '192.168.1.5:7392')).toBe(true);
  });

  it('allows localhost and private LAN origins', () => {
    expect(isAllowedWsOrigin('http://localhost:5173', 'localhost:7392')).toBe(true);
    expect(isAllowedWsOrigin('http://192.168.1.10:7392', '192.168.1.10:7392')).toBe(true);
    expect(isAllowedWsOrigin('http://phone.local:7392', 'phone.local:7392')).toBe(true);
  });

  it('rejects public origins that do not match Host', () => {
    expect(isAllowedWsOrigin('https://evil.example', '192.168.1.5:7392')).toBe(false);
  });
});
