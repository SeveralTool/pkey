/**
 * @fileoverview Test-only WebSocket double for the discovery probes. Not part
 * of the app bundle: only test files import it.
 */

export interface MockWsOptions {
  /** Hosts that accept the connection; everything else errors out. */
  reachable: (host: string) => boolean;
  /** Reply to a `challenge_request` ('' or null → stay silent). */
  reply?: (host: string, msg: Record<string, unknown>) => unknown;
  /** Artificial delay before open/reply, to observe concurrency. */
  delayMs?: number;
  /** Stay in CONNECTING forever (no onopen / onerror). */
  hangConnecting?: boolean;
}

export interface MockWsInstance {
  url: string;
  host: string;
  sent: Record<string, unknown>[];
  closed: boolean;
}

export interface MockWsHandle {
  instances: MockWsInstance[];
  hosts: () => string[];
  /** Highest number of sockets open at the same time. */
  maxConcurrent: () => number;
  /** Fires `onclose` on every live fake socket (server drop / process death). */
  disconnectAll: () => void;
  restore: () => void;
}

/**
 * Installs a fake `WebSocket` global that emulates a PKEY master answering (or
 * not answering) the challenge handshake.
 */
export function installMockWebSocket(opts: MockWsOptions): MockWsHandle {
  const instances: MockWsInstance[] = [];
  const sockets: Array<{ close: () => void }> = [];
  const original = globalThis.WebSocket;
  const delay = opts.delayMs ?? 0;
  let active = 0;
  let maxActive = 0;

  class FakeWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readyState = FakeWebSocket.CONNECTING;
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;

    private readonly record: MockWsInstance;
    private readonly host: string;

    constructor(readonly url: string) {
      this.host = url.replace(/^wss?:\/\//, '').split('/')[0] ?? '';
      this.record = { url, host: this.host, sent: [], closed: false };
      instances.push(this.record);
      sockets.push(this);
      active++;
      maxActive = Math.max(maxActive, active);
      if (opts.hangConnecting) return;
      setTimeout(() => {
        if (this.readyState !== FakeWebSocket.CONNECTING) return;
        if (opts.reachable(this.host)) {
          this.readyState = FakeWebSocket.OPEN;
          this.onopen?.();
        } else {
          this.settle();
          this.onerror?.();
          this.onclose?.();
        }
      }, delay);
    }

    send(raw: string): void {
      const msg = JSON.parse(raw) as Record<string, unknown>;
      this.record.sent.push(msg);
      const reply = opts.reply?.(this.host, msg);
      if (reply === undefined || reply === null) return;
      const replies = Array.isArray(reply) ? reply : [reply];
      setTimeout(() => {
        if (this.readyState !== FakeWebSocket.OPEN) return;
        for (const item of replies) {
          this.onmessage?.({ data: typeof item === 'string' ? item : JSON.stringify(item) });
        }
      }, delay);
    }

    close(): void {
      if (this.readyState === FakeWebSocket.CLOSED) return;
      this.settle();
      this.record.closed = true;
      this.onclose?.();
    }

    private settle(): void {
      if (this.readyState !== FakeWebSocket.CLOSED) active--;
      this.readyState = FakeWebSocket.CLOSED;
    }
  }

  (globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket;

  return {
    instances,
    hosts: () => instances.map((i) => i.host),
    maxConcurrent: () => maxActive,
    disconnectAll: () => {
      for (const socket of [...sockets]) socket.close();
    },
    restore: () => {
      (globalThis as { WebSocket: unknown }).WebSocket = original;
    },
  };
}
