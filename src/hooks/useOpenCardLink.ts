/**
 * @fileoverview Hook for confirming and opening card destination links.
 */
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { getAppWebFallbackUrl, isAppLink, parseAppLink } from '@pkey/core';
import { copyPublic } from '../services/secureClipboard';
import { notifications } from '../notifications/notificationRef';
import type { NotificationAction } from '../notifications/types';
import {
  getDisplayUrl,
  normalizeUrl,
  openExternalLink,
  OpenLinkFailureReason,
} from '../utils/openExternalLink';

interface UseOpenCardLinkOptions {
  readonly openLinksInAppBrowser: boolean;
  readonly t: {
    navigate_external: string;
    external_redirect: string;
    go_to_link: string;
    cancel_button: string;
    invalid_link_title: string;
    invalid_link_desc: string;
    blocked_link_title: string;
    blocked_link_desc: string;
    link_unavailable_title: string;
    link_unavailable_desc: string;
    link_open_failed_title: string;
    link_open_failed_desc: string;
    android_link_ios_title: string;
    android_link_ios_desc: string;
    android_link_open_web: string;
    android_link_copy_package: string;
    notif_copy_success_title: string;
    notif_copy_package_message: string;
  };
}

/**
 * Confirms with the user, then opens a card destination URL externally or in-app.
 * Android app URIs on non-Android platforms show an informative alert with web/copy actions.
 *
 * @param options.openLinksInAppBrowser - Prefer the in-app browser when true
 * @param options.t - Localized strings for confirm/error dialogs
 */
export const useOpenCardLink = ({ openLinksInAppBrowser, t }: UseOpenCardLinkOptions) => {
  const [isOpeningLink, setIsOpeningLink] = useState(false);

  const showLinkError = useCallback(
    (reason: OpenLinkFailureReason) => {
      switch (reason) {
        case 'empty':
        case 'invalid':
          notifications.toast({
            title: t.invalid_link_title,
            message: t.invalid_link_desc,
            variant: 'error',
          });
          break;
        case 'blocked':
          notifications.toast({
            title: t.blocked_link_title,
            message: t.blocked_link_desc,
            variant: 'error',
          });
          break;
        case 'unavailable':
          notifications.toast({
            title: t.link_unavailable_title,
            message: t.link_unavailable_desc,
            variant: 'warning',
          });
          break;
        case 'failed':
        default:
          notifications.toast({
            title: t.link_open_failed_title,
            message: t.link_open_failed_desc,
            variant: 'error',
          });
          break;
      }
    },
    [t]
  );

  const executeOpen = useCallback(
    async (rawUrl: string) => {
      setIsOpeningLink(true);
      try {
        const result = await openExternalLink(rawUrl, {
          preferInAppBrowser: openLinksInAppBrowser,
        });
        if (!result.ok) {
          showLinkError(result.reason);
        }
      } finally {
        setIsOpeningLink(false);
      }
    },
    [openLinksInAppBrowser, showLinkError]
  );

  const showNonAndroidAppLinkAlert = useCallback(
    (rawUrl: string) => {
      const info = parseAppLink(rawUrl);
      if (!info) {
        showLinkError('invalid');
        return;
      }

      const webFallback = getAppWebFallbackUrl(info);
      const actions: NotificationAction[] = [{ text: t.cancel_button, style: 'cancel' }];

      if (webFallback) {
        actions.push({
          text: t.android_link_open_web,
          onPress: () => executeOpen(webFallback),
        });
      } else {
        actions.push({
          text: t.android_link_copy_package,
          onPress: () => {
            void copyPublic(info.packageName).then(() => {
              notifications.toast({
                title: t.notif_copy_success_title,
                message: t.notif_copy_package_message.replace('{pkg}', info.packageName),
                variant: 'success',
                duration: 3000,
              });
            });
          },
        });
      }

      notifications.alert({
        title: t.android_link_ios_title,
        message: `${t.android_link_ios_desc}\n${info.displayLabel}`,
        variant: 'info',
        actions,
      });
    },
    [executeOpen, showLinkError, t]
  );

  const handleOpenCardLink = useCallback(
    (rawUrl: string) => {
      if (isOpeningLink) return;

      const normalized = normalizeUrl(rawUrl);
      if (!normalized) {
        showLinkError(rawUrl.trim() ? 'invalid' : 'empty');
        return;
      }

      if (Platform.OS !== 'android' && isAppLink(rawUrl)) {
        showNonAndroidAppLinkAlert(rawUrl);
        return;
      }

      const displayUrl = getDisplayUrl(rawUrl);

      notifications.alert({
        title: t.navigate_external,
        message: `${t.external_redirect}\n${displayUrl}`,
        variant: 'info',
        actions: [
          { text: t.cancel_button, style: 'cancel' },
          { text: t.go_to_link, onPress: () => executeOpen(rawUrl) },
        ],
      });
    },
    [executeOpen, isOpeningLink, showLinkError, showNonAndroidAppLinkAlert, t]
  );

  return { handleOpenCardLink, isOpeningLink };
};
