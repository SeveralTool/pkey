import { useEffect } from 'react';
import * as ScreenCapture from 'expo-screen-capture';
import { getLocale } from '../constants/localization';
import { safeOsNotification } from '../notifications/notificationRef';
import type { AppSettings } from '../types';
import { rememberPublicUiFromSettings } from '../utils/publicUiPrefs';

/**
 * Whether the current surface may be mirrored or captured.
 *
 * `undefined` means the preference is not loaded yet and the flag must stay
 * as-is. A debug build allows capture while locked so the login screen is
 * visible from the development machine. Release builds follow the last
 * opt-in, including on the login screen.
 */
export function resolveScreenCaptureAllowed(
  isLogged: boolean,
  allowScreenshots: boolean | undefined,
  devBuild: boolean
): boolean | undefined {
  if (!isLogged && devBuild) return true;
  if (allowScreenshots === undefined) return undefined;
  return allowScreenshots;
}

/**
 * Applies screenshot allow/block and notifies when a capture occurs while
 * screenshots are permitted.
 */
export function useScreenshotPolicy(
  isLogged: boolean,
  allowScreenshots: boolean | undefined,
  language: AppSettings['language'] | undefined
): void {
  useEffect(() => {
    if (!isLogged || typeof allowScreenshots !== 'boolean') return;
    rememberPublicUiFromSettings({ allowScreenshots });
  }, [isLogged, allowScreenshots]);

  useEffect(() => {
    const allowed = resolveScreenCaptureAllowed(isLogged, allowScreenshots, __DEV__);
    if (allowed === undefined) return;

    const handleScreenCapture = async () => {
      try {
        if (allowed) {
          await ScreenCapture.allowScreenCaptureAsync();
        } else {
          await ScreenCapture.preventScreenCaptureAsync();
        }
      } catch (err) {
        console.warn('Screen capture API error:', err);
      }
    };
    void handleScreenCapture();
  }, [isLogged, allowScreenshots]);

  useEffect(() => {
    if (!isLogged || !allowScreenshots) return;

    let subscription: ScreenCapture.Subscription | null = null;

    const registerScreenshotListener = async () => {
      try {
        const permission = await ScreenCapture.requestPermissionsAsync();
        if (!permission.granted) return;

        subscription = ScreenCapture.addScreenshotListener(() => {
          const t = getLocale(language);
          safeOsNotification({
            id: `screenshot-${Date.now()}`,
            title: t.notif_screenshot_title,
            body: t.notif_screenshot_body,
            channel: 'pkey-security',
            data: { type: 'screenshot-detected' },
          });
        });
      } catch (err) {
        console.warn('Screenshot listener error:', err);
      }
    };

    void registerScreenshotListener();

    return () => {
      subscription?.remove();
    };
  }, [isLogged, allowScreenshots, language]);
}
