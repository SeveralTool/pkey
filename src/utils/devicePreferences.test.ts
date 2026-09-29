import {
  languageFromLocaleTag,
  getDefaultThemeForNewInstall,
  getDefaultLanguageForNewInstall,
  getNewInstallUiDefaults,
} from './devicePreferences';

describe('languageFromLocaleTag', () => {
  it('maps Spanish locales to ESP', () => {
    expect(languageFromLocaleTag('es')).toBe('ESP');
    expect(languageFromLocaleTag('es-AR')).toBe('ESP');
    expect(languageFromLocaleTag('es_MX')).toBe('ESP');
    expect(languageFromLocaleTag('ES-es')).toBe('ESP');
  });

  it('maps non-Spanish locales to ING', () => {
    expect(languageFromLocaleTag('en')).toBe('ING');
    expect(languageFromLocaleTag('en-US')).toBe('ING');
    expect(languageFromLocaleTag('pt-BR')).toBe('ING');
    expect(languageFromLocaleTag('fr')).toBe('ING');
    // Estonian must not match Spanish prefix
    expect(languageFromLocaleTag('et')).toBe('ING');
  });
});

describe('getDefaultThemeForNewInstall', () => {
  it('follows the system theme', () => {
    expect(getDefaultThemeForNewInstall()).toBe('AUTO');
  });
});

describe('getDefaultLanguageForNewInstall', () => {
  it('follows the system language', () => {
    expect(getDefaultLanguageForNewInstall()).toBe('AUTO');
  });
});

describe('getNewInstallUiDefaults', () => {
  it('persists AUTO for both language and theme', () => {
    expect(getNewInstallUiDefaults()).toEqual({ language: 'AUTO', theme: 'AUTO' });
  });
});
