import { describe, it, expect } from 'vitest';
import {
  validateImportInput,
  looksLikeUnsupportedBinary,
  importFileExtension,
} from '../validateImportInput';
import { ImportOrchestrator } from '../orchestrator';
import { detectFormatFromRegistry } from '../formatDetectors/registry';
import { loadFixtureSample } from './fixtureHelpers';
import { isPlausibleTabularText } from '../formatDetectors/utils';

describe('importFileExtension', () => {
  it('extracts lowercase extension', () => {
    expect(importFileExtension('export.JSON')).toBe('.json');
    expect(importFileExtension('a/b/passwords.csv')).toBe('.csv');
    expect(importFileExtension('noext')).toBe('');
  });
});

describe('looksLikeUnsupportedBinary', () => {
  it('detects PDF magic', () => {
    const pdf = new TextEncoder().encode('%PDF-1.4 binary junk,,,,');
    expect(looksLikeUnsupportedBinary(pdf)).toBe(true);
  });

  it('detects MP4 ftyp', () => {
    const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(looksLikeUnsupportedBinary(mp4)).toBe(true);
  });

  it('detects null bytes', () => {
    const bin = new Uint8Array([0x41, 0x00, 0x42, 0x00, 0x43]);
    expect(looksLikeUnsupportedBinary(bin)).toBe(true);
  });

  it('allows ZIP magic', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(looksLikeUnsupportedBinary(zip)).toBe(false);
  });

  it('allows plain CSV text', () => {
    const csv = new TextEncoder().encode('title,username,password\na,b,c\n');
    expect(looksLikeUnsupportedBinary(csv)).toBe(false);
  });
});

describe('validateImportInput', () => {
  it('rejects disallowed extensions', () => {
    expect(
      validateImportInput({ name: 'notes.pdf', content: '%PDF-1.4' }).ok
    ).toBe(false);
    expect(
      validateImportInput({ name: 'clip.mp4', content: 'xxxx', bytes: new Uint8Array(12) }).ok
    ).toBe(false);
  });

  it('rejects PDF content even when renamed to .csv', () => {
    const bytes = new TextEncoder().encode('%PDF-1.7\n1 0 obj<<>>\n');
    const result = validateImportInput({
      name: 'export.csv',
      content: '%PDF-1.7\n1 0 obj<<>>\n',
      bytes,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unsupported_format');
  });

  it('accepts allowed extensions with textual content', () => {
    expect(
      validateImportInput({
        name: 'bitwarden.json',
        content: '{"items":[]}',
      }).ok
    ).toBe(true);
    expect(
      validateImportInput({
        name: 'passwords.csv',
        content: 'a,b,c\n1,2,3\n',
      }).ok
    ).toBe(true);
    expect(
      validateImportInput({
        name: 'export.1pif',
        content: '',
      }).ok
    ).toBe(true);
  });
});

describe('isPlausibleTabularText', () => {
  it('accepts real CSV', () => {
    expect(isPlausibleTabularText('title,user,pass\na,b,c\n')).toBe(true);
  });

  it('rejects comma noise without consistent rows', () => {
    expect(isPlausibleTabularText('hello, world only one field-ish')).toBe(true); // 2 fields ok
    expect(isPlausibleTabularText('no delimiters here at all')).toBe(false);
  });
});

describe('GenericCsvDetector hardening via registry', () => {
  it('does not classify PDF-like text as csv', () => {
    const noise =
      '%PDF-1.4\n' +
      Array.from({ length: 20 }, (_, i) => `stream${i} /Length ${i}, endstream`).join('\n');
    expect(detectFormatFromRegistry(noise, 'weird.bin')).toBeNull();
  });
});

describe('ImportOrchestrator unsupported_format', () => {
  const orchestrator = new ImportOrchestrator();

  it('rejects PDF bytes as unsupported_format', () => {
    const bytes = new TextEncoder().encode('%PDF-1.4,,,,garbage');
    const analysis = orchestrator.analyze({
      name: 'doc.pdf',
      content: '%PDF-1.4,,,,garbage',
      bytes,
    });
    expect(analysis.analysisErrors).toContain('unsupported_format');
    expect(analysis.parsed.rows).toHaveLength(0);
  });

  it('rejects MP4 magic as unsupported_format', () => {
    const bytes = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
    const analysis = orchestrator.analyze({
      name: 'video.mp4',
      content: 'ftypmp42',
      bytes,
    });
    expect(analysis.analysisErrors).toContain('unsupported_format');
  });

  it('still analyzes Bitwarden and Chrome fixtures', () => {
    const bw = loadFixtureSample('bitwarden');
    const bwAnalysis = orchestrator.analyze({ name: 'export.json', content: bw });
    expect(bwAnalysis.format).toBe('bitwarden');
    expect(bwAnalysis.analysisErrors).toBeUndefined();

    const chrome = loadFixtureSample('chrome');
    const chromeAnalysis = orchestrator.analyze({ name: 'chrome.csv', content: chrome });
    expect(chromeAnalysis.format).toBe('chrome');
    expect(chromeAnalysis.analysisErrors).toBeUndefined();
  });

  it('keeps generic csv mapping path', () => {
    const sample = loadFixtureSample('generic-csv');
    const analysis = orchestrator.analyze({ name: 'data.csv', content: sample });
    expect(analysis.format).toBe('csv');
    expect(analysis.needsMapping).toBe(true);
  });
});
