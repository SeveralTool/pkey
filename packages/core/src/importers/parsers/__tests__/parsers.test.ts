import { describe, it, expect } from 'vitest';
import { NordPassParser } from '../nordpass';
import { ChromeCsvParser } from '../chrome';
import { FirefoxCsvParser } from '../firefox';
import { LastPassCsvParser } from '../lastpass';
import { BitwardenParser } from '../bitwarden';
import { DashlaneParser } from '../dashlane';
import { KeeperJsonParser } from '../keeper-json';
import { KeeperCsvParser } from '../keeper-csv';
import { EnpassParser } from '../enpass';
import { GenericCsvParser } from '../generic-csv';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadFixtureSample,
  loadFixtureExpected,
  cardsFromParser,
  assertCardsMatchExpected,
} from '../../__tests__/fixtureHelpers';

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '__fixtures__');

const parserCases = [
  ['bitwarden', new BitwardenParser()],
  ['nordpass', new NordPassParser()],
  ['dashlane', new DashlaneParser()],
  ['chrome', new ChromeCsvParser()],
  ['firefox', new FirefoxCsvParser()],
  ['lastpass', new LastPassCsvParser()],
  ['keeper', new KeeperJsonParser()],
  ['enpass', new EnpassParser()],
  ['generic-csv', new GenericCsvParser()],
] as const;

describe.each(parserCases)('%s parser fixtures', (format, parser) => {
  it('parses sample to expected cards', () => {
    const sample = loadFixtureSample(format);
    const expected = loadFixtureExpected(format);
    const cards = cardsFromParser(parser, sample);
    assertCardsMatchExpected(cards, expected, {
      titleFromLink: format === 'firefox',
    });
  });
});

describe('KeeperCsvParser', () => {
  it('parses keeper CSV fixture', () => {
    const sample = readFileSync(join(fixturesRoot, 'keeper', 'sample.csv'), 'utf8');
    const expected = loadFixtureExpected('keeper');
    const cards = cardsFromParser(new KeeperCsvParser(), sample);
    assertCardsMatchExpected(cards, expected);
  });
});

describe('NordPassParser edge cases', () => {
  it('handles empty fields', () => {
    const parser = new NordPassParser();
    const result = parser.parse(JSON.stringify([{ name: '', password: '' }]));
    expect(result.rows[0]?.title).toBe('');
    expect(result.rows[0]?.password).toBe('');
  });
});
