/**
 * @fileoverview Lists historical export files from the app exports folder.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { notifications } from '../../notifications/notificationRef';
import {
  deleteExportFile,
  EXPORT_LOW_SPACE_BYTES,
  EXPORT_MAX_FILES,
  ExportError,
  formatExportBytes,
  getAvailableDiskSpaceBytes,
  listExportFiles,
  purgeEphemeralExports,
  purgePlaintextExports,
  shareExportFile,
  type ExportFileInfo,
} from '../../services/exportsStorage';
import { globalStyles as styles } from '../../styles/globalStyles';

function formatWhen(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

export interface ExportsFileListProps {
  /** Bump to force a reload (e.g. after creating an export). */
  refreshToken?: number;
}

export const ExportsFileList: React.FC<ExportsFileListProps> = ({ refreshToken = 0 }) => {
  const { c, t } = useSettings();
  const { performBiometricOrPasswordCheck } = useAuth();
  const [files, setFiles] = useState<ExportFileInfo[]>([]);
  const [freeBytes, setFreeBytes] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [listErrorNotified, setListErrorNotified] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([purgePlaintextExports(), purgeEphemeralExports()]);
      const [listed, free] = await Promise.all([listExportFiles(), getAvailableDiskSpaceBytes()]);
      setFiles(listed);
      setFreeBytes(free);
    } catch {
      setFiles([]);
      if (!listErrorNotified) {
        setListErrorNotified(true);
        notifications.alert({
          title: t.alert_error_title,
          message: t.export_list_failed,
          variant: 'error',
        });
      }
    } finally {
      setLoading(false);
    }
  }, [listErrorNotified, t.alert_error_title, t.export_list_failed]);

  useEffect(() => {
    void reload();
  }, [reload, refreshToken]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload();
    });
    return () => sub.remove();
  }, [reload]);

  const onShare = async (file: ExportFileInfo) => {
    try {
      await shareExportFile(file.uri, file.ext);
    } catch (err) {
      const code = err instanceof ExportError ? err.code : 'unknown';
      notifications.alert({
        title: t.alert_error_title,
        message: code === 'share_unavailable' ? t.export_share_unavailable : t.export_failed,
        variant: 'error',
      });
    }
  };

  const onDelete = (file: ExportFileInfo) => {
    notifications.alert({
      title: t.export_delete_title,
      message: t.export_delete_confirm.replace('{name}', file.filename),
      variant: 'warning',
      actions: [
        { text: t.cancel_button, style: 'cancel' },
        {
          text: t.delete_button,
          style: 'destructive',
          onPress: () => {
            void performBiometricOrPasswordCheck(async () => {
              try {
                await deleteExportFile(file.uri);
                await reload();
              } catch {
                notifications.alert({
                  title: t.alert_error_title,
                  message: t.export_delete_failed,
                  variant: 'error',
                });
              }
            }, t.require_auth_delete_export);
          },
        },
      ],
    });
  };

  const freeLabel =
    freeBytes !== null && freeBytes >= 0
      ? t.export_free_space.replace('{size}', formatExportBytes(freeBytes) || `${freeBytes} B`)
      : null;
  const showLowSpace = freeBytes !== null && freeBytes < EXPORT_LOW_SPACE_BYTES;

  const header = (
    <View style={{ marginTop: 12, marginBottom: files.length || loading ? 0 : 0 }}>
      <Text
        style={[
          styles.settingRowMutedSubTextDesc,
          {
            color: files.length >= EXPORT_MAX_FILES ? c.warning : c.textMuted,
            marginBottom: 2,
            lineHeight: 16,
          },
        ]}
      >
        {t.export_count_label
          .replace('{n}', String(files.length))
          .replace('{limit}', String(EXPORT_MAX_FILES))}
      </Text>
      {files.length >= EXPORT_MAX_FILES ? (
        <Text
          style={[
            styles.settingRowMutedSubTextDesc,
            { color: c.warning, marginBottom: 8, lineHeight: 16 },
          ]}
        >
          {t.export_limit_hint}
        </Text>
      ) : null}
      {freeLabel ? (
        <Text
          style={[
            styles.settingRowMutedSubTextDesc,
            { color: c.textMuted, marginBottom: 4, lineHeight: 16 },
          ]}
        >
          {freeLabel}
        </Text>
      ) : null}
      {showLowSpace ? (
        <Text
          style={[
            styles.settingRowMutedSubTextDesc,
            { color: c.warning, marginBottom: 8, lineHeight: 16 },
          ]}
        >
          {t.export_low_space_hint}
        </Text>
      ) : null}
    </View>
  );

  if (loading && files.length === 0) {
    return (
      <View>
        {header}
        <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
          {t.export_files_loading}
        </Text>
      </View>
    );
  }

  if (files.length === 0) {
    return (
      <View>
        {header}
        <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
          {t.export_files_empty}
        </Text>
      </View>
    );
  }

  return (
    <View>
      {header}
      <View style={{ maxHeight: 280 }}>
        {files.map((file) => {
          const sizeLabel = formatExportBytes(file.size);
          const when = formatWhen(file.modifiedAt);
          return (
            <View
              key={file.uri}
              style={[
                styles.settingInterativeRowSelectorContainer,
                { borderBottomColor: c.border, paddingVertical: 10 },
              ]}
            >
              <View style={[styles.settingTextGroupingLeftColumn, { paddingRight: 8 }]}>
                <Text
                  style={[styles.settingRowLabelBoldTitle, { color: c.text, fontSize: 12 }]}
                  numberOfLines={1}
                >
                  {file.filename}
                </Text>
                <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
                  {[when, sizeLabel, file.ext.toUpperCase()].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <TouchableOpacity
                  onPress={() => void onShare(file)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t.export_share_a11y}
                  style={{ padding: 6 }}
                >
                  <Ionicons name="share-outline" size={20} color={c.accent} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onDelete(file)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t.export_delete_a11y}
                  style={{ padding: 6 }}
                >
                  <Ionicons name="trash-outline" size={20} color={c.danger} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};
