/**
 * @fileoverview Full-screen migration flow with phased progress stepper.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useSettings } from '../../context/SettingsContext';
import { useMigration } from '../../context/MigrationContext';
import { NotificationOverlay } from '../notifications/NotificationOverlay';
import {
  MigrationPhase,
  MIGRATION_PORT,
  formatPairingCode,
  formatPairingInput,
  formatSessionRef,
  normalizePairingCode,
} from '../../services/migrationProtocol';
import { QrScanPanel } from './MigrationQrScanner';
import { getReceiverConnectPanelMode } from './receiverConnectPanel';
import { migrationFlowStyles as s } from './migrationFlowStyles';

type SendConnectMode = 'auto' | 'qr' | 'manual';

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

export const MigrationFlowScreen: React.FC = () => {
  const { c, t } = useSettings();
  const {
    migrationVisible,
    migrationRole,
    migrationPhase,
    migrationProgress,
    migrationMessage,
    migrationError,
    discoveredDevices,
    receiverQrPayload,
    receiverIp,
    receiverSessionId,
    receiverPairingSecret,
    receiverFingerprint,
    senderFingerprint,
    receiverTlsFingerprint,
    senderTlsFingerprint,
    receiverPort,
    nativeMigrationAvailable,
    mdnsAvailable,
    cancelMigration,
    selectDeviceAndMigrate,
    connectFromQr,
    connectManual,
    finalizeMigration,
    abortReceivedMigration,
    closeMigration,
    incompleteMigrationPending,
  } = useMigration();

  const [sendMode, setSendMode] = useState<SendConnectMode>(mdnsAvailable ? 'auto' : 'qr');
  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState(String(MIGRATION_PORT));
  const [manualPairingSecret, setManualPairingSecret] = useState('');
  const [manualConnecting, setManualConnecting] = useState(false);
  const [mdnsPairDevice, setMdnsPairDevice] = useState<(typeof discoveredDevices)[0] | null>(null);
  const [mdnsPairingInput, setMdnsPairingInput] = useState('');
  const [senderWaitSecs, setSenderWaitSecs] = useState(15);
  const [senderCanCancel, setSenderCanCancel] = useState(false);

  const phaseLabel = useCallback(
    (phase: MigrationPhase): string => {
      const map: Partial<Record<MigrationPhase, string>> = {
        idle: t.migration_phase_idle,
        discovering:
          migrationRole === 'receiving'
            ? receiverQrPayload
              ? t.migration_waiting_connection
              : t.migration_receiver_preparing
            : t.migration_phase_discovering,
        connecting: t.migration_phase_connecting,
        authenticating: t.migration_phase_authenticating,
        preparing: t.migration_phase_preparing,
        transferring: t.migration_phase_transferring,
        applying_cards: t.migration_phase_applying_cards,
        applying_settings: t.migration_phase_applying_settings,
        verifying: t.migration_phase_verifying,
        ready_to_finalize: t.migration_phase_ready,
        finalizing: t.migration_phase_finalizing,
        wipe_complete: t.migration_phase_wipe_complete,
        migration_complete: t.migration_phase_complete,
        error: t.migration_phase_error,
      };
      return map[phase] || phase;
    },
    [t, migrationRole, receiverQrPayload]
  );

  const phases = migrationRole === 'receiving' ? RECEIVER_PHASES : SENDER_PHASES;
  const phaseIndex = phases.indexOf(migrationPhase);
  const receiverAwaitingFinalize =
    migrationRole === 'receiving' &&
    (migrationPhase === 'ready_to_finalize' || migrationPhase === 'finalizing');
  const receiverPanelMode = getReceiverConnectPanelMode({
    role: migrationRole,
    phase: migrationPhase,
    hasError: Boolean(migrationError),
    hasQr: Boolean(receiverQrPayload),
    hasPairing: Boolean(receiverPairingSecret),
  });

  useEffect(() => {
    if (!(migrationRole === 'sending' && migrationPhase === 'ready_to_finalize')) {
      setSenderWaitSecs(15);
      setSenderCanCancel(false);
      return;
    }
    const started = Date.now();
    setSenderWaitSecs(15);
    setSenderCanCancel(false);
    const id = setInterval(() => {
      const left = Math.max(0, 15 - Math.floor((Date.now() - started) / 1000));
      setSenderWaitSecs(left);
      if (left <= 0) {
        setSenderCanCancel(true);
        clearInterval(id);
      }
    }, 200);
    return () => clearInterval(id);
  }, [migrationRole, migrationPhase]);

  const handleClose = () => {
    if (migrationPhase === 'migration_complete' || migrationPhase === 'wipe_complete') {
      closeMigration();
      return;
    }
    // While waiting to finalize on receiver: only allow leave via abort (discard staged vault).
    if (receiverAwaitingFinalize) {
      if (migrationPhase === 'finalizing') return;
      abortReceivedMigration();
      return;
    }
    // Sender waiting: cancel only after countdown (or use same cancelMigration).
    if (migrationRole === 'sending' && migrationPhase === 'ready_to_finalize') {
      if (!senderCanCancel) return;
      cancelMigration();
      return;
    }
    cancelMigration();
  };

  if (!migrationVisible) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={handleClose}>
      <View style={[s.root, { backgroundColor: c.bg }]}>
        <View style={[s.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity
            onPress={handleClose}
            style={[
              s.backBtn,
              (receiverAwaitingFinalize && migrationPhase === 'finalizing') ||
              (migrationRole === 'sending' &&
                migrationPhase === 'ready_to_finalize' &&
                !senderCanCancel)
                ? { opacity: 0.35 }
                : null,
            ]}
            disabled={
              (receiverAwaitingFinalize && migrationPhase === 'finalizing') ||
              (migrationRole === 'sending' &&
                migrationPhase === 'ready_to_finalize' &&
                !senderCanCancel)
            }
            accessibilityRole="button"
            accessibilityLabel={t.close_button}
          >
            <Ionicons name="close" size={24} color={c.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: c.text }]}>
            {migrationRole === 'receiving' ? t.migration_receive_title : t.migration_send_title}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={s.body}>
          {!nativeMigrationAvailable && (
            <View style={[s.warnBox, { borderColor: c.warning }]}>
              <Text style={{ color: c.warning, fontSize: 12 }}>
                {t.migration_dev_build_required}
              </Text>
            </View>
          )}

          {migrationError && (
            <View style={[s.warnBox, { borderColor: c.danger }]}>
              <Text style={{ color: c.danger, fontSize: 13 }}>{migrationError}</Text>
            </View>
          )}

          {/* Phase stepper */}
          <View style={[s.stepper, { backgroundColor: c.cardBg, borderColor: c.border }]}>
            {phases.map((phase, idx) => {
              const done = phaseIndex > idx;
              const active = migrationPhase === phase;
              const pending = phaseIndex < idx && migrationPhase !== 'error';
              return (
                <View key={phase} style={s.stepRow}>
                  <View
                    style={[
                      s.stepDot,
                      done && { backgroundColor: c.success },
                      active && { backgroundColor: c.accent },
                      pending && { backgroundColor: c.border },
                    ]}
                  >
                    {active &&
                    migrationPhase !== 'ready_to_finalize' &&
                    migrationPhase !== 'migration_complete' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : done ? (
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    ) : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.stepLabel, { color: active ? c.text : c.textMuted }]}>
                      {phaseLabel(phase)}
                      {active && migrationMessage ? ` — ${migrationMessage}` : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
            {migrationPhase === 'transferring' || migrationPhase === 'preparing' ? (
              <View style={s.progressBarWrap}>
                <View style={[s.progressBarBg, { backgroundColor: c.border }]}>
                  <View
                    style={[
                      s.progressBarFill,
                      { width: `${migrationProgress}%`, backgroundColor: c.accent },
                    ]}
                  />
                </View>
                <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 4 }}>
                  {migrationProgress}%
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={[s.hint, { color: c.textMuted }]}>{t.migration_wifi_hint}</Text>
          <Text style={[s.hint, { color: c.textMuted, marginTop: 4 }]}>
            {t.migration_biometrics_hint}
          </Text>

          {/* Receiver: QR + manual details (skeleton while TLS/IP are still starting) */}
          {receiverPanelMode !== 'hidden' && (
            <>
              <Text style={[s.overview, { color: c.textMuted }]}>
                {t.migration_receiver_overview}
              </Text>

              <View style={[s.qrSection, { backgroundColor: c.cardBg, borderColor: c.border }]}>
                <Text style={[s.sectionTitle, { color: c.text }]}>
                  {t.migration_receiver_qr_title}
                </Text>
                {receiverQrPayload ? (
                  <>
                    <Text style={[s.methodDesc, { color: c.textMuted }]}>
                      {t.migration_receiver_qr_hint}
                    </Text>
                    <View style={s.qrCodePad}>
                      <QRCode value={receiverQrPayload} size={184} ecl="M" quietZone={10} />
                    </View>
                  </>
                ) : (
                  <>
                    <View
                      style={s.qrSkeleton}
                      accessibilityRole="progressbar"
                      accessibilityLabel={t.migration_receiver_qr_loading}
                    >
                      <ActivityIndicator color={c.accent} size="large" />
                    </View>
                    <Text
                      style={[s.qrSkeletonHint, { color: c.textMuted }]}
                      accessibilityLiveRegion="polite"
                    >
                      {t.migration_receiver_qr_loading}
                    </Text>
                  </>
                )}
              </View>

              <View style={[s.manualInfoBox, { backgroundColor: c.cardBg, borderColor: c.border }]}>
                <Text style={[s.sectionTitle, { color: c.text, marginBottom: 4 }]}>
                  {t.migration_receiver_manual_title}
                </Text>
                {receiverPairingSecret ? (
                  <>
                    <Text style={[s.methodDesc, { color: c.textMuted }]}>
                      {t.migration_receiver_manual_desc}
                    </Text>
                    <View
                      style={[s.pairingBlock, { borderColor: c.border, backgroundColor: c.bg }]}
                    >
                      <Text style={[s.manualInfoLabel, { color: c.textMuted }]}>
                        {t.migration_receiver_pairing_prominent}
                      </Text>
                      <Text style={[s.pairingCode, { color: c.text }]} selectable>
                        {formatPairingCode(receiverPairingSecret)}
                      </Text>
                      <FieldHelp color={c.textMuted}>{t.migration_receiver_pairing_help}</FieldHelp>
                    </View>

                    <View style={s.manualInfoRow}>
                      <Text style={[s.manualInfoLabel, { color: c.textMuted }]}>
                        {t.migration_receiver_manual_ip}
                      </Text>
                      {receiverIp ? (
                        <Text style={[s.manualInfoValue, { color: c.text }]} selectable>
                          {receiverIp}
                        </Text>
                      ) : receiverTlsFingerprint || receiverQrPayload ? (
                        <Text style={[s.manualInfoValue, { color: c.text }]}>—</Text>
                      ) : (
                        <Text style={[s.manualInfoValue, { color: c.textMuted }]}>
                          {t.migration_receiver_ip_pending}
                        </Text>
                      )}
                      <FieldHelp color={c.textMuted}>{t.migration_receiver_ip_help}</FieldHelp>
                    </View>

                    <View style={s.manualInfoRow}>
                      <Text style={[s.manualInfoLabel, { color: c.textMuted }]}>
                        {t.migration_receiver_manual_port}
                      </Text>
                      <Text style={[s.manualInfoValue, { color: c.text }]} selectable>
                        {receiverPort}
                      </Text>
                      <FieldHelp color={c.textMuted}>{t.migration_receiver_port_help}</FieldHelp>
                    </View>
                  </>
                ) : (
                  <View
                    style={s.detailsSkeleton}
                    accessibilityRole="progressbar"
                    accessibilityLabel={t.migration_receiver_details_loading}
                  >
                    <ActivityIndicator color={c.accent} />
                    <Text style={[s.qrSkeletonHint, { color: c.textMuted, marginTop: 8 }]}>
                      {t.migration_receiver_details_loading}
                    </Text>
                  </View>
                )}

                {receiverSessionId ? (
                  <View style={s.manualInfoRow}>
                    <Text style={[s.manualInfoLabel, { color: c.textMuted }]}>
                      {t.migration_receiver_session_ref}
                    </Text>
                    <Text
                      style={[s.manualInfoValue, { color: c.textMuted, fontFamily: 'monospace' }]}
                      selectable
                    >
                      {formatSessionRef(receiverSessionId)}
                    </Text>
                    <FieldHelp color={c.textMuted}>{t.migration_receiver_session_help}</FieldHelp>
                  </View>
                ) : null}

                {receiverFingerprint || receiverTlsFingerprint ? (
                  <View style={[s.fingerprintBox, { borderColor: c.border, marginTop: 14 }]}>
                    <Text style={[s.sectionTitle, { color: c.text, marginBottom: 4 }]}>
                      {t.migration_fingerprint_title}
                    </Text>
                    <Text style={[s.methodDesc, { color: c.textMuted, marginBottom: 8 }]}>
                      {t.migration_fingerprint_both_hint}
                    </Text>
                    {receiverTlsFingerprint ? (
                      <>
                        <Text style={[s.manualInfoLabel, { color: c.textMuted }]}>
                          {t.migration_tls_fingerprint_label}
                        </Text>
                        <Text
                          style={[s.fingerprintValue, { color: c.text, fontSize: 16 }]}
                          selectable
                        >
                          {receiverTlsFingerprint}
                        </Text>
                      </>
                    ) : null}
                    {receiverFingerprint ? (
                      <>
                        <Text style={[s.manualInfoLabel, { color: c.textMuted, marginTop: 8 }]}>
                          {t.migration_fingerprint_receiver}
                        </Text>
                        <Text
                          style={[s.fingerprintValue, { color: c.text, fontSize: 16 }]}
                          selectable
                        >
                          {receiverFingerprint}
                        </Text>
                      </>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </>
          )}

          {/* Sender: connection methods */}
          {migrationRole === 'sending' && migrationPhase === 'discovering' && (
            <View style={[s.deviceList, { backgroundColor: c.cardBg, borderColor: c.border }]}>
              <Text style={[s.sectionTitle, { color: c.text }]}>
                {t.migration_send_methods_title}
              </Text>

              <View style={s.modeTabs}>
                {(['auto', 'qr', 'manual'] as SendConnectMode[]).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      s.modeTab,
                      { borderColor: c.border },
                      sendMode === mode && {
                        borderColor: c.accent,
                        backgroundColor: `${c.accent}18`,
                      },
                    ]}
                    onPress={() => setSendMode(mode)}
                  >
                    <Text
                      style={{
                        color: sendMode === mode ? c.accent : c.textMuted,
                        fontSize: 12,
                        fontWeight: '600',
                      }}
                    >
                      {mode === 'auto'
                        ? t.migration_send_method_auto
                        : mode === 'qr'
                          ? t.migration_send_method_qr
                          : t.migration_send_method_manual}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {sendMode === 'auto' && (
                <>
                  <Text style={[s.methodDesc, { color: c.textMuted }]}>
                    {t.migration_send_auto_desc}
                  </Text>
                  <Text style={[s.subSectionTitle, { color: c.text }]}>
                    {mdnsAvailable ? t.migration_devices_found : t.migration_no_mdns}
                  </Text>
                  {discoveredDevices.length === 0 ? (
                    <Text style={{ color: c.textMuted, fontSize: 13, paddingVertical: 8 }}>
                      {t.migration_scanning}
                    </Text>
                  ) : (
                    discoveredDevices.map((d) => (
                      <TouchableOpacity
                        key={`${d.ip}:${d.port}`}
                        style={[s.deviceRow, { borderColor: c.border }]}
                        onPress={() => {
                          setMdnsPairDevice(d);
                          setMdnsPairingInput('');
                        }}
                      >
                        <Ionicons name="phone-portrait-outline" size={18} color={c.accent} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={{ color: c.text, fontWeight: '600' }}>{d.name}</Text>
                          <Text style={{ color: c.textMuted, fontSize: 11 }}>
                            {d.ip}:{d.port}
                          </Text>
                          {d.fingerprint ? (
                            <Text
                              style={{ color: c.textMuted, fontSize: 10, fontFamily: 'monospace' }}
                            >
                              {t.migration_fingerprint_receiver}: {d.fingerprint}
                            </Text>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
                      </TouchableOpacity>
                    ))
                  )}
                  {!mdnsAvailable && (
                    <Text style={[s.methodHint, { color: c.warning }]}>{t.migration_no_mdns}</Text>
                  )}
                </>
              )}

              {sendMode === 'qr' && (
                <>
                  <Text style={[s.methodDesc, { color: c.textMuted }]}>
                    {t.migration_send_qr_desc}
                  </Text>
                  <QrScanPanel
                    onScan={(data) => connectFromQr(data)}
                    permissionLabel={t.migration_camera_permission}
                    unavailableHint={t.migration_camera_unavailable}
                    rescanLabel={t.migration_qr_rescan}
                    torchLabel={t.migration_qr_torch}
                    scanLabel={t.migration_qr_open_scanner}
                    modernHint={t.migration_qr_modern_hint}
                    liveFallbackLabel={t.migration_qr_live_fallback}
                    accent={c.accent}
                    textMuted={c.textMuted}
                  />
                </>
              )}

              {sendMode === 'manual' && (
                <>
                  <Text style={[s.methodDesc, { color: c.textMuted }]}>
                    {t.migration_send_manual_desc}
                  </Text>
                  <Text style={[s.fieldLabel, { color: c.textMuted }]}>
                    {t.migration_manual_ip_label}
                  </Text>
                  <FieldHelp color={c.textMuted}>{t.migration_manual_ip_help}</FieldHelp>
                  <TextInput
                    style={[
                      s.input,
                      { borderColor: c.border, color: c.text, backgroundColor: c.cardBg },
                    ]}
                    placeholder={t.migration_manual_ip_placeholder}
                    placeholderTextColor={c.textMuted}
                    value={manualIp}
                    onChangeText={setManualIp}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="decimal-pad"
                  />
                  <Text style={[s.fieldLabel, { color: c.textMuted }]}>
                    {t.migration_manual_port_label}
                  </Text>
                  <FieldHelp color={c.textMuted}>{t.migration_manual_port_help}</FieldHelp>
                  <TextInput
                    style={[
                      s.input,
                      { borderColor: c.border, color: c.text, backgroundColor: c.cardBg },
                    ]}
                    placeholder={t.migration_manual_port_placeholder}
                    placeholderTextColor={c.textMuted}
                    value={manualPort}
                    onChangeText={setManualPort}
                    keyboardType="number-pad"
                  />
                  <Text style={[s.fieldLabel, { color: c.textMuted }]}>
                    {t.migration_manual_pairing_label}
                  </Text>
                  <FieldHelp color={c.textMuted}>{t.migration_manual_pairing_help}</FieldHelp>
                  <TextInput
                    style={[
                      s.input,
                      {
                        borderColor: c.border,
                        color: c.text,
                        backgroundColor: c.cardBg,
                        fontFamily: 'monospace',
                        letterSpacing: 1,
                      },
                    ]}
                    placeholder={t.migration_manual_pairing_placeholder}
                    placeholderTextColor={c.textMuted}
                    value={manualPairingSecret}
                    onChangeText={(text) => setManualPairingSecret(formatPairingInput(text))}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={[
                      s.primaryBtn,
                      {
                        backgroundColor: c.accent,
                        marginTop: 12,
                        opacity: manualConnecting ? 0.7 : 1,
                      },
                    ]}
                    disabled={manualConnecting}
                    onPress={async () => {
                      setManualConnecting(true);
                      try {
                        await connectManual(
                          manualIp,
                          parseInt(manualPort, 10) || MIGRATION_PORT,
                          manualPairingSecret
                        );
                      } finally {
                        setManualConnecting(false);
                      }
                    }}
                  >
                    {manualConnecting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={s.primaryBtnText}>{t.migration_manual_connect_btn}</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {migrationRole === 'sending' &&
            (senderFingerprint || senderTlsFingerprint) &&
            migrationPhase !== 'discovering' &&
            migrationPhase !== 'error' && (
              <View
                style={[
                  s.fingerprintBox,
                  { backgroundColor: c.cardBg, borderColor: c.border, marginTop: 12 },
                ]}
              >
                <Text style={[s.sectionTitle, { color: c.text }]}>
                  {t.migration_fingerprint_title}
                </Text>
                <Text style={[s.methodDesc, { color: c.textMuted }]}>
                  {t.migration_fingerprint_both_hint}
                </Text>
                {senderTlsFingerprint ? (
                  <>
                    <Text style={[s.manualInfoLabel, { color: c.textMuted }]}>
                      {t.migration_tls_fingerprint_label}
                    </Text>
                    <Text style={[s.fingerprintValue, { color: c.text, fontSize: 18 }]} selectable>
                      {senderTlsFingerprint}
                    </Text>
                  </>
                ) : null}
                {senderFingerprint ? (
                  <>
                    <Text style={[s.manualInfoLabel, { color: c.textMuted, marginTop: 8 }]}>
                      {t.migration_fingerprint_sender}
                    </Text>
                    <Text style={[s.fingerprintValue, { color: c.text, fontSize: 18 }]} selectable>
                      {senderFingerprint}
                    </Text>
                  </>
                ) : null}
              </View>
            )}

          {migrationRole === 'sending' && migrationPhase === 'ready_to_finalize' && (
            <View style={[s.waitBox, { backgroundColor: c.cardBg, borderColor: c.border }]}>
              <ActivityIndicator color={c.accent} />
              <Text
                style={[s.methodDesc, { color: c.textMuted, marginTop: 10, textAlign: 'center' }]}
              >
                {t.migration_sender_waiting_finalize}
              </Text>
              {!senderCanCancel ? (
                <Text
                  style={{
                    color: c.text,
                    fontSize: 28,
                    fontWeight: '700',
                    textAlign: 'center',
                    marginTop: 16,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {senderWaitSecs}s
                </Text>
              ) : null}
              <Text
                style={[
                  s.methodDesc,
                  { color: c.textMuted, marginTop: 8, textAlign: 'center', fontSize: 12 },
                ]}
              >
                {senderCanCancel
                  ? t.migration_sender_wait_expired
                  : t.migration_sender_countdown.replace('{s}', String(senderWaitSecs))}
              </Text>
              {senderCanCancel ? (
                <TouchableOpacity
                  style={[s.secBtn, { borderColor: c.danger, marginTop: 14, alignSelf: 'stretch' }]}
                  onPress={cancelMigration}
                >
                  <Text style={[s.secBtnText, { color: c.danger, textAlign: 'center' }]}>
                    {t.migration_cancel_send_btn}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {migrationPhase === 'migration_complete' && (
            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: c.success }]}
              onPress={closeMigration}
            >
              <Text style={s.primaryBtnText}>{t.migration_unlock_btn}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {receiverAwaitingFinalize && (
          <View style={[s.finalizeOverlay, { backgroundColor: 'rgba(0,0,0,0.72)' }]}>
            <View style={[s.finalizeCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
              <Text style={[s.sectionTitle, { color: c.text }]}>{t.migration_finalize_title}</Text>
              <Text style={[s.methodDesc, { color: c.textMuted }]}>
                {t.migration_finalize_body}
              </Text>
              {incompleteMigrationPending ? (
                <Text style={{ color: c.warning, fontSize: 12, marginBottom: 10 }}>
                  {t.migration_staged_locked_hint}
                </Text>
              ) : null}
              {migrationError ? (
                <Text style={{ color: c.danger, fontSize: 13, marginBottom: 10 }}>
                  {migrationError}
                </Text>
              ) : null}
              <TouchableOpacity
                style={[
                  s.primaryBtn,
                  s.finalizeBtn,
                  {
                    backgroundColor: c.accent,
                    opacity: migrationPhase === 'finalizing' ? 0.75 : 1,
                  },
                ]}
                disabled={migrationPhase === 'finalizing'}
                onPress={() => finalizeMigration()}
              >
                {migrationPhase === 'finalizing' ? (
                  <>
                    <ActivityIndicator color="#fff" style={{ marginRight: 10 }} />
                    <Text style={s.primaryBtnText}>{t.migration_finalize_working}</Text>
                  </>
                ) : (
                  <Text style={s.primaryBtnText}>{t.migration_finalize_btn}</Text>
                )}
              </TouchableOpacity>
              {migrationError && migrationPhase !== 'finalizing' ? (
                <TouchableOpacity
                  style={[s.secBtn, { borderColor: c.danger, marginTop: 12 }]}
                  onPress={abortReceivedMigration}
                >
                  <Text style={[s.secBtnText, { color: c.danger, textAlign: 'center' }]}>
                    {t.migration_abort_receive_btn}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}

        {mdnsPairDevice && (
          <View style={[s.pairOverlay, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
            <View style={[s.pairCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
              <Text style={[s.sectionTitle, { color: c.text }]}>
                {t.migration_mdns_pairing_modal_title}
              </Text>
              <Text style={[s.methodDesc, { color: c.textMuted }]}>
                {t.migration_mdns_pairing_modal_desc}
              </Text>
              {mdnsPairDevice.fingerprint ? (
                <Text style={[s.methodDesc, { color: c.textMuted, fontFamily: 'monospace' }]}>
                  {t.migration_fingerprint_receiver}: {mdnsPairDevice.fingerprint}
                </Text>
              ) : null}
              <Text style={[s.fieldLabel, { color: c.textMuted, marginTop: 8 }]}>
                {t.migration_manual_pairing_label}
              </Text>
              <TextInput
                style={[s.fieldInput, { color: c.text, borderColor: c.border }]}
                value={mdnsPairingInput}
                onChangeText={(text) => setMdnsPairingInput(formatPairingInput(text))}
                placeholder={t.migration_manual_pairing_placeholder}
                placeholderTextColor={c.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: c.accent, marginTop: 12 }]}
                onPress={() => {
                  const code = normalizePairingCode(mdnsPairingInput);
                  if (!code) return;
                  const device = mdnsPairDevice;
                  setMdnsPairDevice(null);
                  setMdnsPairingInput('');
                  selectDeviceAndMigrate(device, code);
                }}
              >
                <Text style={s.primaryBtnText}>{t.migration_mdns_pairing_confirm}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.secondaryBtn, { borderColor: c.border }]}
                onPress={() => {
                  setMdnsPairDevice(null);
                  setSendMode('qr');
                }}
              >
                <Text style={{ color: c.accent, fontWeight: '600' }}>
                  {t.migration_mdns_use_qr}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.secondaryBtn, { borderColor: c.border }]}
                onPress={() => {
                  setMdnsPairDevice(null);
                  setSendMode('manual');
                }}
              >
                <Text style={{ color: c.text, fontWeight: '600' }}>
                  {t.migration_mdns_use_manual}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setMdnsPairDevice(null)}
                style={{ marginTop: 8, alignItems: 'center' }}
              >
                <Text style={{ color: c.textMuted }}>{t.cancel_button}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {/* RN Modal is a separate native window; root NotificationOverlay sits under it. */}
        <NotificationOverlay />
      </View>
    </Modal>
  );
};
