/**
 * @fileoverview UI card shown in Settings when the web server is running.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import {
  isPersistableSourceId,
  webClientPrimaryLabel,
  webClientSecondaryLine,
  WEB_CLIENT_ALIAS_MAX,
} from '@pkey/core';
import { WebSyncClient } from '../../types';
import type { LocaleStrings } from '../../constants/localization';
import { useCoreState } from '../../context/CoreStateContext';

interface Props {
  /** IP URL — primary access + QR (works on all platforms). */
  primaryUrl: string | null;
  /** Stable mDNS .local URL for bookmarking on macOS/iOS/Linux. */
  stableMdnsUrl?: string | null;
  webClients: WebSyncClient[];
  /** Local nicknames keyed by `sourceId`. */
  aliases: Record<string, string>;
  onBlockClient: (socketId: string) => void;
  onSetAlias: (sourceId: string, alias: string) => void;
  t: LocaleStrings;
  accentColor: string;
  textColor: string;
  mutedColor: string;
  bgColor: string;
  borderColor: string;
  dangerColor: string;
}

export const SyncWebCard: React.FC<Props> = React.memo(({
  primaryUrl,
  stableMdnsUrl,
  webClients,
  aliases,
  onBlockClient,
  onSetAlias,
  t,
  accentColor,
  textColor,
  mutedColor,
  bgColor,
  borderColor,
  dangerColor,
}) => {
  const { setCustomPrompt, setCustomPromptInput } = useCoreState();
  const [qrVisible, setQrVisible] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const showMdnsUrl = !!(stableMdnsUrl && primaryUrl && stableMdnsUrl !== primaryUrl);
  const connectedCount = webClients.filter((c) => c.authenticated).length;
  const pendingCount = webClients.filter((c) => !c.authenticated).length;
  const qrValue = (showMdnsUrl ? stableMdnsUrl : primaryUrl) ?? '';

  const copyUrl = async (url: string, key: string) => {
    await Clipboard.setStringAsync(url);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const openAliasPrompt = useCallback(
    (sourceId: string) => {
      if (!isPersistableSourceId(sourceId)) return;
      setCustomPromptInput(aliases[sourceId] ?? '');
      setCustomPrompt({
        visible: true,
        title: t.web_client_alias_title,
        message: t.web_client_alias_message,
        secure: false,
        placeholder: t.web_client_alias_placeholder,
        maxLength: WEB_CLIENT_ALIAS_MAX,
        busyMessage: '',
        onConfirm: (value: string) => {
          onSetAlias(sourceId, value);
          setCustomPromptInput('');
          setCustomPrompt((prev: { visible: boolean }) => ({ ...prev, visible: false }));
        },
      });
    },
    [aliases, onSetAlias, setCustomPrompt, setCustomPromptInput, t]
  );

  return (
    <View style={[styles.container, { backgroundColor: bgColor, borderColor }]}>
      <View style={styles.headerRow}>
        <View style={[styles.dot, { backgroundColor: '#22c55e' }]} />
        <Text style={[styles.label, { color: textColor }]}>{t.web_server_active}</Text>
        <TouchableOpacity onPress={() => setQrVisible((v) => !v)} style={styles.toggleBtn}>
          <Ionicons name={qrVisible ? 'chevron-up' : 'chevron-down'} size={16} color={mutedColor} />
        </TouchableOpacity>
      </View>

      {!primaryUrl && (
        <Text style={[styles.emptyHint, { color: mutedColor }]}>{t.web_access_no_lan_url}</Text>
      )}

      {primaryUrl && (
        <View style={styles.urlBlock}>
          <Text style={[styles.urlLabel, { color: mutedColor }]}>{t.web_access_ip_label}</Text>
          <View style={styles.urlRow}>
            <Text style={[styles.url, { color: accentColor }]} selectable>
              {primaryUrl}
            </Text>
            <TouchableOpacity
              onPress={() => copyUrl(primaryUrl, 'ip')}
              style={[styles.copyBtn, { borderColor }]}
              accessibilityLabel={t.web_access_copy}
            >
              <Ionicons
                name={copiedKey === 'ip' ? 'checkmark-outline' : 'copy-outline'}
                size={14}
                color={copiedKey === 'ip' ? accentColor : mutedColor}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {showMdnsUrl && (
        <View style={styles.urlBlock}>
          <Text style={[styles.urlLabel, { color: mutedColor }]}>{t.web_access_mdns_label}</Text>
          <View style={styles.urlRow}>
            <Text style={[styles.fallbackUrl, { color: textColor }]} selectable>
              {stableMdnsUrl}
            </Text>
            <TouchableOpacity
              onPress={() => copyUrl(stableMdnsUrl!, 'mdns')}
              style={[styles.copyBtn, { borderColor }]}
              accessibilityLabel={t.web_access_copy}
            >
              <Ionicons
                name={copiedKey === 'mdns' ? 'checkmark-outline' : 'copy-outline'}
                size={14}
                color={copiedKey === 'mdns' ? accentColor : mutedColor}
              />
            </TouchableOpacity>
          </View>
          <Text style={[styles.autoReconnectHint, { color: mutedColor }]}>
            {t.web_access_autoreconnect_hint}
          </Text>
        </View>
      )}

      {qrVisible && qrValue ? (
        <View style={[styles.qrWrapper, { borderColor }]}>
          <WebAccessQr value={qrValue} backgroundColor={bgColor} color={textColor} />
        </View>
      ) : null}

      <View style={[styles.statsRow, { borderTopColor: borderColor }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: accentColor }]}>{connectedCount}</Text>
          <Text style={[styles.statLabel, { color: mutedColor }]}>{t.web_stat_authenticated}</Text>
        </View>
        {pendingCount > 0 && (
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: '#f59e0b' }]}>{pendingCount}</Text>
            <Text style={[styles.statLabel, { color: mutedColor }]}>{t.web_stat_connecting}</Text>
          </View>
        )}
      </View>

      {webClients.length > 0 && (
        <View style={[styles.clientList, { borderTopColor: borderColor }]}>
          <Text style={[styles.clientListTitle, { color: mutedColor }]}>
            {t.web_connected_browsers}
          </Text>
          {webClients.map((c) => {
            const alias = c.sourceId ? aliases[c.sourceId] : undefined;
            const title = webClientPrimaryLabel({
              alias,
              userAgent: c.userAgent,
              sourceId: c.sourceId,
              socketId: c.socketId,
              fallback: t.web_client_unknown,
            });
            const subtitle = webClientSecondaryLine({
              alias,
              userAgent: c.userAgent,
              ip: c.ip,
            });
            const canRename = isPersistableSourceId(c.sourceId);
            return (
              <View key={c.socketId} style={styles.clientRow}>
                <View
                  style={[
                    styles.clientDot,
                    { backgroundColor: c.authenticated ? '#22c55e' : '#f59e0b' },
                  ]}
                />
                <View style={styles.clientMeta}>
                  <Text style={[styles.clientTitle, { color: textColor }]} numberOfLines={1}>
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text style={[styles.clientSub, { color: mutedColor }]} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.clientTime, { color: mutedColor }]}>
                  {formatDuration(Date.now() - c.connectedAt, t)}
                </Text>
                {canRename ? (
                  <TouchableOpacity
                    onPress={() => openAliasPrompt(c.sourceId!)}
                    style={[styles.iconBtn, { borderColor }]}
                    accessibilityLabel={t.web_client_rename}
                  >
                    <Ionicons name="pencil-outline" size={13} color={mutedColor} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => onBlockClient(c.socketId)}
                  style={[styles.iconBtn, { borderColor: dangerColor }]}
                  accessibilityLabel={t.web_client_block}
                >
                  <Ionicons name="ban-outline" size={13} color={dangerColor} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
});
const WebAccessQr = React.memo(function WebAccessQr({
  value,
  backgroundColor,
  color,
}: {
  value: string;
  backgroundColor: string;
  color: string;
}) {
  return <QRCode value={value} size={160} backgroundColor={backgroundColor} color={color} />;
});

function formatDuration(ms: number, t: LocaleStrings): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return t.duration_seconds.replace('{n}', String(s));
  const m = Math.floor(s / 60);
  if (m < 60) return t.duration_minutes.replace('{n}', String(m));
  return t.duration_hours.replace('{n}', String(Math.floor(m / 60)));
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginTop: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  toggleBtn: {
    padding: 4,
  },
  emptyHint: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  urlBlock: {
    marginBottom: 8,
    gap: 4,
  },
  urlLabel: {
    fontSize: 10,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: '600',
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  url: {
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '600',
    flex: 1,
  },
  fallbackUrl: {
    fontSize: 12,
    fontFamily: 'monospace',
    flex: 1,
  },
  autoReconnectHint: {
    fontSize: 10,
    lineHeight: 14,
  },
  copyBtn: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 6,
    flexShrink: 0,
  },
  qrWrapper: {
    alignSelf: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 20,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clientList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
    paddingTop: 10,
    gap: 8,
  },
  clientListTitle: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clientDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  clientMeta: {
    flex: 1,
    minWidth: 0,
  },
  clientTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  clientSub: {
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 1,
  },
  clientTime: {
    fontSize: 11,
    flexShrink: 0,
  },
  iconBtn: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 4,
    flexShrink: 0,
  },
});
