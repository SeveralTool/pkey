import { describe, it, expect } from 'vitest';
import { parseCsv } from '../csv-generic';
import { sanitizeRow } from '../sanitizer/sanitize';
import { OnePasswordParser, parseOnePasswordArchive } from '../parsers/onepassword';
import { ImportParseError } from '../ImportParseError';
import { zipSync } from 'fflate';
import { dedupeImportCards, applyImportMapping } from '../pipeline';
import type { PasswordCard } from '../../types';

describe('parseCsv multiline', () => {
  it('keeps newlines inside quoted fields', () => {
    const csv = [
      'title,username,password,notes',
      'Site,user,pass,"line1',
      'line2"',
    ].join('\n');
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(['title', 'username', 'password', 'notes']);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.notes).toBe('line1\nline2');
    expect(rows[0]!.password).toBe('pass');
  });

  it('parses TSV', () => {
    const tsv = 'title\tusername\tpassword\nA\tb\tc';
    const { rows } = parseCsv(tsv);
    expect(rows[0]).toEqual({ title: 'A', username: 'b', password: 'c' });
  });
});

describe('sanitize OTP', () => {
  const mapping = [{ sourceHeader: 'otpSecret', targetField: 'otpSecret' as const }];

  it('parses otpauth:// and keeps metadata', () => {
    const { partial, warnings } = sanitizeRow(
      {
        otpSecret:
          'otpauth://totp/Ex:user?secret=JBSWY3DPEHPK3PXP&issuer=Ex&algorithm=SHA256&digits=8&period=60',
      },
      mapping,
      0
    );
    expect(warnings.filter((w) => w.kind === 'invalid_otp')).toHaveLength(0);
    expect(partial.otpSecret).toBe('JBSWY3DPEHPK3PXP');
    expect(partial.otpAlgorithm).toBe('SHA256');
    expect(partial.otpDigits).toBe(8);
    expect(partial.otpPeriod).toBe(60);
  });

  it('rejects invalid otpauth and bad base32', () => {
    const badUri = sanitizeRow({ otpSecret: 'otpauth://totp/x?secret=INVALID0' }, mapping, 0);
    expect(badUri.partial.otpSecret).toBeUndefined();
    expect(badUri.warnings.some((w) => w.kind === 'invalid_otp')).toBe(true);

    const badB32 = sanitizeRow({ otpSecret: 'not!!!valid' }, mapping, 1);
    expect(badB32.partial.otpSecret).toBeUndefined();
    expect(badB32.warnings.some((w) => w.kind === 'invalid_otp')).toBe(true);
  });

  it('normalizes raw base32 secrets', () => {
    const { partial } = sanitizeRow({ otpSecret: 'jbsw y3dp ehpk 3pxp' }, mapping, 0);
    expect(partial.otpSecret).toBe('JBSWY3DPEHPK3PXP');
  });
});

describe('OnePassword parser', () => {
  const entryLine = JSON.stringify({
    title: 'GitHub',
    location: { urls: [{ url: 'https://github.com' }] },
    secureContents: {
      fields: [
        { designation: 'username', value: 'dev' },
        { designation: 'password', value: 'secret' },
      ],
      notesPlain: 'work',
    },
  });

  it('parses plain .1pif text', () => {
    const parsed = new OnePasswordParser().parse(entryLine, 'export.1pif');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.title).toBe('GitHub');
    expect(parsed.rows[0]!.password).toBe('secret');
  });

  it('rejects .1pux by filename', () => {
    expect(() => new OnePasswordParser().parse(new Uint8Array([1, 2, 3]), 'vault.1pux')).toThrow(
      ImportParseError
    );
  });

  it('rejects ZIP without .1pif entries', () => {
    const zipped = zipSync({ 'readme.txt': new TextEncoder().encode('hi') });
    expect(() => parseOnePasswordArchive(zipped)).toThrow(ImportParseError);
  });

  it('parses ZIP containing .1pif', () => {
    const zipped = zipSync({
      'data.1pif': new TextEncoder().encode(entryLine),
    });
    const parsed = parseOnePasswordArchive(zipped);
    expect(parsed.rows[0]!.title).toBe('GitHub');
  });
});

describe('dedupe password_mismatch', () => {
  const base = (over: Partial<PasswordCard> = {}): PasswordCard => ({
    id: 'x',
    type: 'PASSWORD',
    title: 'Site',
    icon: { type: 'icon', value: 'key-outline' },
    username: 'u',
    passwordList: ['old'],
    link: 'https://a.com',
    notes: '',
    creation_date: '',
    last_update: '',
    tags: [],
    ...over,
  });

  it('marks password_mismatch when fingerprint matches but password differs', () => {
    const { toImport, skippedCards } = dedupeImportCards(
      [base({ id: 'new', passwordList: ['new-pass'] })],
      [base()]
    );
    expect(toImport).toHaveLength(0);
    expect(skippedCards[0]!.reason).toBe('password_mismatch');
  });

  it('keeps duplicate_in_vault when password matches', () => {
    const { skippedCards } = dedupeImportCards([base({ id: 'new' })], [base()]);
    expect(skippedCards[0]!.reason).toBe('duplicate_in_vault');
  });
});

describe('applyImportMapping OTP metadata', () => {
  it('propagates otp fields from otpauth', () => {
    const { cards, warnings } = applyImportMapping(
      [
        {
          title: 'T',
          username: 'u',
          password: 'p',
          link: '',
          notes: '',
          otpSecret:
            'otpauth://totp/T:u?secret=JBSWY3DPEHPK3PXP&algorithm=SHA1&digits=6&period=30',
        },
      ],
      [
        { sourceHeader: 'title', targetField: 'title' },
        { sourceHeader: 'username', targetField: 'username' },
        { sourceHeader: 'password', targetField: 'passwordList' },
        { sourceHeader: 'link', targetField: 'link' },
        { sourceHeader: 'notes', targetField: 'notes' },
        { sourceHeader: 'otpSecret', targetField: 'otpSecret' },
      ]
    );
    expect(warnings.filter((w) => w.kind === 'invalid_otp')).toHaveLength(0);
    expect(cards[0]!.otpSecret).toBe('JBSWY3DPEHPK3PXP');
    expect(cards[0]!.otpPeriod).toBe(30);
  });
});
