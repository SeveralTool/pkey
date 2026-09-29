import { getTlsClientOptions } from './tlsCredentials';

describe('migrationHttpClient TLS', () => {
  it('getTlsClientOptions enables TLS with certificate verification disabled for self-signed LAN certs', () => {
    const opts = getTlsClientOptions('192.168.1.10', 7393);
    expect(opts).toEqual({
      host: '192.168.1.10',
      port: 7393,
      rejectUnauthorized: false,
    });
  });
});
