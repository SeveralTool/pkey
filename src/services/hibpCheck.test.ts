/**
 * @jest-environment node
 */
import { checkPasswordAgainstHibp } from './hibpCheck';
import { sha1Bytes } from '../utils/sha1';

// Reproduce the client-side hex + upper-case that the service does so we
// can construct realistic API responses.
const sha1Upper = (s: string): string => {
  const bytes = sha1Bytes(s);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out.toUpperCase();
};

interface MockFetchInvocation {
  url: string;
  headers?: Record<string, string>;
}

const buildFetchMock = (responseBuilder: (prefix: string) => { status: number; body: string }) => {
  const invocations: MockFetchInvocation[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const headers = init?.headers as Record<string, string> | undefined;
    invocations.push({ url, headers });
    const prefix = url.split('/').pop() ?? '';
    const { status, body } = responseBuilder(prefix);
    return new Response(body, { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, invocations };
};

describe('checkPasswordAgainstHibp', () => {
  it('only sends the 5-char hash prefix (k-anonymity)', async () => {
    const password = 'CorrectHorseBatteryStaple';
    const fullHash = sha1Upper(password);
    const expectedPrefix = fullHash.slice(0, 5);
    const expectedSuffix = fullHash.slice(5);

    const { fetchImpl, invocations } = buildFetchMock(() => ({
      status: 200,
      // Return one line matching our suffix with count=7.
      body: `${expectedSuffix}:7\r\nAAAAA:1`,
    }));

    const result = await checkPasswordAgainstHibp(password, { fetchImpl });

    expect(invocations).toHaveLength(1);
    expect(invocations[0].url).toBe(`https://api.pwnedpasswords.com/range/${expectedPrefix}`);
    // Password itself MUST NOT appear anywhere in the outgoing request.
    expect(invocations[0].url).not.toContain(password);
    expect(invocations[0].url).not.toContain(fullHash.slice(5, 10));
    // Padding request is set so response size cannot leak the answer.
    expect(invocations[0].headers?.['Add-Padding']).toBe('true');

    expect(result).toEqual({ status: 'breached', count: 7 });
  });

  it('reports "clean" when the suffix is absent from the list', async () => {
    const { fetchImpl } = buildFetchMock(() => ({
      status: 200,
      body: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0\r\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:0',
    }));

    const result = await checkPasswordAgainstHibp('some-unbreached-password', { fetchImpl });
    expect(result).toEqual({ status: 'clean' });
  });

  it('treats count=0 (HIBP padding) as clean', async () => {
    const password = 'unique-value';
    const fullHash = sha1Upper(password);
    const suffix = fullHash.slice(5);
    const { fetchImpl } = buildFetchMock(() => ({
      status: 200,
      body: `${suffix}:0`,
    }));

    const result = await checkPasswordAgainstHibp(password, { fetchImpl });
    expect(result).toEqual({ status: 'clean' });
  });

  it('returns an error state on non-200 HTTP responses', async () => {
    const { fetchImpl } = buildFetchMock(() => ({ status: 502, body: '' }));
    const result = await checkPasswordAgainstHibp('anything', { fetchImpl });
    expect(result).toEqual({ status: 'error', reason: 'http-502' });
  });

  it('returns an empty-password error for the empty string', async () => {
    const result = await checkPasswordAgainstHibp('');
    expect(result).toEqual({ status: 'error', reason: 'empty-password' });
  });

  it('times out via AbortController and reports "timeout"', async () => {
    // A never-resolving fetch to force the internal AbortController to fire.
    const fetchImpl = ((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The user aborted a request.');
          err.name = 'AbortError';
          reject(err);
        });
      })) as unknown as typeof fetch;

    const result = await checkPasswordAgainstHibp('password', {
      fetchImpl,
      timeoutMs: 10,
    });
    expect(result).toEqual({ status: 'error', reason: 'timeout' });
  });
});
