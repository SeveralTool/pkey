/**
 * @fileoverview Public legal URLs for Play Store and in-app “view online”.
 */
import { LEGAL_PAGES_ORIGIN, LEGAL_WEB_URLS } from './legalContact';

const IDS = ['privacy', 'terms', 'third_party', 'official_app', 'source_license'] as const;

describe('LEGAL_WEB_URLS', () => {
  it.each(IDS)('%s is HTTPS on the GitHub Pages host', (id) => {
    expect(LEGAL_WEB_URLS[id]).toMatch(/^https:\/\/severaltool\.github\.io\/pkey\/.+\.html$/);
    expect(LEGAL_WEB_URLS[id].startsWith(LEGAL_PAGES_ORIGIN)).toBe(true);
  });
});
