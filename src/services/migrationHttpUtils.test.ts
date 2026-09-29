import {
  tryParseRequestWithConsumed,
  MAX_HTTP_BODY_BYTES,
  tryParseRequest,
} from './migrationHttpUtils';

const makeRequest = (headers: string, body = ''): string =>
  `POST /pkey/test HTTP/1.1\r\n${headers}\r\n\r\n${body}`;

describe('migrationHttpUtils', () => {
  it('parses a valid request', () => {
    const raw = makeRequest('Content-Length: 2', '{}');
    const parsed = tryParseRequestWithConsumed(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.req.method).toBe('POST');
      expect(parsed.req.path).toBe('/pkey/test');
      expect(parsed.req.body).toBe('{}');
    }
  });

  it('rejects Content-Length above 2MB with 413', () => {
    const cl = MAX_HTTP_BODY_BYTES + 1;
    const raw = makeRequest(`Content-Length: ${cl}`, '');
    const parsed = tryParseRequestWithConsumed(raw);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok && !parsed.incomplete) {
      expect(parsed.status).toBe(413);
      expect(parsed.code).toBe('PAYLOAD_TOO_LARGE');
    }
  });

  it('rejects absurd Content-Length values', () => {
    const raw = makeRequest('Content-Length: 9999999999999', '');
    const parsed = tryParseRequestWithConsumed(raw);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok && !parsed.incomplete) {
      expect(parsed.status).toBe(413);
    }
  });

  it('rejects Transfer-Encoding chunked', () => {
    const raw = makeRequest('Transfer-Encoding: chunked\r\nContent-Length: 0', '');
    const parsed = tryParseRequestWithConsumed(raw);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok && !parsed.incomplete) {
      expect(parsed.status).toBe(400);
      expect(parsed.code).toBe('CHUNKED_NOT_SUPPORTED');
    }
  });

  it('rejects invalid path characters', () => {
    const raw = 'GET /foo<script> HTTP/1.1\r\n\r\n';
    const parsed = tryParseRequestWithConsumed(raw);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok && !parsed.incomplete) {
      expect(parsed.status).toBe(400);
      expect(parsed.code).toBe('BAD_PATH');
    }
  });

  it('returns incomplete when body not fully received', () => {
    const raw = makeRequest('Content-Length: 10', 'short');
    const parsed = tryParseRequestWithConsumed(raw);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.incomplete).toBe(true);
    expect(tryParseRequest(raw)).toBeNull();
  });
});
