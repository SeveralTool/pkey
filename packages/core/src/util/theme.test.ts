import { describe, it, expect } from 'vitest';
import { normalizeTheme, resolveThemeIsDark, resolveWebThemeMode } from './theme';

describe('normalizeTheme', () => {
  it('accepts canonical values', () => {
    expect(normalizeTheme('DARK')).toBe('DARK');
    expect(normalizeTheme('LIGHT')).toBe('LIGHT');
    expect(normalizeTheme('AUTO')).toBe('AUTO');
  });

  it('coerces case and unknown to DARK', () => {
    expect(normalizeTheme('dark')).toBe('DARK');
    expect(normalizeTheme('light')).toBe('LIGHT');
    expect(normalizeTheme(undefined)).toBe('DARK');
    expect(normalizeTheme('invalid')).toBe('DARK');
  });
});

describe('resolveThemeIsDark', () => {
  it('respects explicit modes', () => {
    expect(resolveThemeIsDark('DARK', false)).toBe(true);
    expect(resolveThemeIsDark('LIGHT', true)).toBe(false);
  });

  it('uses system preference for AUTO', () => {
    expect(resolveThemeIsDark('AUTO', true)).toBe(true);
    expect(resolveThemeIsDark('AUTO', false)).toBe(false);
  });
});

describe('resolveWebThemeMode', () => {
  it('prefers webTheme and falls back to theme', () => {
    expect(resolveWebThemeMode({ theme: 'DARK', webTheme: 'LIGHT' })).toBe('LIGHT');
    expect(resolveWebThemeMode({ theme: 'LIGHT' })).toBe('LIGHT');
  });
});
