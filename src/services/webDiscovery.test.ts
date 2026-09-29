/**
 * @fileoverview Unit tests for WebDiscovery mDNS publication.
 */
import { WebDiscovery, isWebDiscoveryAvailable } from './webDiscovery';
import { WEB_SYNC_PORT } from './webProtocol';

const mockZeroconf = {
  on: jest.fn(),
  publishService: jest.fn(),
  unpublishService: jest.fn(),
  stop: jest.fn(),
  removeDeviceListeners: jest.fn(),
  removeAllListeners: jest.fn(),
};

jest.mock('./zeroconfPlatform', () => ({
  isZeroconfAvailable: jest.fn(() => true),
  createZeroconfInstance: jest.fn(() => mockZeroconf),
  stopZeroconfInstance: jest.fn(),
}));

const { isZeroconfAvailable, createZeroconfInstance } = jest.requireMock('./zeroconfPlatform');

describe('WebDiscovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (isZeroconfAvailable as jest.Mock).mockReturnValue(true);
    (createZeroconfInstance as jest.Mock).mockReturnValue(mockZeroconf);
    mockZeroconf.on.mockImplementation(() => mockZeroconf);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('isWebDiscoveryAvailable mirrors zeroconf platform', () => {
    expect(isWebDiscoveryAvailable()).toBe(true);
  });

  it('returns null when zeroconf is unavailable', async () => {
    (isZeroconfAvailable as jest.Mock).mockReturnValue(false);
    const discovery = new WebDiscovery();
    await expect(discovery.publish(WEB_SYNC_PORT, 'abcd1234', 'Casa')).resolves.toBeNull();
  });

  it('resolves .local URL on published event', async () => {
    const discovery = new WebDiscovery();
    const promise = discovery.publish(WEB_SYNC_PORT, 'A1B2C3D4', 'MiPkey');
    await Promise.resolve();

    const publishedHandler = mockZeroconf.on.mock.calls.find(
      (c: unknown[]) => c[0] === 'published'
    )?.[1];
    expect(publishedHandler).toBeDefined();
    publishedHandler!({
      host: 'mipkey-a1b2.local.',
      port: WEB_SYNC_PORT,
    });

    await expect(promise).resolves.toBe(`http://mipkey-a1b2.local:${WEB_SYNC_PORT}`);
    expect(mockZeroconf.publishService).toHaveBeenCalledWith(
      '_pkey-web',
      'tcp',
      'local.',
      'mipkey-a1b2',
      WEB_SYNC_PORT,
      { deviceName: 'MiPkey', type: 'web', v: '1' }
    );
  });

  it('uses optimistic .local URL on timeout', async () => {
    const discovery = new WebDiscovery();
    const promise = discovery.publish(WEB_SYNC_PORT, 'A1B2C3D4', 'Casa');
    await Promise.resolve();
    expect(discovery.getPublishedHost()).toBe('casa-a1b2.local');
    jest.advanceTimersByTime(3000);
    await expect(promise).resolves.toBe(`http://casa-a1b2.local:${WEB_SYNC_PORT}`);
  });

  it('exposes the optimistic hostname before Bonjour fires published', async () => {
    const discovery = new WebDiscovery();
    const promise = discovery.publish(WEB_SYNC_PORT, 'A1B2C3D4', 'PKEY-Android');
    await Promise.resolve();
    expect(discovery.getPublishedHost()).toBe('pkey-android-a1b2.local');
    expect(discovery.getPublishedUrl()).toBe(`http://pkey-android-a1b2.local:${WEB_SYNC_PORT}`);
    const publishedHandler = mockZeroconf.on.mock.calls.find(
      (c: unknown[]) => c[0] === 'published'
    )?.[1];
    publishedHandler!({ host: 'pkey-android-a1b2.local.' });
    await promise;
  });

  it('unpublish calls unpublishService with instance name', async () => {
    const discovery = new WebDiscovery();
    const promise = discovery.publish(WEB_SYNC_PORT, 'A1B2C3D4', 'Casa');
    await Promise.resolve();
    const publishedHandler = mockZeroconf.on.mock.calls.find(
      (c: unknown[]) => c[0] === 'published'
    )?.[1];
    publishedHandler!({ host: 'casa-a1b2.local.' });
    await promise;

    discovery.unpublish();
    expect(mockZeroconf.unpublishService).toHaveBeenCalledWith('casa-a1b2');
  });
});
