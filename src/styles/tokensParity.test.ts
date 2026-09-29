/**
 * @jest-environment node
 *
 * Parity snapshot between the native `getTheme` (`src/styles/colors.ts`) and
 * the web-client `getTheme` (`packages/web-client/src/theme/tokens.ts`).
 *
 * Audit finding B7. Both palettes are duplicated because the web app runs
 * in a Solid workspace with its own dependency graph; without a test, the
 * two can drift silently and cause the PWA + mobile to render mismatched
 * brand colours. This suite locks both palettes to the same values for
 * every SHARED key. Web-only tokens (`inputBg`, `iconBtnBg`, `dangerBtnBg`)
 * are asserted to be documented as web-only and never leaked into the
 * native palette.
 */
import { getTheme as getNativeTheme } from './colors';
import { getTheme as getWebTheme } from '../../packages/web-client/src/theme/tokens';

const SHARED_KEYS = [
  'bg',
  'cardBg',
  'text',
  'textMuted',
  'border',
  'accent',
  'accentHover',
  'success',
  'warning',
  'danger',
] as const;

const WEB_ONLY_KEYS = ['inputBg', 'iconBtnBg', 'dangerBtnBg'] as const;

describe('theme token parity (audit B7)', () => {
  it.each([true, false] as const)(
    'shared tokens match between native and web (isDark=%s)',
    (isDark) => {
      const native = getNativeTheme(isDark);
      const web = getWebTheme(isDark);
      for (const key of SHARED_KEYS) {
        expect({ key, isDark, value: web[key] }).toEqual({
          key,
          isDark,
          value: native[key as keyof typeof native],
        });
      }
    }
  );

  it('native palette does not accidentally leak web-only keys', () => {
    const native = getNativeTheme(true) as unknown as Record<string, string>;
    for (const key of WEB_ONLY_KEYS) {
      expect(native[key]).toBeUndefined();
    }
  });

  it('web palette exposes exactly the shared keys plus the documented web-only keys', () => {
    const web = getWebTheme(true);
    const observed = Object.keys(web).sort();
    const expected = [...SHARED_KEYS, ...WEB_ONLY_KEYS].sort();
    expect(observed).toEqual(expected);
  });

  it('accent is the PKey brand green in every mode', () => {
    // Regression guard for accidental brand-color drift.
    for (const isDark of [true, false] as const) {
      expect(getNativeTheme(isDark).accent).toBe('#87cb28');
      expect(getWebTheme(isDark).accent).toBe('#87cb28');
    }
  });
});
