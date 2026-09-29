/**
 * @fileoverview Guards name-free legal bodies (privacy, terms, official app).
 */
import { getLegalDocumentBody, NAME_FREE_LEGAL_DOCUMENT_IDS } from './legalContent';

const FORBIDDEN = [
  'SeveralTool',
  'GitHub',
  'Have I Been Pwned',
  'DuckDuckGo',
  'Iconify',
  'Google Fonts',
  'Last updated',
  'Effective date',
  'App Store',
  'Google Play',
  'Dropbox',
  'Meta Platforms',
  '650 Industries',
];

describe('name-free legal documents', () => {
  it.each(NAME_FREE_LEGAL_DOCUMENT_IDS)('%s has no dates or entity names', (id) => {
    const body = getLegalDocumentBody(id);
    for (const token of FORBIDDEN) {
      expect(body).not.toContain(token);
    }
    expect(body).not.toMatch(/\b20\d{2}\b/);
    expect(body).not.toMatch(
      /\bJanuary\b|\bFebruary\b|\bMarch\b|\bApril\b|\bMay\b|\bJune\b|\bJuly\b|\bAugust\b|\bSeptember\b|\bOctober\b|\bNovember\b|\bDecember\b/
    );
  });

  it('mentions the optional breach-prefix check in the privacy body', () => {
    expect(getLegalDocumentBody('privacy')).toMatch(/hash prefix/i);
  });

  it('uses the COPPA children threshold without an 18+ product ban', () => {
    const privacy = getLegalDocumentBody('privacy');
    expect(privacy).toMatch(/under 13/);
    expect(privacy).not.toMatch(/under 18/);
  });

  it('ties terms acceptance to legal capacity without a numeric age floor', () => {
    const terms = getLegalDocumentBody('terms');
    expect(terms).toMatch(/legal capacity/i);
    expect(terms).not.toMatch(/\b18\b/);
  });

  it('keeps required OSS copyrights in third-party notices', () => {
    const notices = getLegalDocumentBody('third_party');
    expect(notices).toContain('Meta Platforms, Inc.');
    expect(notices).toContain('The copyright lines below are required');
    expect(notices).not.toContain('Google Fonts');
    expect(notices).not.toContain('Iconify');
  });
});
