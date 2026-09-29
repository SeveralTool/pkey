/**
 * @fileoverview QR scanner panels for sender pairing (system scanner + CameraView).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { suppressAutoLogout, QR_SCANNER_GRACE_MS } from '../../utils/autoLogoutGuard';
import { migrationFlowStyles as s } from './migrationFlowStyles';

let CameraView: any = null;
let useCameraPermissions: any = null;
try {
  const cam = require('expo-camera');
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
} catch {
  /* Expo Go */
}

const SENDER_PHASES: MigrationPhase[] = [
  'discovering',
  'connecting',
  'authenticating',
  'preparing',
  'transferring',
  'verifying',
  'ready_to_finalize',
];
const RECEIVER_PHASES: MigrationPhase[] = [
  'discovering',
  'connecting',
  'authenticating',
  'preparing',
  'transferring',
  'applying_cards',
  'applying_settings',
  'verifying',
  'ready_to_finalize',
  'finalizing',
  'migration_complete',
];

const FieldHelp: React.FC<{ children: string; color: string }> = ({ children, color }) => (
  <Text style={[s.fieldHelp, { color }]}>{children}</Text>
);

const modernScannerAvailable = (): boolean => {
  try {
    return !!CameraView?.isModernBarcodeScannerAvailable;
  } catch {
    return false;
  }
};

/** Prefer Google/ML Kit system scanner — no live CameraView preview, far more reliable on Android. */
const ModernQrScanPanel: React.FC<{
  onScan: (data: string) => void | Promise<void>;
  scanLabel: string;
  hint: string;
  fallbackLabel: string;
  permissionLabel: string;
  rescanLabel: string;
  torchLabel: string;
  accent: string;
  textMuted: string;
}> = ({
  onScan,
  scanLabel,
  hint,
  fallbackLabel,
  permissionLabel,
  rescanLabel,
  torchLabel,
  accent,
  textMuted,
}) => {
  const [busy, setBusy] = useState(false);
  const [useLive, setUseLive] = useState(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const handlingRef = useRef(false);

  useEffect(() => {
    suppressAutoLogout(QR_SCANNER_GRACE_MS);
    if (!CameraView?.onModernBarcodeScanned) return;
    const sub = CameraView.onModernBarcodeScanned(async (event: { data?: string }) => {
      if (handlingRef.current) return;
      const trimmed = (event?.data || '').trim();
      if (trimmed.length < 8) return;
      handlingRef.current = true;
      suppressAutoLogout(QR_SCANNER_GRACE_MS);
      try {
        await CameraView.dismissScanner?.();
      } catch {
        /* android auto-dismisses */
      }
      try {
        await onScanRef.current(trimmed);
      } finally {
        setBusy(false);
        setTimeout(() => {
          handlingRef.current = false;
        }, 1500);
      }
    });
    return () => {
      try {
        sub?.remove?.();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const openScanner = useCallback(async () => {
    if (busy || !CameraView?.launchScanner) return;
    setBusy(true);
    suppressAutoLogout(QR_SCANNER_GRACE_MS);
    try {
      await CameraView.launchScanner({ barcodeTypes: ['qr'] });
    } catch {
      /* user cancelled or scanner unavailable */
    } finally {
      // Scan success clears busy in the listener; cancel/dismiss must not leave it stuck.
      setTimeout(() => setBusy(false), 400);
    }
  }, [busy]);

  if (useLive) {
    return (
      <LiveQrScanPanel
        onScan={onScan}
        permissionLabel={permissionLabel}
        rescanLabel={rescanLabel}
        torchLabel={torchLabel}
        accent={accent}
        textMuted={textMuted}
      />
    );
  }

  return (
    <View style={s.modernScanBox}>
      <Text style={[s.methodDesc, { color: textMuted, marginBottom: 10 }]}>{hint}</Text>
      <TouchableOpacity
        style={[
          s.primaryBtn,
          s.modernScanBtn,
          { backgroundColor: accent, opacity: busy ? 0.7 : 1 },
        ]}
        onPress={openScanner}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="qr-code-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={s.primaryBtnText}>{scanLabel}</Text>
          </>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setUseLive(true)}
        style={{ marginTop: 10, paddingVertical: 6 }}
      >
        <Text style={{ color: textMuted, fontSize: 12, textAlign: 'center' }}>{fallbackLabel}</Text>
      </TouchableOpacity>
    </View>
  );
};

/**
 * Lightweight CameraView fallback. Avoid remounting (black preview on Android).
 * Keep preview small — large live previews inside ScrollView stutter badly.
 */
const LiveQrScanPanel: React.FC<{
  onScan: (data: string) => void | Promise<void>;
  permissionLabel: string;
  rescanLabel: string;
  torchLabel: string;
  accent: string;
  textMuted: string;
}> = ({ onScan, permissionLabel, rescanLabel, torchLabel, accent, textMuted }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [appActive, setAppActive] = useState(() => AppState.currentState === 'active');
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [torch, setTorch] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraMounted, setCameraMounted] = useState(true);
  const scanLockedRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const remountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    scanLockedRef.current = false;
    suppressAutoLogout(QR_SCANNER_GRACE_MS);
    return () => {
      if (remountTimer.current) clearTimeout(remountTimer.current);
    };
  }, []);

  const softRemount = useCallback(() => {
    if (remountTimer.current) clearTimeout(remountTimer.current);
    scanLockedRef.current = false;
    setCameraReady(false);
    setCameraMounted(false);
    remountTimer.current = setTimeout(() => {
      setCameraMounted(true);
      suppressAutoLogout(QR_SCANNER_GRACE_MS);
    }, 350);
  }, []);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      const active = next === 'active';
      setAppActive(active);
      if (!active) {
        setCameraReady(false);
        return;
      }
      // Soft remount only after background — never on "rescan" tap.
      if (permission?.granted) {
        softRemount();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [permission?.granted, softRemount]);

  const unlockScan = useCallback(() => {
    scanLockedRef.current = false;
    suppressAutoLogout(QR_SCANNER_GRACE_MS);
  }, []);

  const handleRequestPermission = useCallback(async () => {
    if (requestingPermission) return;
    setRequestingPermission(true);
    suppressAutoLogout(QR_SCANNER_GRACE_MS);
    try {
      const result = await requestPermission();
      suppressAutoLogout(QR_SCANNER_GRACE_MS);
      if (result?.granted && AppState.currentState === 'active') {
        softRemount();
      }
    } finally {
      setRequestingPermission(false);
    }
  }, [requestPermission, requestingPermission, softRemount]);

  const handleBarcode = useCallback(
    ({ data }: { data: string }) => {
      if (scanLockedRef.current || !cameraReady) return;
      const trimmed = (data || '').trim();
      if (trimmed.length < 8) return;
      scanLockedRef.current = true;
      suppressAutoLogout(QR_SCANNER_GRACE_MS);
      void (async () => {
        try {
          await onScanRef.current(trimmed);
        } finally {
          setTimeout(() => {
            scanLockedRef.current = false;
          }, 2500);
        }
      })();
    },
    [cameraReady]
  );

  if (!permission?.granted) {
    return (
      <View style={s.qrPlaceholder}>
        <TouchableOpacity
          style={[s.permBtnFilled, { backgroundColor: accent }]}
          onPress={handleRequestPermission}
          disabled={requestingPermission}
        >
          <Text style={s.permBtnFilledText}>{permissionLabel}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!appActive) {
    return (
      <View style={s.qrPlaceholder}>
        <Text style={[s.qrPlaceholderText, { color: textMuted }]}>{permissionLabel}</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={s.cameraWrap} collapsable={false}>
        {cameraMounted ? (
          <CameraView
            style={s.cameraFill}
            facing="back"
            enableTorch={torch}
            animateShutter={false}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onCameraReady={() => setCameraReady(true)}
            onMountError={() => {
              setCameraReady(false);
              softRemount();
            }}
            onBarcodeScanned={cameraReady ? handleBarcode : undefined}
          />
        ) : (
          <View style={[s.cameraFill, { backgroundColor: '#111' }]} />
        )}
      </View>
      <View style={s.scanActions}>
        <TouchableOpacity
          style={[s.scanActionBtn, { borderColor: accent }]}
          onPress={() => setTorch((v) => !v)}
        >
          <Ionicons name={torch ? 'flash' : 'flash-outline'} size={16} color={accent} />
          <Text style={[s.scanActionText, { color: accent }]}>{torchLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.scanActionBtn, { borderColor: accent }]} onPress={unlockScan}>
          <Ionicons name="refresh-outline" size={16} color={accent} />
          <Text style={[s.scanActionText, { color: accent }]}>{rescanLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const QrScanPanel: React.FC<{
  onScan: (data: string) => void | Promise<void>;
  permissionLabel: string;
  unavailableHint: string;
  rescanLabel: string;
  torchLabel: string;
  scanLabel: string;
  modernHint: string;
  liveFallbackLabel: string;
  accent: string;
  textMuted: string;
}> = ({
  onScan,
  permissionLabel,
  unavailableHint,
  rescanLabel,
  torchLabel,
  scanLabel,
  modernHint,
  liveFallbackLabel,
  accent,
  textMuted,
}) => {
  if (!CameraView || !useCameraPermissions) {
    return (
      <View style={s.qrPlaceholder}>
        <Ionicons name="camera-outline" size={36} color="#888" />
        <Text style={s.qrPlaceholderText}>{unavailableHint}</Text>
      </View>
    );
  }

  if (modernScannerAvailable()) {
    return (
      <ModernQrScanPanel
        onScan={onScan}
        scanLabel={scanLabel}
        hint={modernHint}
        fallbackLabel={liveFallbackLabel}
        permissionLabel={permissionLabel}
        rescanLabel={rescanLabel}
        torchLabel={torchLabel}
        accent={accent}
        textMuted={textMuted}
      />
    );
  }

  return (
    <LiveQrScanPanel
      onScan={onScan}
      permissionLabel={permissionLabel}
      rescanLabel={rescanLabel}
      torchLabel={torchLabel}
      accent={accent}
      textMuted={textMuted}
    />
  );
};
