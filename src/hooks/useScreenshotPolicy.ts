import { useEffect } from 'react';
import * as ScreenCapture from 'expo-screen-capture';
import { getLocale } from '../constants/localization';
import { safeOsNotification } from '../notifications/notificationRef';
import type { AppSettings } from '../types';

/**
 * Applies screenshot allow/block from vault settings and notifies when a
 * capture occurs while screenshots are permitted.
 */
export function useScreenshotPolicy(
  isLogged: boolean,
  allowScreenshots: boolean | undefined,
  language: AppSettings['language'] | undefined
): void {
  useEffect(() => {
    const handleScreenCapture = async () => {
      try {
        if (allowScreenshots === undefined) return;
        if (allowScreenshots) {
          await ScreenCapture.allowScreenCaptureAsync();
        } else {
          await ScreenCapture.preventScreenCaptureAsync();
        }
      } catch (err) {
        console.warn('Screen capture API error:', err);
      }
    };
    void handleScreenCapture();
  }, [allowScreenshots]);

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
