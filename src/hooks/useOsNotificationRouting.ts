/**
 * @fileoverview Routes OS notification taps to tabs / PWA prompts / web-client block after unlock.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCoreState } from '../context/CoreStateContext';
import { useSync } from '../context/SyncContext';
import { useSetDashboardTab } from '../context/UIContext';
import { getLocale } from '../constants/localization';
import {
  configureOsNotifications,
  setOsNotificationIntentHandler,
} from '../notifications/osNotificationService';
import {
  consumePendingOsNotificationIntent,
  setPendingOsNotificationIntent,
} from '../notifications/osNotificationPending';
import type { OsNotificationIntent } from '../notifications/osNotificationData';
import { notifications } from '../notifications/notificationRef';
import { AUTO_BACKUP_OPEN_TAB, shareAutoBackupFromNotification } from '../services/autoBackupShare';

/** Subscribes to OS notification responses and applies tab / block intents. */
export function useOsNotificationRouting(): void {
  const { isLogged, db } = useCoreState();
  const { performBiometricOrPasswordCheck } = useAuth();
  const setCurrentTab = useSetDashboardTab();
  const { blockClientIdentity, handleActionConfirmOsIntent, handleUnlockOsIntent } = useSync();

  const isLoggedRef = useRef(isLogged);
  isLoggedRef.current = isLogged;

  const dispatch = useCallback(
    (intent: OsNotificationIntent) => {
      if (intent.kind === 'screenshot') {
        setCurrentTab('settings');
        return;
      }
      if (intent.kind === 'pwa-confirm-open' || intent.kind === 'pwa-confirm-deny') {
        handleActionConfirmOsIntent(
          intent.kind === 'pwa-confirm-deny' ? 'deny' : 'open',
          intent.requestId ?? null,
          { afterVaultUnlock: intent.unlockedAtDispatch }
        );
        return;
      }
      if (intent.kind === 'pwa-unlock-open' || intent.kind === 'pwa-unlock-deny') {
        handleUnlockOsIntent(
          intent.kind === 'pwa-unlock-deny' ? 'deny' : 'open',
          intent.requestId ?? null,
          { afterVaultUnlock: intent.unlockedAtDispatch }
        );
        return;
      }
      if (intent.kind === 'web-open') {
        setCurrentTab('security');
        return;
      }
      if (intent.kind === 'auto-backup-open') {
        setCurrentTab(AUTO_BACKUP_OPEN_TAB);
        return;
      }
      if (intent.kind === 'auto-backup-share') {
        void shareAutoBackupFromNotification(intent.filename).then((result) => {
          if (result === 'shared') return;
          const t = getLocale(db.settings?.language);
          notifications.alert({
            title: t.alert_error_title,
            message: t.export_failed,
            variant: 'error',
          });
        });
        return;
      }

      const runBlock = () => {
        blockClientIdentity({ sourceId: intent.sourceId, ip: intent.ip });
        setCurrentTab('security');
      };

      if (intent.unlockedAtDispatch) {
        runBlock();
        return;
      }

      const t = getLocale(db.settings?.language);
      void performBiometricOrPasswordCheck(runBlock, t.require_auth_block_web_client);
    },
    [
      blockClientIdentity,
      db.settings?.language,
      handleActionConfirmOsIntent,
      handleUnlockOsIntent,
      performBiometricOrPasswordCheck,
      setCurrentTab,
    ]
  );

  useEffect(() => {
    if (!isLogged) return;
    const pending = consumePendingOsNotificationIntent();
    if (pending) dispatch({ ...pending, unlockedAtDispatch: true });
  }, [dispatch, isLogged]);

  useEffect(() => {
    const t = getLocale(db.settings?.language);
    void configureOsNotifications(
      t.web_notif_block_action,
      t.web_notif_deny_action,
      t.auto_backup_share_action
    );
  }, [db.settings?.language]);

  useEffect(() => {
    setOsNotificationIntentHandler((intent) => {
      if (!isLoggedRef.current) {
        setPendingOsNotificationIntent({ ...intent, unlockedAtDispatch: true });
        return;
      }
      dispatch({ ...intent, unlockedAtDispatch: false });
    });
    return () => setOsNotificationIntentHandler(null);
  }, [dispatch]);
}
