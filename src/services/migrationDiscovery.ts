/**
 * @fileoverview mDNS discovery for migration receivers on the local network.
 */

import {
  MIGRATION_PORT,
  MIGRATION_SERVICE_TYPE,
  MIGRATION_SERVICE_PROTOCOL,
  MIGRATION_SERVICE_DOMAIN,
  type DiscoveredMigrationDevice,
} from './migrationProtocol';
import {
  createZeroconfInstance,
  isZeroconfAvailable,
  stopZeroconfInstance,
} from './zeroconfPlatform';
import { getDefaultDeviceName } from './deviceName';

export { getDefaultDeviceName } from './deviceName';

/** True only when JS module AND native RNZeroconf module are both present. */
export const isMigrationDiscoveryAvailable = isZeroconfAvailable;

export class MigrationDiscovery {
  private zeroconf: any = null;
  private devices = new Map<string, DiscoveredMigrationDevice>();
  private onUpdate: ((devices: DiscoveredMigrationDevice[]) => void) | null = null;

  constructor(onUpdate?: (devices: DiscoveredMigrationDevice[]) => void) {
    this.onUpdate = onUpdate || null;
  }

  private emit(): void {
    this.onUpdate?.(Array.from(this.devices.values()));
  }

  private parseService(service: any): DiscoveredMigrationDevice | null {
    const ip = service?.addresses?.[0] || service?.host;
    if (!ip) return null;
    const port = service?.port || MIGRATION_PORT;
    const txt = service?.txt || {};
    const sessionId = txt.sessionId || txt.sid || '';
    const fingerprint = (txt.fingerprint || txt.fp || '').toUpperCase();
    const name = txt.deviceName || service?.name || 'PKEY Device';
    // Never use pairingSecret from TXT — legacy receivers may still publish it.
    if (!sessionId || !fingerprint) return null;
    return { name, ip, port, sessionId, fingerprint };
  }

  private createInstance(): boolean {
    if (!isMigrationDiscoveryAvailable()) return false;
    this.zeroconf = createZeroconfInstance();
    return !!this.zeroconf;
  }

  startScan(): void {
    if (!this.createInstance()) return;

    this.devices.clear();

    this.zeroconf.on('resolved', (service: any) => {
      const device = this.parseService(service);
      if (device) {
        this.devices.set(`${device.ip}:${device.port}`, device);
        this.emit();
      }
    });

    this.zeroconf.on('remove', (service: any) => {
      const ip = service?.addresses?.[0] || service?.host;
      const port = service?.port || MIGRATION_PORT;
      if (ip) {
        this.devices.delete(`${ip}:${port}`);
        this.emit();
      }
    });

    try {
      this.zeroconf.scan(
        MIGRATION_SERVICE_TYPE,
        MIGRATION_SERVICE_PROTOCOL,
        MIGRATION_SERVICE_DOMAIN
      );
    } catch {
      this.zeroconf = null;
    }
  }

  stopScan(): void {
    if (this.zeroconf) {
      stopZeroconfInstance(this.zeroconf);
      this.zeroconf = null;
    }
    this.devices.clear();
  }

  publish(
    deviceName: string,
    sessionId: string,
    channelFingerprint: string,
    port = MIGRATION_PORT
  ): void {
    if (!this.createInstance()) return;

    const safeName = deviceName.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 32) || 'pkey';
    const fp = channelFingerprint.toUpperCase();
    try {
      this.zeroconf.publishService(
        MIGRATION_SERVICE_TYPE,
        MIGRATION_SERVICE_PROTOCOL,
        MIGRATION_SERVICE_DOMAIN,
        safeName,
        port,
        {
          deviceName,
          sessionId,
          sid: sessionId,
          fingerprint: fp,
          fp,
          v: '2',
          requiresPairing: '1',
        }
      );
    } catch {
      this.zeroconf = null;
    }
  }

  unpublish(): void {
    if (this.zeroconf) {
      try {
        const safeName = Object.keys(this.zeroconf._publishedServices || {})[0];
        if (safeName) {
          this.zeroconf.unpublishService(safeName);
        }
        stopZeroconfInstance(this.zeroconf);
      } catch {
        /* ignore */
      }
      this.zeroconf = null;
    }
  }

  getDevices(): DiscoveredMigrationDevice[] {
    return Array.from(this.devices.values());
  }
}
