import { describe, it, expect } from 'vitest';
import { linkGroupKey, linkGroupLabel, groupCardsByLinkKey } from './groupCardsByLink';

const card = (id: string, link: string, title = id, username = 'u') => ({
  id,
  link,
  title,
  username,
});

describe('linkGroupKey', () => {
  it('normalizes www, path, query, and fragment onto the same host key', () => {
    expect(linkGroupKey('https://www.google.com/login?x=1#frag')).toBe('host:google.com');
    expect(linkGroupKey('google.com')).toBe('host:google.com');
    expect(linkGroupKey('http://Google.com/a')).toBe('host:google.com');
  });

  it('keeps non-default ports in the key', () => {
    expect(linkGroupKey('https://sub.example.com:8443/a')).toBe('host:sub.example.com:8443');
    expect(linkGroupKey('https://sub.example.com/a')).toBe('host:sub.example.com');
  });

  it('does not merge different hosts or subdomains', () => {
    expect(linkGroupKey('https://mail.google.com')).toBe('host:mail.google.com');
    expect(linkGroupKey('https://google.com')).toBe('host:google.com');
    expect(linkGroupKey('https://mail.google.com')).not.toBe(linkGroupKey('https://google.com'));
  });

  it('groups android packages across schemes', () => {
    expect(linkGroupKey('android-app://com.bank.app/path')).toBe('pkg:com.bank.app');
    expect(linkGroupKey('android://token@com.bank.app/')).toBe('pkg:com.bank.app');
    expect(linkGroupKey('com.bank.app')).toBe('pkg:com.bank.app');
  });

  it('returns null for empty or unparseable links', () => {
    expect(linkGroupKey('')).toBeNull();
    expect(linkGroupKey('   ')).toBeNull();
    expect(linkGroupKey('not a url')).toBeNull();
    expect(linkGroupKey('just-words')).toBeNull();
  });

  it('supports localhost and IPv4', () => {
    expect(linkGroupKey('http://localhost:3000/app')).toBe('host:localhost:3000');
    expect(linkGroupKey('http://192.168.1.1/admin')).toBe('host:192.168.1.1');
  });
});

describe('linkGroupLabel', () => {
  it('strips key prefixes', () => {
    expect(linkGroupLabel('host:google.com')).toBe('google.com');
    expect(linkGroupLabel('pkg:com.bank.app')).toBe('com.bank.app');
  });
});

describe('groupCardsByLinkKey', () => {
  it('groups matching hosts and leaves others as singles', () => {
    const cards = [
      card('a', 'https://www.google.com/login', 'Gmail Work', 'a@x'),
      card('b', 'https://github.com', 'GitHub'),
      card('c', 'google.com', 'Gmail Personal', 'b@x'),
      card('d', '', 'Note-like'),
      card('e', 'https://github.com/org', 'GitHub Org'),
    ];
    const rows = groupCardsByLinkKey(cards);
    expect(rows.map((r) => r.kind)).toEqual(['group', 'group', 'single']);
    const google = rows[0];
    expect(google.kind).toBe('group');
    if (google.kind === 'group') {
      expect(google.key).toBe('host:google.com');
      expect(google.cards.map((c) => c.id)).toEqual(['c', 'a']); // title sort: Gmail Personal, Gmail Work
    }
    const github = rows[1];
    expect(github.kind).toBe('group');
    if (github.kind === 'group') {
      expect(github.cards.map((c) => c.id).sort()).toEqual(['b', 'e']);
    }
    expect(rows[2]).toEqual({ kind: 'single', card: cards[3] });
  });

  it('keeps size-1 host buckets as singles', () => {
    const rows = groupCardsByLinkKey([card('only', 'https://example.com')]);
    expect(rows).toEqual([{ kind: 'single', card: expect.objectContaining({ id: 'only' }) }]);
  });
});
