/**
 * @fileoverview Identity facts that stay visible while editor sections are closed.
 */
import {
  editorIdentityLink,
  editorPhraseSummary,
  editorTypeIcon,
  editorTypeLabel,
  editorVisibleUsername,
} from './editorIdentity';

const labels = { pass: 'Password', phrase: 'Seed phrase', note: 'Secure note' };

describe('editorTypeLabel', () => {
  it('names each key type', () => {
    expect(editorTypeLabel('PASSWORD', labels)).toBe('Password');
    expect(editorTypeLabel('SECRET_PHRASE', labels)).toBe('Seed phrase');
    expect(editorTypeLabel('NOTE', labels)).toBe('Secure note');
  });
});

describe('editorTypeIcon', () => {
  it('picks a glyph per type', () => {
    expect(editorTypeIcon('PASSWORD')).toBe('key-outline');
    expect(editorTypeIcon('SECRET_PHRASE')).toBe('list-outline');
    expect(editorTypeIcon('NOTE')).toBe('document-text-outline');
  });
});

describe('editorVisibleUsername', () => {
  it('hides a blank username', () => {
    expect(editorVisibleUsername('  ')).toBeNull();
    expect(editorVisibleUsername('ada@mail')).toBe('ada@mail');
  });
});

describe('editorIdentityLink', () => {
  it('keeps an empty link visible as a placeholder', () => {
    expect(editorIdentityLink('  ', 'No link', (raw) => raw)).toEqual({
      text: 'No link',
      openable: false,
    });
  });

  it('formats a real link and allows opening it', () => {
    expect(editorIdentityLink(' https://ex.test ', 'No link', (raw) => raw.trim())).toEqual({
      text: 'https://ex.test',
      openable: true,
    });
  });
});

describe('editorPhraseSummary', () => {
  it('counts filled words only', () => {
    expect(editorPhraseSummary(['alpha', ' ', 'beta'], '{count} words')).toBe('2 words');
    expect(editorPhraseSummary(['', '  '], '{count} words')).toBeNull();
  });
});
