import {
  intentFromOsResponse,
  OS_BLOCK_ACTION_ID,
  OS_DENY_ACTION_ID,
  OS_DEFAULT_ACTION_ID,
  OS_WEB_BROWSER_CATEGORY,
  OS_PWA_CONFIRM_CATEGORY,
  parseOsNotificationData,
  stringifyOsNotificationData,
} from './osNotificationData';
import { buildOsNotificationContent } from './osChannels';

describe('stringifyOsNotificationData', () => {
  it('drops null and undefined and stringifies remaining values', () => {
    expect(
      stringifyOsNotificationData({
        type: 'web-browser-synced',
        sourceId: 'web-abc',
        socketId: undefined,
        ip: null,
      })
    ).toEqual({
      type: 'web-browser-synced',
      sourceId: 'web-abc',
    });
  });
});

describe('parseOsNotificationData', () => {
  it('rejects unknown or missing type', () => {
    expect(parseOsNotificationData(null)).toBeNull();
    expect(parseOsNotificationData({ type: 'nope' })).toBeNull();
  });

  it('accepts screenshot, browser, and LAN-change payloads', () => {
    expect(parseOsNotificationData({ type: 'screenshot-detected' })).toEqual({
      type: 'screenshot-detected',
      sourceId: null,
      socketId: null,
      ip: null,
      requestId: null,
    });
    expect(
      parseOsNotificationData({
        type: 'web-browser-synced',
        sourceId: 'web-1',
        socketId: 'sock',
        ip: '10.0.0.2',
      })
    ).toEqual({
      type: 'web-browser-synced',
      sourceId: 'web-1',
      socketId: 'sock',
      ip: '10.0.0.2',
      requestId: null,
    });
    expect(parseOsNotificationData({ type: 'web-lan-changed' })).toEqual({
      type: 'web-lan-changed',
      sourceId: null,
      socketId: null,
      ip: null,
      requestId: null,
    });
    expect(
      parseOsNotificationData({
        type: 'pwa-action-confirm',
        sourceId: 'web-1',
        requestId: 'req-1',
      })
    ).toEqual({
      type: 'pwa-action-confirm',
      sourceId: 'web-1',
      socketId: null,
      ip: null,
      requestId: 'req-1',
    });
  });
});

describe('intentFromOsResponse', () => {
  it('routes screenshot taps to settings', () => {
    expect(intentFromOsResponse(OS_DEFAULT_ACTION_ID, { type: 'screenshot-detected' })).toEqual({
      kind: 'screenshot',
      sourceId: null,
      socketId: null,
      ip: null,
      requestId: null,
      unlockedAtDispatch: false,
    });
  });

  it('routes LAN-change taps to Security (web-open), with no block action', () => {
    expect(intentFromOsResponse(OS_DEFAULT_ACTION_ID, { type: 'web-lan-changed' })?.kind).toBe(
      'web-open'
    );
    expect(intentFromOsResponse(OS_BLOCK_ACTION_ID, { type: 'web-lan-changed' })?.kind).toBe(
      'web-open'
    );
  });

  it('routes browser body tap to open and action to block', () => {
    const data = { type: 'web-browser-synced', sourceId: 'web-1', ip: '10.0.0.2' };
    expect(intentFromOsResponse(OS_DEFAULT_ACTION_ID, data)?.kind).toBe('web-open');
    expect(intentFromOsResponse(OS_BLOCK_ACTION_ID, data)?.kind).toBe('web-block');
  });

  it('routes PWA action-confirm tap to open and Deny to deny', () => {
    const data = {
      type: 'pwa-action-confirm',
      sourceId: 'web-1',
      requestId: 'req-1',
    };
    expect(intentFromOsResponse(OS_DEFAULT_ACTION_ID, data)).toEqual({
      kind: 'pwa-confirm-open',
      sourceId: 'web-1',
      socketId: null,
      ip: null,
      requestId: 'req-1',
      unlockedAtDispatch: false,
    });
    expect(intentFromOsResponse(OS_DENY_ACTION_ID, data)?.kind).toBe('pwa-confirm-deny');
  });

  it('routes PWA unlock tap to open and Deny to deny', () => {
    const data = {
      type: 'pwa-unlock',
      sourceId: 'web-1',
      requestId: 'req-unlock',
    };
    expect(intentFromOsResponse(OS_DEFAULT_ACTION_ID, data)?.kind).toBe('pwa-unlock-open');
    expect(intentFromOsResponse(OS_DENY_ACTION_ID, data)?.kind).toBe('pwa-unlock-deny');
  });
});

describe('buildOsNotificationContent', () => {
  it('maps channel id into content payload', () => {
    expect(
      buildOsNotificationContent({
        title: 'Security',
        body: 'Screenshot detected',
        channel: 'pkey-security',
        data: { type: 'screenshot-detected' },
      })
    ).toEqual({
      title: 'Security',
      body: 'Screenshot detected',
      data: { type: 'screenshot-detected' },
      channelId: 'pkey-security',
    });
  });

  it('adds block category and omits null data fields for browser alerts', () => {
    expect(
      buildOsNotificationContent({
        title: 'Browser synced',
        body: 'A browser synced with PKEY (Chrome · Windows).',
        channel: 'pkey-actions',
        data: {
          type: 'web-browser-synced',
          sourceId: 'web-1',
          socketId: 'sock',
          ip: null,
        },
      })
    ).toEqual({
      title: 'Browser synced',
      body: 'A browser synced with PKEY (Chrome · Windows).',
      data: {
        type: 'web-browser-synced',
        sourceId: 'web-1',
        socketId: 'sock',
      },
      channelId: 'pkey-actions',
      categoryIdentifier: OS_WEB_BROWSER_CATEGORY,
    });
  });

  it('does not add a block category for LAN-address alerts', () => {
    expect(
      buildOsNotificationContent({
        title: 'Web access address changed',
        body: 'Open PKEY to see the new URL and QR code.',
        channel: 'pkey-actions',
        data: { type: 'web-lan-changed' },
      })
    ).toEqual({
      title: 'Web access address changed',
      body: 'Open PKEY to see the new URL and QR code.',
      data: { type: 'web-lan-changed' },
      channelId: 'pkey-actions',
    });
  });

  it('adds deny category for PWA action-confirm alerts', () => {
    expect(
      buildOsNotificationContent({
        title: 'Confirm on this phone',
        body: 'A browser wants to copy a secret.',
        channel: 'pkey-actions',
        data: { type: 'pwa-action-confirm', sourceId: 'web-1', requestId: 'req-1' },
      })
    ).toEqual({
      title: 'Confirm on this phone',
      body: 'A browser wants to copy a secret.',
      data: { type: 'pwa-action-confirm', sourceId: 'web-1', requestId: 'req-1' },
      channelId: 'pkey-actions',
      categoryIdentifier: OS_PWA_CONFIRM_CATEGORY,
    });
  });
});
