/**
 * @fileoverview Main authentication and session creation screen.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StatusBar,
  ActivityIndicator,
  StyleSheet,
  type DimensionValue,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCoreState } from '../context/CoreStateContext';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useDatabase } from '../context/DatabaseContext';
import { useMigration } from '../context/MigrationContext';
import { useShakeAnimation } from '../hooks/useShakeAnimation';
import { globalStyles as styles } from '../styles/globalStyles';
import { BrandLogo } from '../components/common';
import { CreateSessionLegalGates } from '../components/login/CreateSessionLegalGates';
import { HelpInfoButton, HelpProcedureModal } from '../components/help';
import { LegalDocumentModal } from '../components/settings/LegalDocumentModal';
import type { LegalDocumentId } from '../constants/legalContent';
import type { ProcedureId } from '../constants/procedures';
import {
  masterPasswordStrengthLabel,
  MIN_MASTER_PASSWORD_LENGTH,
} from '../utils/masterPasswordPolicy';
import { peekUnlockBundle } from '../services/biometrics';
import { getUnlockBlockRemainingMs } from '../services/unlockThrottle';

/**
 * Renders the Login view. Handles both initial session creation and
 * subsequent unlocks (password or biometrics).
 *
 * @returns {JSX.Element} The Login Screen component.
 */
export const LoginScreen = () => {
  const {
    hasSession,
    sessionGate,
    retrySessionCheck,
    masterPassword,
    setMasterPassword,
    repeatPassword,
    setRepeatPassword,
    validationError,
    biometricsAvailable,
    authBusy,
  } = useCoreState();
  const { handleCreateSession, handleOpenSession, handleBiometricLogin } = useAuth();
  const { t, c, isDark } = useSettings();
  const { handleImportLocalBackup } = useDatabase();
  const { openMigrationReceive, nativeMigrationAvailable } = useMigration();

  const [lockRemainingSec, setLockRemainingSec] = useState(0);
  const [bioUnlockReady, setBioUnlockReady] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [legalGateError, setLegalGateError] = useState('');
  const [legalGateAttention, setLegalGateAttention] = useState(0);
  const [legalDocumentId, setLegalDocumentId] = useState<LegalDocumentId | null>(null);
  const [helpProcedureId, setHelpProcedureId] = useState<ProcedureId | null>(null);
  const { trigger: triggerShake, animatedStyle: shakeStyle } = useShakeAnimation();
  const prevValidationError = useRef<string | null | undefined>(undefined);
  /** Fires OS biometrics once when unlock screen is ready (manual icon remains for retry). */
  const autoBioAttemptedRef = useRef(false);

  useEffect(() => {
    if (validationError && validationError !== prevValidationError.current) {
      triggerShake();
    }
    prevValidationError.current = validationError;
  }, [validationError, triggerShake]);

  useEffect(() => {
    let active = true;
    const refreshBio = async () => {
      if (!hasSession || biometricsAvailable !== true) {
        if (active) {
          setBioUnlockReady(false);
          autoBioAttemptedRef.current = false;
        }
        return;
      }
      const bundle = await peekUnlockBundle();
      if (active) setBioUnlockReady(!!bundle);
    };
    void refreshBio();
    return () => {
      active = false;
    };
  }, [hasSession, biometricsAvailable, authBusy, validationError]);

  // Poll the persisted unlock lockout (memory-cached after first read) so the
  // countdown stays live and the button re-enables when the block expires.
  useEffect(() => {
    if (!hasSession) return;
    let active = true;
    const tick = async () => {
      const ms = await getUnlockBlockRemainingMs();
      if (active) setLockRemainingSec(Math.ceil(ms / 1000));
    };
    void tick();
    const interval = setInterval(() => void tick(), 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [hasSession, validationError]);

  const isLocked = lockRemainingSec > 0;

  const requireFirstUseGates = (): boolean => {
    if (acceptedLegal) {
      setLegalGateError('');
      return true;
    }
    Keyboard.dismiss();
    setLegalGateError(t.login_legal_required);
    setLegalGateAttention((n) => n + 1);
    return false;
  };

  // Auto-prompt biometrics once when the unlock form is ready (logout / autologout).
  useEffect(() => {
    if (!hasSession || !bioUnlockReady || authBusy || isLocked) return;
    if (autoBioAttemptedRef.current) return;
    autoBioAttemptedRef.current = true;
    void handleBiometricLogin();
  }, [hasSession, bioUnlockReady, authBusy, isLocked, handleBiometricLogin]);

  const canSubmitCreate =
    masterPassword.length >= MIN_MASTER_PASSWORD_LENGTH &&
    repeatPassword.length >= MIN_MASTER_PASSWORD_LENGTH &&
    acceptedLegal;

  const strength = useMemo(
    () => masterPasswordStrengthLabel(masterPassword, t),
    [masterPassword, t]
  );
  const strengthBarWidth = `${Math.min(100, Math.max(8, (strength.score + 1) * 20))}%`;
  const strengthColor =
    strength.score <= 1 ? c.danger : strength.score === 2 ? c.warning : c.success;

  return (
    <SafeAreaView
      style={[styles.rootWrap, { backgroundColor: c.bg }]}
      edges={['top', 'right', 'bottom', 'left']}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardContainer}
      >
        <ScrollView contentContainerStyle={styles.scrollInnerCenter}>
          <View style={styles.brandingHeaderContainer}>
            <BrandLogo width={96} />
            <Text style={[styles.brandingDescSubtitle, { color: c.textMuted }]}>{t.app_desc}</Text>
          </View>

          {/* Transparency banner — keys stay on this device. */}
          <View
            style={[
              styles.loginTransparencyCard,
              {
                borderColor: c.border,
                backgroundColor: isDark ? 'rgba(135,203,40,0.06)' : 'rgba(135,203,40,0.08)',
              },
            ]}
            accessible
            accessibilityRole="summary"
            accessibilityLabel={`${t.login_transparency_title}. ${t.login_transparency_body}`}
          >
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={c.accent}
              style={{ marginTop: 1 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 13, marginBottom: 2 }}>
                {t.login_transparency_title}
              </Text>
              <Text style={{ color: c.textMuted, fontSize: 12, lineHeight: 17 }}>
                {t.login_transparency_body}
              </Text>
            </View>
          </View>

          {sessionGate === 'pending' ? (
            <View
              style={{ alignItems: 'center', paddingVertical: 28 }}
              accessibilityRole="progressbar"
              accessibilityLabel={t.session_check_pending}
            >
              <ActivityIndicator size="large" color={c.accent} />
            </View>
          ) : sessionGate === 'error' ? (
            <View
              style={[
                styles.boxCardContainer,
                { backgroundColor: c.cardBg, borderColor: c.border },
              ]}
            >
              <Text style={[styles.formHeaderTitle, { color: c.text, marginBottom: 12 }]}>
                {t.session_check_error}
              </Text>
              <TouchableOpacity
                style={[styles.primaryActActionButton, { backgroundColor: c.accent, marginTop: 8 }]}
                onPress={() => void retrySessionCheck()}
                accessibilityRole="button"
                accessibilityLabel={t.session_check_retry}
              >
                <Text style={styles.primaryActActionText}>{t.session_check_retry}</Text>
              </TouchableOpacity>
            </View>
          ) : !hasSession ? (
            // FORM: SESSION GENERATION CREATOR
            <Animated.View
              style={[
                styles.boxCardContainer,
                shakeStyle,
                { backgroundColor: c.cardBg, borderColor: c.border },
              ]}
            >
              <Text style={[styles.formHeaderTitle, { color: c.text, marginBottom: 16 }]}>
                {t.create_session_title}
              </Text>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: 2,
                }}
              >
                <Text
                  style={{
                    color: c.text,
                    fontWeight: '600',
                    fontSize: 13,
                    flex: 1,
                  }}
                >
                  {t.enter_pass} {t.password_6chars}
                </Text>
                <HelpInfoButton
                  onPress={() => setHelpProcedureId('master_password')}
                  accessibilityLabel={t.master_password_help_a11y}
                />
              </View>

              <TextInput
                style={[
                  styles.baseInputStyle,
                  {
                    borderColor: c.border,
                    color: c.text,
                    backgroundColor: isDark ? '#1F1F24' : '#F3F4F6',
                    marginTop: 4,
                    marginBottom: 8,
                  },
                ]}
                placeholder={t.enter_pass}
                placeholderTextColor={c.textMuted}
                secureTextEntry
                value={masterPassword}
                onChangeText={setMasterPassword}
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel={`${t.enter_pass} ${t.password_6chars}`}
              />

              {masterPassword.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <View
                    style={{
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: c.border,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        height: '100%',
                        width: strengthBarWidth as DimensionValue,
                        backgroundColor: strengthColor,
                      }}
                    />
                  </View>
                  <Text style={{ fontSize: 11, color: strengthColor, marginTop: 4 }}>
                    {strength.label}
                  </Text>
                </View>
              )}

              <TextInput
                style={[
                  styles.baseInputStyle,
                  {
                    borderColor: c.border,
                    color: c.text,
                    backgroundColor: isDark ? '#1F1F24' : '#F3F4F6',
                  },
                ]}
                placeholder={t.repeat_pass}
                placeholderTextColor={c.textMuted}
                secureTextEntry
                value={repeatPassword}
                onChangeText={setRepeatPassword}
                autoCorrect={false}
                autoCapitalize="none"
              />

              {validationError ? (
                <Text style={[styles.validationInlineError, { color: c.danger }]}>
                  {validationError}
                </Text>
              ) : null}

              {/* ALERT COMPONENT: Disclaimer Warning Block */}
              <View
                style={[
                  styles.warningBoxBorderAlert,
                  {
                    borderColor: c.danger,
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    marginTop: 8,
                    marginBottom: 10,
                  },
                ]}
              >
                <View style={styles.inlineWarningHeaderRow}>
                  <Ionicons name="warning" size={18} color={c.danger} />
                  <Text style={[styles.warningHeaderTitleSpan, { color: c.danger }]}>
                    {t.disclaimer_importance}
                  </Text>
                </View>
                <Text style={[styles.warningBodyDescription, { color: c.danger }]}>
                  {t.disclaimer_body}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryActActionButton,
                  {
                    backgroundColor: c.accent,
                    opacity: authBusy ? 0.7 : canSubmitCreate ? 1 : 0.4,
                    marginTop: 12,
                  },
                ]}
                onPress={() => {
                  if (!requireFirstUseGates()) return;
                  void handleCreateSession();
                }}
                disabled={authBusy || !canSubmitCreate}
                accessibilityRole="button"
                accessibilityLabel={t.create_session_btn}
                accessibilityState={{ disabled: authBusy || !canSubmitCreate }}
              >
                {authBusy ? (
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryActActionText}>{t.auth_busy_create}</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryActActionText}>{t.create_session_btn}</Text>
                )}
              </TouchableOpacity>

              {authBusy ? (
                <Text
                  style={[
                    styles.formDescriptionNormal,
                    { color: c.textMuted, textAlign: 'center', marginTop: 10, marginBottom: 0 },
                  ]}
                >
                  {t.auth_busy_hint}
                </Text>
              ) : null}

              <CreateSessionLegalGates
                acceptedLegal={acceptedLegal}
                onAcceptedLegalChange={(value) => {
                  setAcceptedLegal(value);
                  if (value) setLegalGateError('');
                }}
                error={legalGateError}
                attentionKey={legalGateAttention}
                onOpenDocument={setLegalDocumentId}
              />

              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)',
                  marginTop: 14,
                  marginBottom: 4,
                }}
              />

              <TouchableOpacity
                style={[
                  styles.secGhostOutlineButton,
                  {
                    borderColor: c.border,
                    marginTop: 12,
                    opacity: nativeMigrationAvailable ? 1 : 0.5,
                  },
                ]}
                onPress={() => {
                  if (!requireFirstUseGates()) return;
                  openMigrationReceive();
                }}
                disabled={authBusy || !nativeMigrationAvailable}
                accessibilityRole="button"
                accessibilityLabel={t.migration_receive_btn}
              >
                <Ionicons
                  name="phone-portrait-outline"
                  size={18}
                  color={c.text}
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.secGhostOutlineText, { color: c.text }]}>
                  {t.migration_receive_btn}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secGhostOutlineButton, { borderColor: c.border, marginTop: 12 }]}
                onPress={() => {
                  if (!requireFirstUseGates()) return;
                  void handleImportLocalBackup();
                }}
                disabled={authBusy}
                accessibilityRole="button"
                accessibilityLabel={t.import_from_login_btn}
              >
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color={c.text}
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.secGhostOutlineText, { color: c.text }]}>
                  {t.import_from_login_btn}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            // FORM: Standard Login Verify
            <Animated.View
              style={[
                styles.boxCardContainer,
                shakeStyle,
                { backgroundColor: c.cardBg, borderColor: c.border },
              ]}
            >
              <Text style={[styles.formHeaderTitle, { color: c.text, textAlign: 'center' }]}>
                {t.login_required}
              </Text>

              <TextInput
                style={[
                  styles.baseInputStyle,
                  {
                    borderColor: c.border,
                    color: c.text,
                    backgroundColor: isDark ? '#1F1F24' : '#F3F4F6',
                    marginTop: 14,
                  },
                ]}
                placeholder={t.login_placeholder}
                placeholderTextColor={c.textMuted}
                secureTextEntry
                value={masterPassword}
                onChangeText={setMasterPassword}
                autoCorrect={false}
                autoCapitalize="none"
              />

              {isLocked ? (
                <Text style={[styles.validationInlineError, { color: c.danger }]}>
                  {t.login_locked_countdown.replace('{n}', String(lockRemainingSec))}
                </Text>
              ) : validationError ? (
                <Text style={[styles.validationInlineError, { color: c.danger }]}>
                  {validationError}
                </Text>
              ) : null}

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: 18,
                  gap: 10,
                }}
              >
                <TouchableOpacity
                  style={[
                    styles.primaryActActionButton,
                    {
                      flex: 1,
                      marginTop: 0,
                      backgroundColor: c.accent,
                      opacity: authBusy || isLocked ? 0.7 : 1,
                    },
                  ]}
                  onPress={() => handleOpenSession(masterPassword)}
                  disabled={authBusy || isLocked}
                  accessibilityRole="button"
                  accessibilityLabel={t.login_btn}
                >
                  {authBusy ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={styles.primaryActActionText}>{t.auth_busy_unlock}</Text>
                    </View>
                  ) : (
                    <Text style={styles.primaryActActionText}>{t.login_btn}</Text>
                  )}
                </TouchableOpacity>

                {biometricsAvailable === true && bioUnlockReady ? (
                  <TouchableOpacity
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: c.accent,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: authBusy || isLocked ? 0.45 : 1,
                    }}
                    onPress={() => void handleBiometricLogin()}
                    disabled={authBusy || isLocked}
                    accessibilityRole="button"
                    accessibilityLabel={t.login_bio_btn}
                  >
                    <Ionicons name="finger-print" size={22} color={c.accent} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {authBusy ? (
                <Text
                  style={[
                    styles.formDescriptionNormal,
                    { color: c.textMuted, textAlign: 'center', marginTop: 10 },
                  ]}
                >
                  {t.auth_busy_hint}
                </Text>
              ) : null}
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <HelpProcedureModal procedureId={helpProcedureId} onClose={() => setHelpProcedureId(null)} />
      <LegalDocumentModal
        visible={legalDocumentId !== null}
        documentId={legalDocumentId}
        onClose={() => setLegalDocumentId(null)}
      />
    </SafeAreaView>
  );
};
