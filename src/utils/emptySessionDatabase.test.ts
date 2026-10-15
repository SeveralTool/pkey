/**
 * @fileoverview Post-lock session snapshot must not retain fixture passwords (H1).
 */
import { createEmptySessionDatabase } from './emptySessionDatabase';
import { persistPublicUiPrefs, resetPublicUiPrefsCache } from './publicUiPrefs';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const FIXTURE = 'fixture-password-should-not-survive-lock';

describe('createEmptySessionDatabase (H1)', () => {
  beforeEach(() => {
    resetPublicUiPrefsCache();
  });

  it('serializes without leftover card secrets', () => {
    const empty = createEmptySessionDatabase();
    expect(empty.cards).toEqual([]);
    expect(empty.passwordHash).toBe('');
    expect(JSON.stringify(empty)).not.toContain(FIXTURE);
  });

  it('defaults to AUTO language/theme when no public hints exist', () => {
    const empty = createEmptySessionDatabase();
    expect(empty.settings.language).toBe('AUTO');
    expect(empty.settings.theme).toBe('AUTO');
    expect(empty.settings.allowScreenshots).toBe(false);
  });

  it('keeps an explicit LIGHT snapshot so login does not follow the OS', () => {
    const empty = createEmptySessionDatabase({
      language: 'ESP',
      theme: 'LIGHT',
      allowScreenshots: false,
    });
    expect(empty.settings.theme).toBe('LIGHT');
    expect(empty.settings.language).toBe('ESP');
    expect(empty.settings.allowScreenshots).toBe(false);
    expect(empty.passwordHash).toBe('');
  });

  it('reads cached public hints when logout omitted an explicit snapshot', async () => {
    await persistPublicUiPrefs({ language: 'ING', theme: 'LIGHT', allowScreenshots: true });
    const empty = createEmptySessionDatabase();
    expect(empty.settings.theme).toBe('LIGHT');
    expect(empty.settings.language).toBe('ING');
    expect(empty.settings.allowScreenshots).toBe(true);
  });
});
