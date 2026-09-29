/**
 * @fileoverview mDNS publication for the web sync server (port 7392).
 */

import {
  createZeroconfInstance,
  isZeroconfAvailable,
  stopZeroconfInstance,
} from './zeroconfPlatform';
import {
  WEB_SERVICE_TYPE,
  WEB_SERVICE_PROTOCOL,
  WEB_SERVICE_DOMAIN,
  buildWebInstanceName,
  buildWebAccessUrl,
  buildWebAccessUrlFromInstance,
  hostToMdnsUrlHostname,
} from './webProtocol';

const PUBLISH_TIMEOUT_MS = 3000;

export const isWebDiscoveryAvailable = isZeroconfAvailable;

type PublishSource = 'none' | 'published' | 'timeout' | 'error' | 'failed';

export class WebDiscovery {
  private zeroconf: any = null;
  private publishedInstanceName: string | null = null;
  private publishedUrl: string | null = null;
  private publishSource: PublishSource = 'none';
  private publishedHost: string | null = null;

  getPublishSource(): PublishSource {
    return this.publishSource;
  }

  getPublishedHost(): string | null {
    return this.publishedHost;
  }

  async publish(port: number, deviceId: string, baseName: string): Promise<string | null> {
    if (!isZeroconfAvailable() || !deviceId) {
      return null;
    }

    this.unpublish();

    let instanceName: string;
    try {
      instanceName = buildWebInstanceName(baseName, deviceId);
    } catch {
      return null;
    }

    const zeroconf = createZeroconfInstance();
    if (!zeroconf) {
      return null;
    }

    this.zeroconf = zeroconf;
    this.publishedInstanceName = instanceName;
    this.publishedUrl = null;
    this.publishSource = 'none';
    this.publishedHost = null;

    const optimisticUrl = buildWebAccessUrlFromInstance(instanceName, port);
    const optimisticHost = `${instanceName}.local`;
    // Advertise immediately so `/pkey/meta` never serves an empty mdnsHost
    // during the few seconds before Bonjour/NSD fires `published`.
    this.publishedUrl = optimisticUrl;
    this.publishedHost = optimisticHost;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (url: string | null, source: PublishSource, host?: string) => {
        if (settled) return;
        settled = true;
        this.publishSource = source;
        if (url) {
          this.publishedUrl = url;
          this.publishedHost = hostToMdnsUrlHostname(host || optimisticHost);
        } else {
          this.publishedUrl = null;
          this.publishedHost = null;
        }
        resolve(url);
      };

      const timer = setTimeout(() => {
        console.warn('[WebDiscovery] publish timeout — using optimistic mDNS URL');
        finish(optimisticUrl, 'timeout', `${instanceName}.local`);
      }, PUBLISH_TIMEOUT_MS);

      zeroconf.on('published', (service: any) => {
        clearTimeout(timer);
        const rawHost = service?.host || `${instanceName}.local`;
        const url = buildWebAccessUrl(rawHost, port);
        finish(url, 'published', rawHost);
      });

      zeroconf.on('error', (err: any) => {
        clearTimeout(timer);
        console.warn('[WebDiscovery] publish error — using optimistic mDNS URL');
        finish(optimisticUrl, 'error', `${instanceName}.local`);
      });

      try {
        zeroconf.publishService(
          WEB_SERVICE_TYPE,
          WEB_SERVICE_PROTOCOL,
          WEB_SERVICE_DOMAIN,
          instanceName,
          port,
          { deviceName: baseName, type: 'web', v: '1' }
        );
      } catch (e) {
        clearTimeout(timer);
        this.zeroconf = null;
        this.publishedInstanceName = null;
        finish(null, 'failed');
      }
    });
  }

  unpublish(): void {
    if (this.zeroconf) {
      try {
        if (this.publishedInstanceName) {
          this.zeroconf.unpublishService(this.publishedInstanceName);
        }
        stopZeroconfInstance(this.zeroconf);
      } catch {
        /* ignore */
      }
      this.zeroconf = null;
    }
    this.publishedInstanceName = null;
    this.publishedUrl = null;
    this.publishSource = 'none';
    this.publishedHost = null;
  }

  getPublishedUrl(): string | null {
    return this.publishedUrl;
  }

  getPublishedInstanceName(): string | null {
    return this.publishedInstanceName;
  }

  isPublished(): boolean {
    return !!this.publishedUrl && !!this.zeroconf;
  }
}
