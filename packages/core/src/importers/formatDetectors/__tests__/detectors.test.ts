import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectFormatFromRegistry } from '../registry';
import { loadFixtureSample } from '../../__tests__/fixtureHelpers';

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '__fixtures__');

describe('format detectors', () => {
  it('detects bitwarden JSON', () => {
    const sample = loadFixtureSample('bitwarden');
    expect(detectFormatFromRegistry(sample, 'export.json')).toBe('bitwarden');
  });

  it('detects nordpass JSON', () => {
    const sample = loadFixtureSample('nordpass');
    expect(detectFormatFromRegistry(sample, 'nordpass.json')).toBe('nordpass');
  });

  it('detects chrome CSV', () => {
    const sample = loadFixtureSample('chrome');
    expect(detectFormatFromRegistry(sample, 'passwords.csv')).toBe('chrome');
  });

  it('detects firefox CSV', () => {
    const sample = loadFixtureSample('firefox');
    expect(detectFormatFromRegistry(sample, 'firefox.csv')).toBe('firefox');
  });

  it('detects lastpass CSV', () => {
    const sample = loadFixtureSample('lastpass');
    expect(detectFormatFromRegistry(sample, 'lastpass.csv')).toBe('lastpass');
  });

  it('detects dashlane CSV', () => {
    const sample = loadFixtureSample('dashlane');
    expect(detectFormatFromRegistry(sample, 'dashlane.csv')).toBe('dashlane');
  });

  it('detects keeper JSON and CSV', () => {
    const json = loadFixtureSample('keeper');
    expect(detectFormatFromRegistry(json, 'keeper.json')).toBe('keeper-json');
    const csv = readFileSync(join(fixturesRoot, 'keeper', 'sample.csv'), 'utf8');
    expect(detectFormatFromRegistry(csv, 'keeper.csv')).toBe('keeper-csv');
  });

  it('detects enpass JSON', () => {
    const sample = loadFixtureSample('enpass');
    expect(detectFormatFromRegistry(sample, 'enpass.json')).toBe('enpass');
  });

  it('does not classify nordpass as bitwarden', () => {
    const sample = loadFixtureSample('nordpass');
    expect(detectFormatFromRegistry(sample, 'export.json')).not.toBe('bitwarden');
  });
});
