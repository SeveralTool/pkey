/**
 * @fileoverview Security tab: web access, migration, backup export, and import.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  Platform,
  AppState,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatVaultSessionRef } from '@pkey/core';
import { useCoreState } from '../context/CoreStateContext';
import { useSettings } from '../context/SettingsContext';
import { useDatabase } from '../context/DatabaseContext';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { useMigration } from '../context/MigrationContext';
import { globalStyles as styles } from '../styles/globalStyles';
import { ACCENT_SELECTED_ALPHA, withAlpha } from '../styles/colors';
import { estimateTabBarScrollPadding } from '../navigation/tabBarInset';
import { DashboardScrollView } from '../navigation/DashboardScrollView';
import { FrozenDashboardTab } from '../navigation/FrozenDashboardTab';
import { exportLocalBackup, exportCardsCsvShare, exportCardsJsonShare } from '../services/backup';
import { cardsWithVaultSecrets } from '../services/vaultSecrets';
import {
  enableDeviceSecret,
  disableDeviceSecret,
  mixRootWithSecret,
  parseRecoveryKit,
  isUserCanceledAuth,
} from '../services/deviceSecret';
import {
  getSessionKdfSalt,
  exportSessionRootKeyHex,
  setSessionRootKey,
  whenSessionNativeAttached,
} from '../services/sessionKey';
import { adoptSessionIfPasswordMatches } from '../services/nativeVault';
import { replaceUnlockCredentials } from '../services/biometrics';
import {
  ExportError,
  deleteOldestExportFile,
  type ExportErrorCode,
} from '../services/exportsStorage';
import {
  loadAutoBackupPrefs,
  setAutoBackupEnabled,
  setAutoBackupInterval,
} from '../services/autoBackupPrefs';
import {
  AUTO_BACKUP_DEFAULT_INTERVAL,
  AUTO_BACKUP_INTERVAL_VALUES,
  type AutoBackupInterval,
} from '../services/autoBackupPolicy';
import { runAutoBackup } from '../services/autoBackupRun';
import { syncAutoBackupNativeSchedule } from '../services/autoBackupTask';
import { ensureOsNotificationPermissions } from '../notifications/osNotificationService';
import {
  getAutofillPlatformSupport,
  isAutofillServiceEnabled,
  openAutofillSettings,
} from '../services/autofill';
import { SyncWebCard } from '../components/sync/SyncWebCard';
import { LanNetworkStatus } from '../components/sync/LanNetworkStatus';
import { ImportWizardModal } from '../components/import/ImportWizardModal';
import { HelpInfoButton, HelpProcedureModal } from '../components/help';
import { SettingsSectionCard } from '../components/common';
import { ExportsFileList } from '../components/security';
import type { ProcedureId } from '../constants/procedures';
import { notifications } from '../notifications/notificationRef';

function formatSessionCreated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function SecurityTabContent(): React.JSX.Element {
  const { isLogged, db, setCustomPrompt, setCustomPromptInput } = useCoreState();
  const { c, t, handleToggleSettingsOption } = useSettings();
  const insets = useSafeAreaInsets();
  const {
    handleImportLocalBackup,
    handleImportExternalCards,
    handleDeleteAllCards,
    writeDatabaseToDisk,
  } = useDatabase();
  const { handleResetSession, performBiometricOrPasswordCheck } = useAuth();
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [helpProcedureId, setHelpProcedureId] = useState<ProcedureId | null>(null);
  const [exportsRefreshToken, setExportsRefreshToken] = useState(0);
  const [exportBusy, setExportBusy] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabledState] = useState(false);
  const [autoBackupInterval, setAutoBackupIntervalState] = useState<AutoBackupInterval>(
    AUTO_BACKUP_DEFAULT_INTERVAL
  );
  const [autoBackupNotifyDenied, setAutoBackupNotifyDenied] = useState(false);
  const autofillSupport = getAutofillPlatformSupport();
  const [autofillEnabled, setAutofillEnabled] = useState<boolean | null>(null);

  const bumpExportsList = () => setExportsRefreshToken((n) => n + 1);

  const exportErrorMessage = (code: ExportErrorCode): string => {
    switch (code) {
      case 'no_space':
        return t.export_no_space;
      case 'share_unavailable':
        return t.export_share_unavailable;
      case 'no_database':
        return t.export_no_database;
      case 'limit':
        return t.export_limit_reached;
      case 'write_failed':
      case 'unknown':
      default:
        return t.export_failed;
    }
  };

  const notifyExportError = (err: unknown) => {
    const code = err instanceof ExportError ? err.code : 'unknown';
    notifications.alert({
      title: t.alert_error_title,
      message: exportErrorMessage(code),
      variant: 'error',
    });
  };

  const retryAfterClearingOldest = async (fn: () => Promise<void>) => {
    setExportBusy(true);
    try {
      await deleteOldestExportFile();
      await fn();
      bumpExportsList();
      notifications.toast({
        title: t.export_saved_ok,
        message: t.export_saved_message,
        variant: 'success',
      });
    } catch (err) {
      notifyExportError(err);
    } finally {
      setExportBusy(false);
    }
  };

  const runExport = async (fn: () => Promise<void>, kind: 'backup' | 'plaintext' = 'backup') => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      await fn();
      bumpExportsList();
      notifications.toast({
        title: kind === 'backup' ? t.export_saved_ok : t.export_shared_ok,
        message: kind === 'backup' ? t.export_saved_message : t.export_shared_message,
        variant: 'success',
      });
    } catch (err) {
      if (err instanceof ExportError && err.code === 'limit') {
        notifications.alert({
          title: t.export_limit_title,
          message: t.export_limit_reached,
          variant: 'warning',
          actions: [
            { text: t.cancel_button, style: 'cancel' },
            {
              text: t.export_limit_delete_oldest,
              style: 'destructive',
              onPress: () => {
                void retryAfterClearingOldest(fn);
              },
            },
          ],
        });
        return;
      }
      notifyExportError(err);
    } finally {
      setExportBusy(false);
    }
  };

  const refreshAutofillStatus = useCallback(async () => {
    if (autofillSupport !== 'android') {
      setAutofillEnabled(false);
      return;
    }
    setAutofillEnabled(await isAutofillServiceEnabled());
  }, [autofillSupport]);

  useEffect(() => {
    void refreshAutofillStatus();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshAutofillStatus();
    });
    return () => sub.remove();
  }, [refreshAutofillStatus]);

  useEffect(() => {
    void loadAutoBackupPrefs().then((prefs) => {
      setAutoBackupEnabledState(prefs.enabled);
      setAutoBackupIntervalState(prefs.interval);
    });
  }, []);
  const {
    nativeSyncAvailable,
    webServerEnabled,
    webServerBusy,
    enableWebServer,
    disableWebServer,
    webIpUrl,
    webMdnsUrl,
    webPort,
    connectedWebClients,
    unblockDevice,
    blockedSources,
    blockedIps,
    unblockIp,
    blockWebClient,
    webClientAliases,
    setWebClientAlias,
    webReactivatePending,
    dismissWebReactivate,
    reactivateWebServer,
    lanNetwork,
    revealLanSsid,
  } = useSync();
  const { openMigrationSend, openMigrationReceive, nativeMigrationAvailable } = useMigration();

  const confirmPlaintextExport = (kind: 'csv' | 'json') => {
    if (exportBusy) return;
    if (!isLogged || !db?.cards?.length) {
      notifications.alert({
        title: t.alert_error_title,
        message: t.export_needs_cards,
        variant: 'warning',
      });
      return;
    }
    notifications.alert({
      title: t.export_plaintext_title,
      message: t.export_plaintext_warning,
      variant: 'warning',
      actions: [
        { text: t.cancel_button, style: 'cancel' },
        {
          text: t.proceed_button,
          style: 'destructive',
          onPress: () => {
            void performBiometricOrPasswordCheck(() => {
              void runExport(async () => {
                if (kind === 'csv') await exportCardsCsvShare(cardsWithVaultSecrets(db.cards));
                else await exportCardsJsonShare(cardsWithVaultSecrets(db.cards));
              }, 'plaintext');
            }, t.require_auth_export_plaintext);
          },
        },
      ],
    });
  };

  const handleExportLocalBackup = () => {
    if (exportBusy) return;
    void performBiometricOrPasswordCheck(() => {
      void runExport(() => exportLocalBackup());
    }, t.require_auth_export_backup);
  };

  const handleToggleAutoBackup = (enable: boolean) => {
    void (async () => {
      if (!enable) {
        await setAutoBackupEnabled(false);
        setAutoBackupEnabledState(false);
        setAutoBackupNotifyDenied(false);
        await syncAutoBackupNativeSchedule();
        return;
      }
      await setAutoBackupEnabled(true);
      setAutoBackupEnabledState(true);
      await syncAutoBackupNativeSchedule();
      const granted = await ensureOsNotificationPermissions(
        t.web_notif_block_action,
        t.web_notif_deny_action,
        t.auto_backup_share_action
      );
      setAutoBackupNotifyDenied(!granted);
      await runAutoBackup('enable');
      bumpExportsList();
    })();
  };

  const handleSetAutoBackupInterval = (interval: AutoBackupInterval) => {
    setAutoBackupIntervalState(interval);
    void setAutoBackupInterval(interval).then(() => syncAutoBackupNativeSchedule());
  };

  const autoBackupIntervalLabel = (value: AutoBackupInterval): string => {
    if (value === '1M') return t.auto_backup_interval_1m;
    if (value === '7D') return t.auto_backup_interval_7d;
    return t.auto_backup_interval_24h;
  };

  const notifyDeviceSecretEnableFailed = () => {
    notifications.toast({
      title: t.device_secret_title,
      message: t.device_secret_enable_failed,
      variant: 'error',
    });
  };

  /**
   * Order matters for crash safety: the vault on disk is rewritten with the
   * mixed root *before* the biometric bundle is rotated. A failed disk write
   * restores the previous session root and deletes the secret that was just
   * stored. Once that write returns true, later failures must not delete the
   * secret: the file is already mixed, and rolling it back would drop the
   * only on-device copy before the recovery kit is shown.
   */
  const runEnableDeviceSecret = async () => {
    let secretStored = false;
    let vaultCommitted = false;
    let recoveryKit: string | null = null;
    let previousRoot: { rootHex: string; kdfSalt: string } | null = null;
    const rollback = async () => {
      if (previousRoot) {
        setSessionRootKey(previousRoot.rootHex, previousRoot.kdfSalt);
        await whenSessionNativeAttached();
      }
      if (secretStored) {
        await disableDeviceSecret().catch(() => undefined);
      }
    };
    const showRecoveryKit = () => {
      if (!recoveryKit) return;
      notifications.alert({
        title: t.device_secret_recovery_title,
        message: `${t.device_secret_recovery_body}\n\n${recoveryKit}`,
        variant: 'warning',
      });
    };
    try {
      const kit = await enableDeviceSecret(t.require_auth_device_secret);
      if (!kit) {
        notifyDeviceSecretEnableFailed();
        return;
      }
      secretStored = true;
      recoveryKit = kit;
      const rootHex = await exportSessionRootKeyHex();
      const kdfSalt = getSessionKdfSalt();
      const secretHex = parseRecoveryKit(kit);
      if (!rootHex || !kdfSalt || !secretHex) {
        await rollback();
        notifyDeviceSecretEnableFailed();
        return;
      }
      previousRoot = { rootHex, kdfSalt };
      const mixedRoot = mixRootWithSecret(rootHex, secretHex);
      setSessionRootKey(mixedRoot, kdfSalt);
      await whenSessionNativeAttached();
      const nextDb = {
        ...db,
        settings: { ...db.settings, bindDeviceSecret: true },
        last_update: new Date().toISOString(),
      };
      const written = await writeDatabaseToDisk(nextDb, true);
      if (!written) {
        await rollback();
        return;
      }
      vaultCommitted = true;
      if (db.passwordHash) {
        await replaceUnlockCredentials(mixedRoot, kdfSalt, db.passwordHash);
      }
      showRecoveryKit();
    } catch (err) {
      if (vaultCommitted) {
        console.warn('[SecurityTab] device secret committed; skipping rollback', err);
        try {
          showRecoveryKit();
        } catch (alertErr) {
          console.warn('[SecurityTab] recovery kit alert failed', alertErr);
        }
        return;
      }
      if (isUserCanceledAuth(err)) {
        if (secretStored) await rollback();
        return;
      }
      await rollback();
      notifyDeviceSecretEnableFailed();
    }
  };

  const handleToggleDeviceSecret = (enable: boolean) => {
    if (!isLogged || !db?.salt) return;
    if (enable) {
      // Android prompts twice: storeDeviceSecret, then storeUnlockBundle
      // (two Keystore aliases, each BIOMETRIC_STRONG). A prior
      // expo-local-authentication dialog was a third prompt.
      // iOS SecItemAdd does not prompt. The dialog below is LocalAuthentication
      // only and is not the Keychain ACL. The bundle uses biometryCurrentSet;
      // the secret uses biometryAny.
      if (Platform.OS === 'android') {
        void runEnableDeviceSecret();
      } else {
        void performBiometricOrPasswordCheck(() => {
          void runEnableDeviceSecret();
        }, t.require_auth_device_secret);
      }
      return;
    }
    setCustomPromptInput('');
    setCustomPrompt({
      visible: true,
      title: t.device_secret_title,
      message: t.require_auth_device_secret,
      secure: true,
      busyMessage: '',
      onConfirm: (pass: string) => {
        const salt = db.salt;
        if (!pass.trim() || !salt) return;
        void (async () => {
          const mixedRoot = await exportSessionRootKeyHex();
          const mixedSalt = getSessionKdfSalt();
          const restoreMixedSession = async () => {
            if (mixedRoot && mixedSalt) {
              setSessionRootKey(mixedRoot, mixedSalt);
              await whenSessionNativeAttached();
            }
          };
          try {
            const ok = await adoptSessionIfPasswordMatches(pass, salt, db.passwordHash);
            if (!ok) {
              setCustomPrompt((prev) => ({ ...prev, error: t.wrong_key_p }));
              return;
            }
            setCustomPrompt((prev) => ({ ...prev, visible: false }));
            // Rewrite the vault with the unbound root first; only once the
            // file no longer needs the secret is it removed from hardware.
            // A kill in between leaves an unbound vault plus an orphan
            // secret, which the next unlock ignores.
            const written = await writeDatabaseToDisk(
              {
                ...db,
                settings: { ...db.settings, bindDeviceSecret: false },
                last_update: new Date().toISOString(),
              },
              true
            );
            if (!written) {
              await restoreMixedSession();
              return;
            }
            await disableDeviceSecret();
            const unboundRoot = await exportSessionRootKeyHex();
            const unboundSalt = getSessionKdfSalt();
            if (unboundRoot && unboundSalt && db.passwordHash) {
              await replaceUnlockCredentials(unboundRoot, unboundSalt, db.passwordHash);
            }
          } catch {
            await restoreMixedSession();
            setCustomPrompt((prev) => ({ ...prev, error: t.wrong_key_p }));
          }
        })();
      },
    });
  };

  const onImportPress = () => {
    if (isLogged) {
      notifications.alert({
        title: t.alert_warning_title,
        message: t.import_warning_override,
        variant: 'warning',
        actions: [
          { text: t.cancel_button, style: 'cancel' },
          { text: t.proceed_button, style: 'destructive', onPress: handleImportLocalBackup },
        ],
      });
    } else {
      handleImportLocalBackup();
    }
  };

  return (
    <DashboardScrollView
      contentContainerStyle={[
        styles.statsPanelContainerScrollBody,
        { paddingBottom: estimateTabBarScrollPadding(insets.bottom) },
      ]}
    >
      <HelpProcedureModal procedureId={helpProcedureId} onClose={() => setHelpProcedureId(null)} />
      {/* ---- WEB ACCESS ---- */}
      {db.settings?.strictOffline !== true && (
        <SettingsSectionCard
          icon="globe-outline"
          title={t.web_access_title}
          first
          headerRight={<HelpInfoButton onPress={() => setHelpProcedureId('web_access')} />}
        >
          {webReactivatePending && !webServerEnabled && (
            <View
              style={{
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: c.warning,
                backgroundColor: 'rgba(255,193,7,0.08)',
                marginBottom: 12,
              }}
            >
              <Text style={{ color: c.text, fontSize: 13, marginBottom: 10 }}>
                {t.web_access_reactivate_prompt}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    padding: 10,
                    borderRadius: 8,
                    backgroundColor: c.accent,
                    alignItems: 'center',
                  }}
                  onPress={() => reactivateWebServer()}
                  accessibilityRole="button"
                  accessibilityLabel={t.web_access_reactivate_btn}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {t.web_access_reactivate_btn}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    padding: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: c.border,
                    alignItems: 'center',
                  }}
                  onPress={dismissWebReactivate}
                  accessibilityRole="button"
                  accessibilityLabel={t.web_access_reactivate_dismiss}
                >
                  <Text style={{ color: c.textMuted, fontWeight: '600' }}>
                    {t.web_access_reactivate_dismiss}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!nativeSyncAvailable && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                padding: 12,
                borderRadius: 8,
                backgroundColor: 'rgba(255,150,0,0.08)',
                marginBottom: 12,
              }}
            >
              <Ionicons
                name="warning-outline"
                size={16}
                color={c.warning}
                style={{ marginRight: 8, marginTop: 1 }}
              />
              <Text style={{ color: c.textMuted, fontSize: 12, flex: 1, lineHeight: 17 }}>
                {t.migration_dev_build_required}
              </Text>
            </View>
          )}

          <View
            style={[styles.settingInterativeRowSelectorContainer, { borderBottomColor: c.border }]}
          >
            <View style={styles.settingTextGroupingLeftColumn}>
              <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
                {t.web_access_toggle}
              </Text>
              <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
                {t.web_access_desc.replace('{port}', String(webPort))}
              </Text>
              <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
                {t.web_access_transport_warning}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {webServerBusy ? <ActivityIndicator size="small" color={c.accent} /> : null}
              <Switch
                value={webServerEnabled}
                disabled={!nativeSyncAvailable || webServerBusy}
                onValueChange={(v) => {
                  if (webServerBusy) return;
                  if (v) void enableWebServer();
                  else disableWebServer();
                }}
                trackColor={{ false: '#767577', true: c.success }}
                thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#F4F3F4'}
              />
            </View>
          </View>

          <LanNetworkStatus
            snapshot={lanNetwork}
            onRevealSsid={revealLanSsid}
            t={t}
            textColor={c.text}
            mutedColor={c.textMuted}
            accentColor={c.accent}
            warningColor={c.warning}
            borderColor={c.border}
          />

          {webServerEnabled && (
            <SyncWebCard
              primaryUrl={webIpUrl}
              stableMdnsUrl={webMdnsUrl}
              webClients={connectedWebClients}
              aliases={webClientAliases}
              onBlockClient={blockWebClient}
              onSetAlias={setWebClientAlias}
              t={t}
              accentColor={c.accent}
              textColor={c.text}
              mutedColor={c.textMuted}
              bgColor={c.bg}
              borderColor={c.border}
              dangerColor={c.danger}
            />
          )}

          {(blockedSources.length > 0 || blockedIps.length > 0) && (
            <View style={{ marginTop: 12, gap: 6 }}>
              {blockedSources.length > 0 ? (
                <>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '600',
                      color: c.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 2,
                    }}
                  >
                    {t.web_blocked_clients}
                  </Text>
                  {blockedSources.map((sid) => (
                    <View key={sid} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="ban-outline" size={13} color={c.danger} />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 12,
                            color: c.text,
                            fontWeight: webClientAliases[sid] ? '600' : '400',
                          }}
                          numberOfLines={1}
                          accessibilityLabel={webClientAliases[sid] || sid}
                        >
                          {webClientAliases[sid] || sid}
                        </Text>
                        {webClientAliases[sid] ? (
                          <Text
                            style={{ fontSize: 11, color: c.textMuted, fontFamily: 'monospace' }}
                            numberOfLines={1}
                            accessibilityLabel={sid}
                          >
                            {sid}
                          </Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        style={{
                          borderWidth: 1,
                          borderColor: c.success,
                          borderRadius: 6,
                          padding: 8,
                          minWidth: 44,
                          minHeight: 44,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        onPress={() => unblockDevice(sid)}
                        accessibilityRole="button"
                        accessibilityLabel={t.web_unblock_client.replace(
                          '{name}',
                          webClientAliases[sid] || sid
                        )}
                      >
                        <Ionicons name="checkmark-outline" size={12} color={c.success} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              ) : null}
              {blockedIps.length > 0 ? (
                <>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '600',
                      color: c.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginTop: blockedSources.length > 0 ? 8 : 0,
                      marginBottom: 2,
                    }}
                  >
                    {t.web_blocked_ips}
                  </Text>
                  {blockedIps.map((ip) => (
                    <View key={ip} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="ban-outline" size={13} color={c.danger} />
                      <Text
                        style={{ flex: 1, fontSize: 12, color: c.text, fontFamily: 'monospace' }}
                        numberOfLines={1}
                        accessibilityLabel={ip}
                      >
                        {ip}
                      </Text>
                      <TouchableOpacity
                        style={{
                          borderWidth: 1,
                          borderColor: c.success,
                          borderRadius: 6,
                          padding: 8,
                          minWidth: 44,
                          minHeight: 44,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        onPress={() => unblockIp(ip)}
                        accessibilityRole="button"
                        accessibilityLabel={t.web_unblock_ip.replace('{ip}', ip)}
                      >
                        <Ionicons name="checkmark-outline" size={12} color={c.success} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              ) : null}
            </View>
          )}

          <View
            style={[
              styles.settingInterativeRowSelectorContainer,
              { borderBottomColor: c.border, marginTop: 8 },
            ]}
          >
            <View style={styles.settingTextGroupingLeftColumn}>
              <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
                {t.web_access_autostart_label}
              </Text>
            </View>
            <Switch
              value={db.settings.webAccessAutoStart === true}
              disabled={!nativeSyncAvailable || !isLogged}
              onValueChange={(v) => handleToggleSettingsOption('webAccessAutoStart', v)}
              trackColor={{ false: '#767577', true: c.success }}
              thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#F4F3F4'}
            />
          </View>

          <View
            style={[
              styles.settingInterativeRowSelectorContainer,
              { borderBottomColor: c.border, marginTop: 8 },
            ]}
          >
            <View style={styles.settingTextGroupingLeftColumn}>
              <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
                {t.web_confirm_on_phone_label}
              </Text>
              <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
                {t.web_confirm_on_phone_desc}
              </Text>
            </View>
            <Switch
              value={db.settings.webConfirmOnPhone === true}
              disabled={!nativeSyncAvailable || !isLogged}
              onValueChange={(v) => handleToggleSettingsOption('webConfirmOnPhone', v)}
              trackColor={{ false: '#767577', true: c.success }}
              thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#F4F3F4'}
            />
          </View>

          <View
            style={[
              styles.settingInterativeRowSelectorContainer,
              { borderBottomColor: c.border, marginTop: 8 },
            ]}
          >
            <View style={styles.settingTextGroupingLeftColumn}>
              <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
                {t.web_login_on_phone_label}
              </Text>
              <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
                {t.web_login_on_phone_desc}
              </Text>
            </View>
            <Switch
              value={db.settings.webLoginOnPhone === true}
              disabled={!nativeSyncAvailable || !isLogged}
              onValueChange={(v) => handleToggleSettingsOption('webLoginOnPhone', v)}
              trackColor={{ false: '#767577', true: c.success }}
              thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#F4F3F4'}
            />
          </View>
        </SettingsSectionCard>
      )}

      {/* ---- DEVICE MIGRATION ---- */}
      <SettingsSectionCard
        icon="phone-portrait-outline"
        title={t.migration_section_title}
        headerRight={<HelpInfoButton onPress={() => setHelpProcedureId('device_migration')} />}
      >
        <Text
          style={[
            styles.formDescriptionNormal,
            { color: c.textMuted, marginTop: 0, marginBottom: 12, lineHeight: 18 },
          ]}
        >
          {t.migration_section_desc}
        </Text>

        <TouchableOpacity
          style={[
            styles.primaryActActionButton,
            {
              backgroundColor: c.accent,
              opacity: nativeMigrationAvailable ? 1 : 0.5,
            },
          ]}
          onPress={openMigrationSend}
          disabled={!nativeMigrationAvailable || !isLogged}
          accessibilityRole="button"
          accessibilityLabel={t.migration_send_btn}
          accessibilityState={{ disabled: !nativeMigrationAvailable || !isLogged }}
        >
          <Ionicons
            name="arrow-forward-outline"
            size={18}
            color="#FFFFFF"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.primaryActActionText}>{t.migration_send_btn}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.secGhostOutlineButton,
            {
              borderColor: c.border,
              paddingVertical: 12,
              justifyContent: 'center',
              marginTop: 12,
              opacity: nativeMigrationAvailable ? 1 : 0.5,
            },
          ]}
          onPress={openMigrationReceive}
          disabled={!nativeMigrationAvailable}
          accessibilityRole="button"
          accessibilityLabel={t.migration_receive_btn}
          accessibilityState={{ disabled: !nativeMigrationAvailable }}
        >
          <Ionicons name="download-outline" size={18} color={c.text} style={{ marginRight: 8 }} />
          <Text style={[styles.secGhostOutlineText, { color: c.text }]}>
            {t.migration_receive_btn}
          </Text>
        </TouchableOpacity>
      </SettingsSectionCard>

      {/* ---- BACKUP & EXPORT ---- */}
      <SettingsSectionCard
        icon="save-outline"
        title={t.backup_export_title}
        headerRight={<HelpInfoButton onPress={() => setHelpProcedureId('backup_export')} />}
      >
        <Text
          style={[
            styles.formDescriptionNormal,
            { color: c.textMuted, marginBottom: 12, lineHeight: 18 },
          ]}
        >
          {t.backup_export_desc}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 12,
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
              {t.auto_backup_title}
            </Text>
            <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
              {t.auto_backup_desc}
            </Text>
            {autoBackupEnabled && autoBackupNotifyDenied ? (
              <Text style={[styles.settingRowMutedSubTextDesc, { color: c.warning, marginTop: 4 }]}>
                {t.auto_backup_notify_denied}
              </Text>
            ) : null}
          </View>
          <Switch
            value={autoBackupEnabled}
            onValueChange={handleToggleAutoBackup}
            trackColor={{ false: '#767577', true: c.success }}
            thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#F4F3F4'}
            accessibilityRole="switch"
            accessibilityLabel={t.auto_backup_title}
          />
        </View>
        <View style={{ marginBottom: 12 }}>
          <Text
            style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted, marginBottom: 8 }]}
          >
            {t.auto_backup_interval_label}
          </Text>
          <View style={styles.horizontalPillsSegmentControls}>
            {AUTO_BACKUP_INTERVAL_VALUES.map((value) => {
              const stored = autoBackupInterval === value;
              const live = autoBackupEnabled && stored;
              return (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.segmentButtonOption,
                    {
                      borderColor: live ? c.accent : stored ? c.textMuted : c.border,
                      backgroundColor: live
                        ? withAlpha(c.accent, ACCENT_SELECTED_ALPHA)
                        : 'transparent',
                    },
                  ]}
                  onPress={() => handleSetAutoBackupInterval(value)}
                  disabled={!autoBackupEnabled}
                  accessibilityRole="button"
                  accessibilityState={{ selected: stored, disabled: !autoBackupEnabled }}
                  accessibilityLabel={autoBackupIntervalLabel(value)}
                >
                  <Text
                    style={[
                      styles.segmentOptionTextLabel,
                      {
                        color: live ? c.accent : stored ? c.text : c.textMuted,
                        fontSize: 10,
                      },
                    ]}
                  >
                    {autoBackupIntervalLabel(value)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted, marginTop: 8 }]}>
            {t.auto_backup_os_hint}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.secGhostOutlineButton,
            {
              borderColor: c.border,
              paddingVertical: 12,
              justifyContent: 'center',
              opacity: exportBusy ? 0.45 : 1,
            },
          ]}
          onPress={handleExportLocalBackup}
          disabled={exportBusy}
          accessibilityRole="button"
          accessibilityLabel={t.local_backup_btn}
          accessibilityState={{ disabled: exportBusy }}
        >
          <Ionicons name="download-outline" size={18} color={c.text} style={{ marginRight: 8 }} />
          <Text style={[styles.secGhostOutlineText, { color: c.text }]}>{t.local_backup_btn}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.secGhostOutlineButton,
            {
              borderColor: c.border,
              paddingVertical: 12,
              justifyContent: 'center',
              marginTop: 12,
              opacity: isLogged && !exportBusy ? 1 : 0.45,
            },
          ]}
          onPress={() => confirmPlaintextExport('csv')}
          disabled={!isLogged || exportBusy}
          accessibilityRole="button"
          accessibilityLabel={t.export_csv_btn}
          accessibilityState={{ disabled: !isLogged || exportBusy }}
        >
          <Ionicons name="grid-outline" size={18} color={c.text} style={{ marginRight: 8 }} />
          <Text style={[styles.secGhostOutlineText, { color: c.text }]}>{t.export_csv_btn}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.secGhostOutlineButton,
            {
              borderColor: c.border,
              paddingVertical: 12,
              justifyContent: 'center',
              marginTop: 12,
              opacity: isLogged && !exportBusy ? 1 : 0.45,
            },
          ]}
          onPress={() => confirmPlaintextExport('json')}
          disabled={!isLogged || exportBusy}
          accessibilityRole="button"
          accessibilityLabel={t.export_json_btn}
          accessibilityState={{ disabled: !isLogged || exportBusy }}
        >
          <Ionicons name="code-slash-outline" size={18} color={c.text} style={{ marginRight: 8 }} />
          <Text style={[styles.secGhostOutlineText, { color: c.text }]}>{t.export_json_btn}</Text>
        </TouchableOpacity>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 16,
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
                {t.device_secret_title}
              </Text>
              <HelpInfoButton onPress={() => setHelpProcedureId('device_secret')} />
            </View>
            <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
              {t.device_secret_desc}
            </Text>
          </View>
          <Switch
            value={db.settings?.bindDeviceSecret === true}
            onValueChange={handleToggleDeviceSecret}
            trackColor={{ false: '#767577', true: c.success }}
            thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#F4F3F4'}
          />
        </View>
        <ExportsFileList refreshToken={exportsRefreshToken} />
      </SettingsSectionCard>

      {/* ---- IMPORT / RESTORE (next to export) ---- */}
      <SettingsSectionCard
        icon="cloud-download-outline"
        title={t.import_restoration}
        headerRight={<HelpInfoButton onPress={() => setHelpProcedureId('import_restore')} />}
      >
        <TouchableOpacity
          style={[
            styles.secGhostOutlineButton,
            { borderColor: c.border, paddingVertical: 12, justifyContent: 'center' },
          ]}
          onPress={onImportPress}
          accessibilityRole="button"
          accessibilityLabel={t.import_action}
        >
          <Ionicons
            name="document-text-outline"
            size={18}
            color={c.text}
            style={{ marginRight: 8 }}
          />
          <Text style={[styles.secGhostOutlineText, { color: c.text }]}>{t.import_action}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.secGhostOutlineButton,
            {
              borderColor: c.border,
              paddingVertical: 12,
              justifyContent: 'center',
              marginTop: 12,
              opacity: isLogged ? 1 : 0.45,
            },
          ]}
          onPress={() => setImportWizardOpen(true)}
          disabled={!isLogged}
          accessibilityRole="button"
          accessibilityLabel={t.import_manager_title}
          accessibilityState={{ disabled: !isLogged }}
        >
          <Ionicons
            name="folder-open-outline"
            size={18}
            color={c.text}
            style={{ marginRight: 8 }}
          />
          <Text style={[styles.secGhostOutlineText, { color: c.text }]}>
            {t.import_manager_title}
          </Text>
        </TouchableOpacity>
      </SettingsSectionCard>

      {/* ---- SYSTEM AUTOFILL ---- */}
      <SettingsSectionCard icon="keypad-outline" title={t.autofill_match_title}>
        <Text
          style={[
            styles.formDescriptionNormal,
            { color: c.textMuted, marginBottom: 12, lineHeight: 18 },
          ]}
        >
          {autofillSupport === 'ios_unavailable'
            ? t.autofill_match_desc_ios
            : t.autofill_match_desc_android}
        </Text>
        {autofillSupport === 'android' && (
          <>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 12,
                gap: 8,
              }}
            >
              <Ionicons
                name={
                  autofillEnabled === true
                    ? 'checkmark-circle'
                    : autofillEnabled === null
                      ? 'time-outline'
                      : 'ellipse-outline'
                }
                size={18}
                color={autofillEnabled === true ? c.success : c.textMuted}
              />
              <Text
                style={{
                  color: autofillEnabled === true ? c.success : c.textMuted,
                  fontSize: 13,
                  flex: 1,
                }}
              >
                {autofillEnabled === null
                  ? t.autofill_status_unknown
                  : autofillEnabled
                    ? t.autofill_status_on
                    : t.autofill_status_off}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.secGhostOutlineButton,
                { borderColor: c.border, paddingVertical: 12, justifyContent: 'center' },
              ]}
              onPress={() => void openAutofillSettings()}
              accessibilityRole="button"
              accessibilityLabel={
                autofillEnabled === true ? t.autofill_open_settings : t.autofill_enable_btn
              }
            >
              <Ionicons
                name="settings-outline"
                size={18}
                color={c.text}
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.secGhostOutlineText, { color: c.text }]}>
                {autofillEnabled === true ? t.autofill_open_settings : t.autofill_enable_btn}
              </Text>
            </TouchableOpacity>
          </>
        )}
        {autofillSupport === 'ios_unavailable' && (
          <TouchableOpacity
            style={[
              styles.secGhostOutlineButton,
              { borderColor: c.border, paddingVertical: 12, justifyContent: 'center' },
            ]}
            onPress={() => void openAutofillSettings()}
            accessibilityRole="button"
            accessibilityLabel={t.autofill_open_settings}
          >
            <Ionicons name="settings-outline" size={18} color={c.text} style={{ marginRight: 8 }} />
            <Text style={[styles.secGhostOutlineText, { color: c.text }]}>
              {t.autofill_open_settings}
            </Text>
          </TouchableOpacity>
        )}
      </SettingsSectionCard>

      {/* ---- THIS VAULT SESSION ---- */}
      <SettingsSectionCard
        icon="id-card-outline"
        title={t.session_section_title}
        borderColor={c.warning}
        titleColor={c.warning}
        iconColor={c.warning}
      >
        <Text
          selectable
          style={{
            color: c.text,
            fontSize: 13,
            fontVariant: ['tabular-nums'],
            letterSpacing: 0.2,
            marginBottom: 8,
          }}
          accessibilityLabel={`${t.session_id} ${formatVaultSessionRef(db.sessionId || '') || '—'}`}
        >
          {formatVaultSessionRef(db.sessionId || '') || '—'}
        </Text>
        <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 8 }}>
          {t.session_created} {formatSessionCreated(db.creation_date)}
        </Text>
        <Text style={{ color: c.textMuted, fontSize: 11, lineHeight: 16 }}>
          {t.session_id_hint}
        </Text>
      </SettingsSectionCard>

      {/* ---- DANGER ZONE ---- */}
      <SettingsSectionCard
        icon="warning-outline"
        title={t.delete_all_section_title}
        borderColor={c.danger}
        titleColor={c.danger}
        iconColor={c.danger}
        headerRight={
          <HelpInfoButton color={c.danger} onPress={() => setHelpProcedureId('danger_zone')} />
        }
      >
        <View style={{ marginBottom: 12, gap: 8 }}>
          <Text
            style={[
              styles.formDescriptionNormal,
              { color: c.textMuted, marginBottom: 0, lineHeight: 18 },
            ]}
          >
            {t.delete_all_section_desc}
          </Text>
          <Text
            style={[
              styles.formDescriptionNormal,
              { color: c.textMuted, marginBottom: 0, lineHeight: 18 },
            ]}
          >
            {t.delete_all_warning}
          </Text>
          {(db.cards?.length ?? 0) > 0 && (
            <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted, marginTop: 0 }]}>
              {t.delete_all_count.replace('{n}', String(db.cards.length))}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[
            styles.primaryActActionButton,
            {
              backgroundColor: c.danger,
              opacity: isLogged && (db.cards?.length ?? 0) > 0 ? 1 : 0.45,
            },
          ]}
          onPress={handleDeleteAllCards}
          disabled={!isLogged || (db.cards?.length ?? 0) === 0}
          accessibilityRole="button"
          accessibilityLabel={t.delete_all_btn}
        >
          <Ionicons name="trash-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.primaryActActionText}>{t.delete_all_btn}</Text>
        </TouchableOpacity>

        <View style={{ marginTop: 20, marginBottom: 12 }}>
          <Text
            style={[
              styles.formDescriptionNormal,
              { color: c.textMuted, marginBottom: 0, lineHeight: 18 },
            ]}
          >
            {t.reset_session_warning}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.primaryActActionButton,
            {
              backgroundColor: c.danger,
              opacity: isLogged ? 1 : 0.45,
            },
          ]}
          onPress={handleResetSession}
          disabled={!isLogged}
          accessibilityRole="button"
          accessibilityLabel={t.reset_session_btn}
        >
          <Ionicons
            name="alert-circle-outline"
            size={18}
            color="#FFFFFF"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.primaryActActionText}>{t.reset_session_btn}</Text>
        </TouchableOpacity>
      </SettingsSectionCard>

      <ImportWizardModal
        visible={importWizardOpen}
        onClose={() => setImportWizardOpen(false)}
        onImport={handleImportExternalCards}
      />
    </DashboardScrollView>
  );
}

/** Security tab. React renders suspend while another dashboard tab is focused. */
export function SecurityTab(): React.JSX.Element {
  return (
    <FrozenDashboardTab>
      <SecurityTabContent />
    </FrozenDashboardTab>
  );
}
