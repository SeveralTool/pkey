import { describe, it, expect } from 'vitest';
import { DEFAULT_VAULT_SETTINGS } from './password-generator';
import {
  mergeVaultSettings,
  stripSatelliteMasterOnlySettings,
  pickSatelliteSettingsPatch,
  canonicalizeVaultSettings,
} from './settings';

describe('mergeVaultSettings', () => {
  it('returns local when incoming is missing', () => {
    expect(mergeVaultSettings(DEFAULT_VAULT_SETTINGS, null)).toBe(DEFAULT_VAULT_SETTINGS);
    expect(mergeVaultSettings(DEFAULT_VAULT_SETTINGS, undefined)).toBe(DEFAULT_VAULT_SETTINGS);
  });

  it('applies language and theme from the satellite without dropping local fields', () => {
    const local = { ...DEFAULT_VAULT_SETTINGS, language: 'ESP' as const, genLength: 32 };
    const merged = mergeVaultSettings(local, { language: 'ING', theme: 'LIGHT' });
    expect(merged.language).toBe('ING');
    expect(merged.theme).toBe('LIGHT');
    expect(merged.genLength).toBe(32);
    expect(merged.autoLogout).toBe(local.autoLogout);
  });

  it('normalizes invalid language/theme instead of storing them', () => {
    const merged = mergeVaultSettings(DEFAULT_VAULT_SETTINGS, {
      language: 'fr' as never,
      theme: 'pink' as never,
    });
    expect(merged.language).toBe('ING');
    expect(merged.theme).toBe('DARK');
  });

  it('keeps local language when the incoming payload omits it', () => {
    const local = { ...DEFAULT_VAULT_SETTINGS, language: 'ESP' as const };
    const merged = mergeVaultSettings(local, { theme: 'LIGHT' });
    expect(merged.language).toBe('ESP');
  });

  it('keeps AUTO language from the satellite', () => {
    const merged = mergeVaultSettings(DEFAULT_VAULT_SETTINGS, { language: 'AUTO' });
    expect(merged.language).toBe('AUTO');
  });

  it('merges webTheme/webLanguage without overwriting mobile theme/language', () => {
    const local = {
      ...DEFAULT_VAULT_SETTINGS,
      theme: 'AUTO' as const,
      language: 'ESP' as const,
    };
    const merged = mergeVaultSettings(local, { webTheme: 'LIGHT', webLanguage: 'ING' });
    expect(merged.theme).toBe('AUTO');
    expect(merged.language).toBe('ESP');
    expect(merged.webTheme).toBe('LIGHT');
    expect(merged.webLanguage).toBe('ING');
  });

  it('keeps local webTheme when the incoming payload omits it', () => {
    const local = { ...DEFAULT_VAULT_SETTINGS, webTheme: 'LIGHT' as const };
    const merged = mergeVaultSettings(local, { theme: 'DARK' });
    expect(merged.webTheme).toBe('LIGHT');
    expect(merged.theme).toBe('DARK');
  });

  it.each([
    ['groupCardsByLink', true],
    ['enableHibpCheck', true],
    ['enableFaviconLookup', true],
    ['autoCollapse', false],
    ['webAccessAutoStart', true],
  ] as const)('applies satellite %s without dropping genLength', (key, value) => {
    const local = { ...DEFAULT_VAULT_SETTINGS, genLength: 24 };
    const merged = mergeVaultSettings(local, { [key]: value });
    expect(merged[key]).toBe(value);
    expect(merged.genLength).toBe(24);
  });

  it('stripSatelliteMasterOnlySettings drops webConfirmOnPhone', () => {
    const incoming = {
      ...DEFAULT_VAULT_SETTINGS,
      webConfirmOnPhone: true,
      webTheme: 'LIGHT' as const,
    };
    const stripped = stripSatelliteMasterOnlySettings(incoming);
    expect(stripped?.webConfirmOnPhone).toBeUndefined();
    expect(stripped?.webTheme).toBe('LIGHT');
    const local = { ...DEFAULT_VAULT_SETTINGS, webConfirmOnPhone: false };
    const merged = mergeVaultSettings(local, stripped);
    expect(merged.webConfirmOnPhone).toBe(false);
    expect(merged.webTheme).toBe('LIGHT');
  });

  it('stripSatelliteMasterOnlySettings drops webLoginOnPhone', () => {
    const incoming = {
      ...DEFAULT_VAULT_SETTINGS,
      webLoginOnPhone: true,
      webTheme: 'DARK' as const,
    };
    const stripped = stripSatelliteMasterOnlySettings(incoming);
    expect(stripped?.webLoginOnPhone).toBeUndefined();
    const local = { ...DEFAULT_VAULT_SETTINGS, webLoginOnPhone: false };
    const merged = mergeVaultSettings(local, stripped);
    expect(merged.webLoginOnPhone).toBe(false);
  });

  it('stripSatelliteMasterOnlySettings drops phone theme and language', () => {
    const incoming = {
      ...DEFAULT_VAULT_SETTINGS,
      theme: 'LIGHT' as const,
      language: 'ING' as const,
      webTheme: 'DARK' as const,
    };
    const stripped = stripSatelliteMasterOnlySettings(incoming);
    expect(stripped?.theme).toBeUndefined();
    expect(stripped?.language).toBeUndefined();
    expect(stripped?.webTheme).toBe('DARK');
    const local = { ...DEFAULT_VAULT_SETTINGS, theme: 'AUTO' as const, language: 'ESP' as const };
    const merged = mergeVaultSettings(local, stripped);
    expect(merged.theme).toBe('AUTO');
    expect(merged.language).toBe('ESP');
    expect(merged.webTheme).toBe('DARK');
  });

  it('pickSatelliteSettingsPatch keeps only web UI keys', () => {
    expect(pickSatelliteSettingsPatch({ webTheme: 'LIGHT', theme: 'DARK' })).toEqual({
      webTheme: 'LIGHT',
    });
  });

  it('canonicalizeVaultSettings is stable across key order', () => {
    const a = { language: 'ESP', theme: 'DARK' } as typeof DEFAULT_VAULT_SETTINGS;
    const b = { theme: 'DARK', language: 'ESP' } as typeof DEFAULT_VAULT_SETTINGS;
    expect(canonicalizeVaultSettings(a)).toBe(canonicalizeVaultSettings(b));
  });
});
