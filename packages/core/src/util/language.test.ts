import { describe, it, expect } from 'vitest';
import {
  normalizeLanguage,
  languageFromLocaleTag,
  htmlLangAttr,
  resolveUiLanguage,
  resolveWebLanguagePref,
} from './language';

describe('normalizeLanguage', () => {
  it('accepts canonical values', () => {
    expect(normalizeLanguage('ESP')).toBe('ESP');
    expect(normalizeLanguage('ING')).toBe('ING');
    expect(normalizeLanguage('AUTO')).toBe('AUTO');
  });

  it('coerces case and unknown to ING', () => {
    expect(normalizeLanguage('esp')).toBe('ESP');
    expect(normalizeLanguage('ing')).toBe('ING');
    expect(normalizeLanguage('auto')).toBe('AUTO');
    expect(normalizeLanguage(undefined)).toBe('ING');
    expect(normalizeLanguage('fr')).toBe('ING');
    expect(normalizeLanguage('ES')).toBe('ING');
  });
});

describe('languageFromLocaleTag', () => {
  it('maps Spanish locales to ESP', () => {
    expect(languageFromLocaleTag('es')).toBe('ESP');
    expect(languageFromLocaleTag('es-AR')).toBe('ESP');
    expect(languageFromLocaleTag('es_MX')).toBe('ESP');
    expect(languageFromLocaleTag('ES-es')).toBe('ESP');
  });

  it('maps non-Spanish locales to ING', () => {
    expect(languageFromLocaleTag('en')).toBe('ING');
    expect(languageFromLocaleTag('pt-BR')).toBe('ING');
    expect(languageFromLocaleTag('et')).toBe('ING');
  });
});

describe('resolveUiLanguage', () => {
  it('returns stored ESP/ING without consulting the locale', () => {
    expect(resolveUiLanguage('ESP', 'en-US')).toBe('ESP');
    expect(resolveUiLanguage('ING', 'es-AR')).toBe('ING');
  });

  it('follows the locale tag when stored preference is AUTO', () => {
    expect(resolveUiLanguage('AUTO', 'es-AR')).toBe('ESP');
    expect(resolveUiLanguage('AUTO', 'en-US')).toBe('ING');
  });
});

describe('resolveWebLanguagePref', () => {
  it('prefers webLanguage and falls back to language', () => {
    expect(resolveWebLanguagePref({ language: 'ESP', webLanguage: 'ING' })).toBe('ING');
    expect(resolveWebLanguagePref({ language: 'ESP' })).toBe('ESP');
  });
});

describe('htmlLangAttr', () => {
  it('maps vault codes to BCP-47 html lang', () => {
    expect(htmlLangAttr('ESP')).toBe('es');
    expect(htmlLangAttr('ING')).toBe('en');
    expect(htmlLangAttr('AUTO')).toBe('en');
  });
});
