/**
 * Inline QR scanner panel for otpauth:// URIs (migration-style section, not fullscreen).
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { parseOtpAuthUri } from '@pkey/core';
import { Ionicons } from '@expo/vector-icons';
import { processOtpBarcodeScan } from './otpQrScan';
import { suppressAutoLogout, QR_SCANNER_GRACE_MS } from '../../utils/autoLogoutGuard';

interface Props {
  onClose: () => void;
  onScan: (parsed: NonNullable<ReturnType<typeof parseOtpAuthUri>>) => void;
  onInvalidScan?: () => void;
  labels: { title: string; cancel: string; hint?: string; permission: string };
  text: string;
  textMuted: string;
  cardBg: string;
  borderColor: string;
}

export const OtpQrScannerPanel: React.FC<Props> = ({
  onClose,
  onScan,
  onInvalidScan,
  labels,
  text,
  textMuted,
  cardBg,
  borderColor,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [appActive, setAppActive] = useState(() => AppState.currentState === 'active');
  const [cameraKey, setCameraKey] = useState(0);
  const [requestingPermission, setRequestingPermission] = useState(false);

  useEffect(() => {
    setScanned(false);
    suppressAutoLogout(QR_SCANNER_GRACE_MS);
  }, []);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      const active = next === 'active';
      setAppActive(active);
      if (active && permission?.granted) {
        setCameraKey((k) => k + 1);
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [permission?.granted]);

  const handleRequestPermission = useCallback(async () => {
    if (requestingPermission) return;
    setRequestingPermission(true);
    suppressAutoLogout(QR_SCANNER_GRACE_MS);
    try {
      const result = await requestPermission();
      suppressAutoLogout(QR_SCANNER_GRACE_MS);
      if (result?.granted && AppState.currentState === 'active') {
        setCameraKey((k) => k + 1);
      }
    } finally {
      setRequestingPermission(false);
    }
  }, [requestPermission, requestingPermission]);

  const handleBarcode = ({ data }: { data: string }) => {
    if (scanned) return;
    const result = processOtpBarcodeScan(data);
    if (result.kind === 'valid') {
      setScanned(true);
      onScan(result.parsed);
      onClose();
      return;
    }
    onInvalidScan?.();
  };

  const showCamera = !!permission?.granted && appActive;

  return (
    <View style={[styles.section, { backgroundColor: cardBg, borderColor }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: text }]}>{labels.title}</Text>
        <TouchableOpacity
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={labels.cancel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close-circle-outline" size={22} color={textMuted} />
        </TouchableOpacity>
      </View>
      {labels.hint ? <Text style={[styles.hint, { color: textMuted }]}>{labels.hint}</Text> : null}
      {!permission?.granted ? (
        <View style={styles.qrPlaceholder}>
          <TouchableOpacity
            style={styles.permBtn}
            onPress={handleRequestPermission}
            disabled={requestingPermission}
            accessibilityRole="button"
            accessibilityLabel={labels.permission}
            accessibilityState={{ disabled: requestingPermission }}
          >
            <Text style={styles.permBtnText}>{labels.permission}</Text>
          </TouchableOpacity>
        </View>
      ) : showCamera ? (
        <View style={styles.cameraWrap} collapsable={false} renderToHardwareTextureAndroid>
          <CameraView
            key={cameraKey}
            style={styles.cameraFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : handleBarcode}
          />
        </View>
      ) : (
        <View style={styles.qrPlaceholder}>
          <Text style={[styles.waitingText, { color: textMuted }]}>{labels.permission}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 14, fontWeight: '700', flex: 1, paddingRight: 8 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  qrPlaceholder: {
    height: 200,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  permBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
  },
  permBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  waitingText: { fontSize: 13, textAlign: 'center', paddingHorizontal: 12 },
  cameraWrap: {
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  cameraFill: {
    width: '100%',
    height: '100%',
  },
});
