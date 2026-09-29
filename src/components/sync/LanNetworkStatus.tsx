/**
 * @fileoverview Compact LAN / cellular status row for the web-access settings section.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LanNetworkSnapshot } from '../../services/networkUtils';
import type { LocaleStrings } from '../../constants/localization';
import {
  getWifiSsidPermissionStatus,
  isWifiSsidNativeAvailable,
  type WifiSsidPermissionStatus,
} from '../../utils/wifiSsidPermission';

interface Props {
  snapshot: LanNetworkSnapshot;
  onRevealSsid: () => Promise<WifiSsidPermissionStatus>;
  t: LocaleStrings;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  warningColor: string;
  borderColor: string;
}

function kindLabel(kind: LanNetworkSnapshot['kind'], t: LocaleStrings): string {
  switch (kind) {
    case 'wifi':
      return t.lan_kind_wifi;
    case 'ethernet':
      return t.lan_kind_ethernet;
    case 'cellular':
      return t.lan_kind_cellular;
    case 'none':
      return t.lan_kind_none;
    default:
      return t.lan_kind_other;
  }
}

function kindIcon(kind: LanNetworkSnapshot['kind']): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'wifi':
      return 'wifi-outline';
    case 'ethernet':
      return 'laptop-outline';
    case 'cellular':
      return 'cellular-outline';
    case 'none':
      return 'cloud-offline-outline';
    default:
      return 'globe-outline';
  }
}

export const LanNetworkStatus: React.FC<Props> = ({
  snapshot,
  onRevealSsid,
  t,
  textColor,
  mutedColor,
  accentColor,
  warningColor,
  borderColor,
}) => {
  const [ssidPermission, setSsidPermission] = useState<WifiSsidPermissionStatus | null>(null);
  const [ssidBusy, setSsidBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getWifiSsidPermissionStatus().then((status) => {
      if (!cancelled) setSsidPermission(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRevealSsid = useCallback(async () => {
    if (ssidBusy) return;
    setSsidBusy(true);
    try {
      const status = await onRevealSsid();
      setSsidPermission(status);
    } finally {
      setSsidBusy(false);
    }
  }, [onRevealSsid, ssidBusy]);

  const title = snapshot.ssid
    ? `${kindLabel(snapshot.kind, t)} · ${snapshot.ssid}`
    : kindLabel(snapshot.kind, t);
  const ipLine =
    snapshot.isLikelyLan && snapshot.ip
      ? t.lan_status_ip.replace('{ip}', snapshot.ip)
      : t.lan_status_no_ip;
  const showWarning = !snapshot.isLikelyLan;
  const showSsidButton = isWifiSsidNativeAvailable() && snapshot.kind === 'wifi' && !snapshot.ssid;

  return (
    <View style={[styles.wrap, { borderColor }]}>
      <View style={styles.row}>
        <Ionicons
          name={kindIcon(snapshot.kind)}
          size={16}
          color={showWarning ? warningColor : accentColor}
          style={styles.icon}
        />
        <View style={styles.meta}>
          <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.ip, { color: mutedColor }]} numberOfLines={1}>
            {ipLine}
          </Text>
        </View>
      </View>

      {showWarning ? (
        <Text style={[styles.warning, { color: warningColor }]}>{t.lan_not_lan_warning}</Text>
      ) : null}

      {showSsidButton ? (
        <View style={styles.ssidBlock}>
          {ssidPermission === 'granted' ? (
            <Text style={[styles.rationale, { color: mutedColor }]}>{t.lan_ssid_unavailable}</Text>
          ) : (
            <Text style={[styles.rationale, { color: mutedColor }]}>{t.lan_ssid_rationale}</Text>
          )}
          {ssidPermission === 'blocked' ? (
            <Text style={[styles.rationale, { color: warningColor }]}>{t.lan_ssid_blocked}</Text>
          ) : (
            <TouchableOpacity
              onPress={() => {
                void handleRevealSsid();
              }}
              style={[styles.ssidBtn, { borderColor: accentColor }]}
              accessibilityRole="button"
              accessibilityLabel={t.lan_ssid_show}
              disabled={ssidBusy}
            >
              {ssidBusy ? (
                <ActivityIndicator size="small" color={accentColor} />
              ) : (
                <Text style={[styles.ssidBtnText, { color: accentColor }]}>{t.lan_ssid_show}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 12,
    marginBottom: 0,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  icon: {
    marginRight: 8,
    marginTop: 1,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
  },
  ip: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  warning: {
    fontSize: 12,
    lineHeight: 17,
  },
  ssidBlock: {
    gap: 8,
  },
  rationale: {
    fontSize: 11,
    lineHeight: 16,
  },
  ssidBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  ssidBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
