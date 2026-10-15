/**
 * @fileoverview Public login chrome language/theme hints survive lock.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearPublicUiPrefs,
  getCachedPublicUiPrefs,
  loadPublicUiPrefs,
  persistPublicUiPrefs,
  publicUiPrefsFromSettings,
  resetPublicUiPrefsCache,
} from './publicUiPrefs';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('publicUiPrefs', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await clearPublicUiPrefs();
  });

  it('falls back to AUTO/AUTO and blocked screenshots before anything is stored', () => {
    expect(getCachedPublicUiPrefs()).toEqual({
      language: 'AUTO',
      theme: 'AUTO',
      allowScreenshots: false,
    });
  });

  it('persists LIGHT so lock chrome does not follow the OS', async () => {
    await persistPublicUiPrefs({ language: 'ESP', theme: 'LIGHT', allowScreenshots: false });
    expect(getCachedPublicUiPrefs()).toEqual({
      language: 'ESP',
      theme: 'LIGHT',
      allowScreenshots: false,
    });

    resetPublicUiPrefsCache();
    const loaded = await loadPublicUiPrefs();
    expect(loaded).toEqual({ language: 'ESP', theme: 'LIGHT', allowScreenshots: false });
    expect(getCachedPublicUiPrefs()).toEqual({
      language: 'ESP',
      theme: 'LIGHT',
      allowScreenshots: false,
    });
  });

  it('keeps a screenshot opt-in across a cold start', async () => {
    await persistPublicUiPrefs({ language: 'ESP', theme: 'DARK', allowScreenshots: true });
    resetPublicUiPrefsCache();
    await expect(loadPublicUiPrefs()).resolves.toEqual({
      language: 'ESP',
      theme: 'DARK',
      allowScreenshots: true,
    });
  });

  it('treats prefs stored before the screenshot flag as blocked', async () => {
    await AsyncStorage.setItem('pkey_public_ui_prefs_v1', '{"language":"ESP","theme":"LIGHT"}');
    await expect(loadPublicUiPrefs()).resolves.toEqual({
      language: 'ESP',
      theme: 'LIGHT',
      allowScreenshots: false,
    });
  });

  it('rejects corrupt storage and returns new-install defaults', async () => {
    await AsyncStorage.setItem('pkey_public_ui_prefs_v1', '{"theme":"pink"}');
    await expect(loadPublicUiPrefs()).resolves.toEqual({
      language: 'AUTO',
      theme: 'AUTO',
      allowScreenshots: false,
    });
  });

  it('clearPublicUiPrefs drops hints so a wiped vault does not keep LIGHT', async () => {
    await persistPublicUiPrefs({ language: 'ESP', theme: 'LIGHT', allowScreenshots: true });
    await clearPublicUiPrefs();
    expect(getCachedPublicUiPrefs()).toEqual({
      language: 'AUTO',
      theme: 'AUTO',
      allowScreenshots: false,
    });
  });

  it('keeps cached values when settings omit a field', async () => {
    await persistPublicUiPrefs({ language: 'ESP', theme: 'LIGHT', allowScreenshots: true });
    expect(publicUiPrefsFromSettings({ theme: 'DARK' })).toEqual({
      language: 'ESP',
      theme: 'DARK',
      allowScreenshots: true,
    });
  });
});
