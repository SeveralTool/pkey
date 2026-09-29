import { parseEncryptedDatabase, parseEncryptedDatabaseJson } from './encryptedDatabase';

const vault = {
  version: '1.0.0',
  passwordHash: 'hash',
  salt: 'aabb',
  creation_date: '2026-01-01',
  last_update: '2026-01-01',
  settings: { autoLogout: '1M', theme: 'DARK', language: 'ESP' },
  cards: [{ id: 'c1', passwordList: ['x'] }],
};

describe('parseEncryptedDatabase', () => {
  it('accepts a historic string-version vault', () => {
    const parsed = parseEncryptedDatabase(vault);
    expect(parsed?.passwordHash).toBe('hash');
    expect(parsed?.cards[0]?.id).toBe('c1');
    expect(parsed?.version).toBe('1.0.0');
  });

  it('rejects missing passwordHash or cards', () => {
    expect(parseEncryptedDatabase({ ...vault, passwordHash: 1 })).toBeNull();
    expect(parseEncryptedDatabase({ ...vault, cards: 'nope' })).toBeNull();
    expect(parseEncryptedDatabase({ ...vault, cards: [{ noId: true }] })).toBeNull();
    expect(parseEncryptedDatabase(null)).toBeNull();
  });

  it('parseEncryptedDatabaseJson returns null on invalid JSON', () => {
    expect(parseEncryptedDatabaseJson('{')).toBeNull();
    expect(parseEncryptedDatabaseJson(JSON.stringify(vault))?.salt).toBe('aabb');
  });
});
