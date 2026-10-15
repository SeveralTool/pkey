import { resolveScreenCaptureAllowed } from './useScreenshotPolicy';

describe('resolveScreenCaptureAllowed', () => {
  it('lets a debug build mirror the locked login screen', () => {
    expect(resolveScreenCaptureAllowed(false, false, true)).toBe(true);
    expect(resolveScreenCaptureAllowed(false, undefined, true)).toBe(true);
  });

  it('follows the saved opt-in on a release login screen', () => {
    expect(resolveScreenCaptureAllowed(false, true, false)).toBe(true);
    expect(resolveScreenCaptureAllowed(false, false, false)).toBe(false);
  });

  it('does not change the flag before release prefs are loaded', () => {
    expect(resolveScreenCaptureAllowed(false, undefined, false)).toBeUndefined();
  });

  it('keeps the unlocked vault on the user toggle in debug and release', () => {
    expect(resolveScreenCaptureAllowed(true, false, true)).toBe(false);
    expect(resolveScreenCaptureAllowed(true, true, false)).toBe(true);
  });
});
