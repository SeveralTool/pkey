/**
 * @fileoverview Expanded editor body for a vault card (mounted only when open).
 */
import React, { useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PasswordCard, AppSettings } from '../../types';
import { copySecret } from '../../services/secureClipboard';
import { useCardAnalysis, type DuplicateIndex } from '../../hooks/useCardAnalysis';
import { useDebounce } from '../../hooks/useDebounce';
import { usePasswordGeneration } from '../../hooks/usePasswordGeneration';
import { useOpenCardLink } from '../../hooks/useOpenCardLink';
import { useIconDetection } from '../../hooks/useIconDetection';
import { shouldKeepStoredIcon } from '../../services/iconDetection';
import { notifications } from '../../notifications/notificationRef';
import { useDatabase } from '../../context/DatabaseContext';
import { globalStyles as styles, spacing } from '../../styles/globalStyles';
import {
  CARD_NOTES_MAX,
  CARD_TITLE_MAX,
  CARD_USERNAME_MAX,
  applyCardTypeChange,
  clampField,
} from '@pkey/core';
import { OtpCountdown } from './OtpCountdown';
import { OtpQrScannerPanel } from './OtpQrScannerPanel';
import { processOtpInput } from './otpInput';
import { suppressAutoLogout, QR_SCANNER_GRACE_MS } from '../../utils/autoLogoutGuard';
import { CardTagsEditor } from './CardTagsEditor';
import { getCardCopyPayload, buildCopySuccessMessage } from './swipeActions';
import { HibpStatusBadge } from './HibpStatusBadge';

export type CardExpandedBodyProps = {
  item: PasswordCard;
  isDark: boolean;
  c: Record<string, string>;
  t: Record<string, string>;
  appSettings: AppSettings;
  usernameIndex: DuplicateIndex;
  passwordIndex: DuplicateIndex;
  autoCollapse: boolean;
  onCollapseAfterSave: () => void;
  onUpdateCardValue: (cardId: string, field: keyof PasswordCard, value: unknown) => void;
  onUpdatePasswordListItem: (cardId: string, index: number, value: string) => void;
  onAddPasswordListItem: (cardId: string) => void;
  onSaveCard: (cardId: string) => void;
  onSaveCardWithFields: (cardId: string, fields?: Partial<PasswordCard>) => void;
  onDeleteCard: (cardId: string) => void;
  onBiometricCheck: (onSuccess: () => void, prompt: string) => void;
  onQrScannerActiveChange?: (active: boolean) => void;
  onReady: () => void;
  hibpEnabled: boolean;
  hibpChecking: boolean;
  onCheckHibp: (cardId: string) => void;
};

export const CardExpandedBody = React.memo(function CardExpandedBody({
  item,
  isDark,
  c,
  t,
  appSettings,
  usernameIndex,
  passwordIndex,
  autoCollapse,
  onCollapseAfterSave,
  onUpdateCardValue,
  onUpdatePasswordListItem,
  onAddPasswordListItem,
  onSaveCard,
  onSaveCardWithFields,
  onDeleteCard,
  onBiometricCheck,
  onQrScannerActiveChange,
  onReady,
  hibpEnabled,
  hibpChecking,
  onCheckHibp,
}: CardExpandedBodyProps) {
  const { isCardTypeLocked } = useDatabase();
  const { detect: triggerIconDetection } = useIconDetection(item.title, item.link, item.icon);

  const [showOtpSecret, setShowOtpSecret] = useState(false);
  const [revealCopyPassword, setRevealCopyPassword] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [textareaHeights, setTextareaHeights] = useState<{ [key: string]: number }>({});
  const updateTextareaHeight = (id: string, height: number) => {
    setTextareaHeights((prev) => ({ ...prev, [id]: Math.max(70, height) }));
  };

  const analysisOptions = useMemo(
    () => ({ usernameIndex, passwordIndex }),
    [usernameIndex, passwordIndex]
  );
  const { isUsernameRepeated, isPasswordRepeated, getPasswordStrength } = useCardAnalysis(
    analysisOptions,
    t,
    c
  );
  const { generateRandomEntropyKey, canGeneratePassword } = usePasswordGeneration(appSettings);
  const { handleOpenCardLink, isOpeningLink } = useOpenCardLink({
    openLinksInAppBrowser: !!appSettings.openLinksInAppBrowser,
    t,
  });
  useLayoutEffect(() => {
    onReady();
  }, [onReady]);

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const handleSaveWithDetection = async () => {
    try {
      setSaveState('saving');
      const newDetectedIcon = await triggerIconDetection(item.title, item.link);
      const keepUserIcon = shouldKeepStoredIcon(item.icon, item.link);
      if (
        !keepUserIcon &&
        newDetectedIcon &&
        (newDetectedIcon.type !== item.icon.type ||
          (newDetectedIcon as { value?: string }).value !==
            (item.icon as { value?: string }).value ||
          (newDetectedIcon as { uri?: string }).uri !== (item.icon as { uri?: string }).uri)
      ) {
        onSaveCardWithFields(item.id, { icon: newDetectedIcon });
      } else {
        onSaveCard(item.id);
      }
      setSaveState('saved');
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (!autoCollapse) onCollapseAfterSave();
    } catch {
      onSaveCard(item.id);
      setSaveState('saved');
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (!autoCollapse) onCollapseAfterSave();
    } finally {
      setSaveState('idle');
    }
  };

  const applyOtpInputResult = (result: ReturnType<typeof processOtpInput>) => {
    if (result.kind === 'invalid_uri') {
      notifications.toast({
        title: t.otp_invalid_uri_title,
        message: t.otp_invalid_uri_desc,
        variant: 'error',
        duration: 5000,
      });
      return;
    }
    if (result.kind === 'invalid_secret') {
      notifications.toast({
        title: t.otp_invalid_secret_title,
        message: t.otp_invalid_secret_desc,
        variant: 'error',
        duration: 5000,
      });
      return;
    }
    onUpdateCardValue(item.id, 'otpSecret', result.secret);
    if (result.kind === 'uri') {
      if (result.algorithm) onUpdateCardValue(item.id, 'otpAlgorithm', result.algorithm);
      if (result.digits) onUpdateCardValue(item.id, 'otpDigits', result.digits);
      if (result.period) onUpdateCardValue(item.id, 'otpPeriod', result.period);
    }
  };

  const handleOtpInput = (text: string) => {
    applyOtpInputResult(processOtpInput(text));
  };

  const handleOpenOtpQrScanner = () => {
    // Reduced from 120s → 60s after audit finding M3 (QR overlay left the
    // vault unlocked for too long when the user wandered off).
    suppressAutoLogout(QR_SCANNER_GRACE_MS);
    onQrScannerActiveChange?.(true);
    setQrOpen(true);
  };

  const handleCloseOtpQrScanner = () => {
    setQrOpen(false);
    onQrScannerActiveChange?.(false);
  };

  const cardTags = item.tags ?? [];
  const inputBg = isDark ? '#1F1F24' : '#F3F4F6';
  const primaryPassword = item.passwordList[0] || '';
  const debouncedPassword = useDebounce(primaryPassword, 300);
  const strength = useMemo(
    () => (item.type === 'PASSWORD' ? getPasswordStrength(debouncedPassword) : null),
    [item.type, debouncedPassword, getPasswordStrength]
  );
  const hasRepLogin = isUsernameRepeated(item.username, item.id);
  const hasRepPass = isPasswordRepeated(primaryPassword, item.id);

  const handleSecureCopyText = (val: string, label: string, onCopied?: () => void) => {
    const trimmed = val.trim();
    if (!trimmed) {
      notifications.toast({
        title: t.notif_copy_empty_title,
        message: t.notif_copy_empty_message,
        variant: 'warning',
        duration: 4000,
      });
      return;
    }
    onBiometricCheck(() => {
      void copySecret(trimmed, {
        onCopied: () => {
          notifications.toast({
            title: t.notif_copy_success_title,
            message: buildCopySuccessMessage(t, label, item.title),
            variant: 'success',
            duration: 5000,
          });
          onCopied?.();
        },
        onCleared: () => {
          notifications.toast({
            title: t.notif_copy_cleared,
            message: t.notif_copy_cleared_message,
            variant: 'info',
            duration: 2000,
          });
        },
      });
    }, t.require_auth_clipboard);
  };

  const handleCopyCard = () => {
    const label =
      item.type === 'NOTE'
        ? t.copy_label_note
        : item.type === 'SECRET_PHRASE'
          ? t.copy_label_seed
          : t.copy_label_password;
    handleSecureCopyText(getCardCopyPayload(item), label, () => {
      if (appSettings.revealPasswordOnCopy && item.type === 'PASSWORD') {
        setRevealCopyPassword(true);
      }
    });
  };

  const handleAutoGenPasswordInCard = (cardId: string) => {
    if (!canGeneratePassword) {
      notifications.toast({
        title: t.gen_not_configured_title,
        message: t.gen_not_configured_desc,
        variant: 'warning',
        duration: 6000,
      });
      return;
    }
    notifications.alert({
      title: t.generator_title,
      message: t.generate_replace_alert,
      variant: 'info',
      actions: [
        { text: t.cancel_button, style: 'cancel' },
        {
          text: t.generate_and_replace,
          onPress: () => {
            const securePass = generateRandomEntropyKey();
            if (!securePass) {
              notifications.toast({
                title: t.gen_not_configured_title,
                message: t.gen_not_configured_desc,
                variant: 'warning',
                duration: 6000,
              });
              return;
            }
            onUpdatePasswordListItem(cardId, 0, securePass);
          },
        },
      ],
    });
  };

  const handleTypeChangeAttempt = (newType: 'PASSWORD' | 'SECRET_PHRASE' | 'NOTE') => {
    if (newType !== item.type && isCardTypeLocked(item.id)) {
      notifications.toast({
        title: t.card_type_change_blocked_title,
        message: t.card_type_change_blocked_desc,
        variant: 'warning',
      });
      return;
    }
    const applied = applyCardTypeChange(item, newType);
    if (!applied) {
      notifications.toast({
        title: t.card_type_change_blocked_title,
        message: t.card_type_change_blocked_desc,
        variant: 'warning',
      });
      return;
    }
    if (newType === item.type) return;
    onUpdateCardValue(item.id, 'type', applied.type);
    if (applied.type === 'PASSWORD') {
      const currentPassword = applied.passwordList[0] || '';
      onUpdatePasswordListItem(item.id, 0, currentPassword);
      if (item.passwordList.length > 1) {
        onUpdateCardValue(item.id, 'passwordList', [currentPassword]);
      }
    } else {
      onUpdateCardValue(item.id, 'passwordList', applied.passwordList);
    }
    if (applied.type === 'NOTE' || applied.otpSecret !== item.otpSecret) {
      onUpdateCardValue(item.id, 'otpSecret', applied.otpSecret);
    }
  };

  const typeChangeLocked = isCardTypeLocked(item.id);

  return (
    <View style={[styles.expandedBodyPanelFrame, { borderTopColor: c.border }]}>
      {/* Type toggle selection */}
      <View style={styles.inputFieldBlockGroup}>
        <Text style={[styles.smallLabelUppercase, { color: c.textMuted }]}>
          {t.card_type_label}
        </Text>
        <View style={styles.horizontalWrapFlexRowPicker}>
          <TouchableOpacity
            style={[
              styles.pickerCellTabOption,
              {
                borderColor: item.type === 'PASSWORD' ? c.accent : c.border,
                backgroundColor:
                  item.type === 'PASSWORD' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                opacity: typeChangeLocked && item.type !== 'PASSWORD' ? 0.5 : 1,
              },
            ]}
            onPress={() => handleTypeChangeAttempt('PASSWORD')}
            disabled={typeChangeLocked && item.type !== 'PASSWORD'}
            accessibilityRole="button"
            accessibilityState={{
              selected: item.type === 'PASSWORD',
              disabled: typeChangeLocked && item.type !== 'PASSWORD',
            }}
            accessibilityLabel={t.card_type_pass}
          >
            <Text
              style={[
                styles.pickerCellText,
                {
                  color: item.type === 'PASSWORD' ? c.accent : c.textMuted,
                  textDecorationLine:
                    typeChangeLocked && item.type !== 'PASSWORD' ? 'line-through' : 'none',
                },
              ]}
            >
              {t.card_type_pass}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.pickerCellTabOption,
              {
                borderColor: item.type === 'SECRET_PHRASE' ? c.accent : c.border,
                backgroundColor:
                  item.type === 'SECRET_PHRASE' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                opacity: typeChangeLocked && item.type !== 'SECRET_PHRASE' ? 0.5 : 1,
              },
            ]}
            onPress={() => handleTypeChangeAttempt('SECRET_PHRASE')}
            disabled={typeChangeLocked && item.type !== 'SECRET_PHRASE'}
            accessibilityRole="button"
            accessibilityState={{
              selected: item.type === 'SECRET_PHRASE',
              disabled: typeChangeLocked && item.type !== 'SECRET_PHRASE',
            }}
            accessibilityLabel={t.card_type_phrase}
          >
            <Text
              style={[
                styles.pickerCellText,
                {
                  color: item.type === 'SECRET_PHRASE' ? c.accent : c.textMuted,
                  textDecorationLine:
                    typeChangeLocked && item.type !== 'SECRET_PHRASE' ? 'line-through' : 'none',
                },
              ]}
            >
              {t.card_type_phrase}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.pickerCellTabOption,
              {
                borderColor: item.type === 'NOTE' ? c.accent : c.border,
                backgroundColor: item.type === 'NOTE' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                opacity: typeChangeLocked && item.type !== 'NOTE' ? 0.5 : 1,
              },
            ]}
            onPress={() => handleTypeChangeAttempt('NOTE')}
            disabled={typeChangeLocked && item.type !== 'NOTE'}
            accessibilityRole="button"
            accessibilityState={{
              selected: item.type === 'NOTE',
              disabled: typeChangeLocked && item.type !== 'NOTE',
            }}
            accessibilityLabel={t.card_type_note}
          >
            <Text
              style={[
                styles.pickerCellText,
                {
                  color: item.type === 'NOTE' ? c.accent : c.textMuted,
                  textDecorationLine:
                    typeChangeLocked && item.type !== 'NOTE' ? 'line-through' : 'none',
                },
              ]}
            >
              {t.card_type_note}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Card Name Editable title */}
      <View style={styles.inputFieldBlockGroup}>
        <Text style={[styles.smallLabelUppercase, { color: c.textMuted }]}>
          {t.card_title_label}
        </Text>
        <TextInput
          style={[
            styles.cardFieldInputStyle,
            {
              borderColor: c.border,
              color: c.text,
              backgroundColor: isDark ? '#1F1F24' : '#F3F4F6',
              minHeight: 44,
              textAlignVertical: 'top',
            },
          ]}
          value={item.title}
          onChangeText={(text) =>
            onUpdateCardValue(item.id, 'title', clampField(text, CARD_TITLE_MAX).value)
          }
          placeholder={t.example_instagram}
          placeholderTextColor={c.textMuted}
          multiline
          scrollEnabled
          maxLength={CARD_TITLE_MAX}
        />
      </View>

      {/* Core Username Login value */}
      <View style={styles.inputFieldBlockGroup}>
        <Text style={[styles.smallLabelUppercase, { color: c.textMuted }]}>
          {t.card_user_label}
        </Text>
        <TextInput
          style={[
            styles.cardFieldInputStyle,
            {
              borderColor: c.border,
              color: c.text,
              backgroundColor: isDark ? '#1F1F24' : '#F3F4F6',
            },
          ]}
          value={item.username}
          onChangeText={(text) =>
            onUpdateCardValue(item.id, 'username', clampField(text, CARD_USERNAME_MAX).value)
          }
          placeholder={t.example_email}
          placeholderTextColor={c.textMuted}
          autoCapitalize="none"
          maxLength={CARD_USERNAME_MAX}
        />
        {hasRepLogin && (
          <View style={styles.tagLineRowFlex}>
            <View
              style={[
                styles.warningInLineTagFrame,
                { borderColor: c.warning, backgroundColor: 'rgba(245, 158, 11, 0.08)' },
              ]}
            >
              <Ionicons name="alert-circle" size={12} color={c.warning} />
              <Text style={[styles.warningInLineText, { color: c.warning }]}>
                {t.tag_duplicated}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Standard KEY inputs / Secret Phrase / Note */}
      {item.type === 'PASSWORD' ? (
        <View style={styles.inputFieldBlockGroup}>
          <Text style={[styles.smallLabelUppercase, { color: c.textMuted }]}>
            {t.card_pass_label}
          </Text>
          <View style={styles.relativeInputGroupRowContainer}>
            <TextInput
              style={[
                styles.cardFieldInputStyle,
                {
                  flex: 1,
                  paddingRight: 50,
                  borderColor: c.border,
                  color: c.text,
                  backgroundColor: isDark ? '#1F1F24' : '#F3F4F6',
                },
              ]}
              value={item.passwordList[0] || ''}
              onChangeText={(text) => onUpdatePasswordListItem(item.id, 0, text)}
              secureTextEntry={!revealCopyPassword}
              placeholder={t.placeholder_password_mask}
              placeholderTextColor={c.textMuted}
            />
          </View>

          {/* Verification strength metrics & reuse descriptors underneath password input */}
          {(strength || hibpEnabled) && (
            <View style={styles.tagLineRowFlex}>
              {strength && (
                <View
                  style={[
                    styles.warningInLineTagFrame,
                    {
                      borderColor: strength.color,
                      backgroundColor: 'rgba(59, 130, 246, 0.05)',
                    },
                  ]}
                >
                  <Ionicons name="shield" size={10} color={strength.color} />
                  <Text style={[styles.warningInLineText, { color: strength.color }]}>
                    {strength.label}
                  </Text>
                </View>
              )}

              {hasRepPass && (
                <View
                  style={[
                    styles.warningInLineTagFrame,
                    { borderColor: c.danger, backgroundColor: 'rgba(239, 68, 68, 0.05)' },
                  ]}
                >
                  <Ionicons name="alert-circle" size={10} color={c.danger} />
                  <Text style={[styles.warningInLineText, { color: c.danger }]}>
                    {t.tag_duplicated}
                  </Text>
                </View>
              )}

              {/* Have I Been Pwned status: one more tag in the same row */}
              {hibpEnabled && <HibpStatusBadge card={item} c={c} t={t} enabled />}
            </View>
          )}

          {!hibpEnabled && (
            <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
              {t.hibp_disabled_hint}
            </Text>
          )}
        </View>
      ) : item.type === 'SECRET_PHRASE' ? (
        <View style={styles.inputFieldBlockGroup}>
          <Text style={[styles.smallLabelUppercase, { color: c.textMuted }]}>
            {t.card_phrase_inputs}
          </Text>
          {item.passwordList.map((word, wIndex) => (
            <View key={wIndex} style={styles.seedPhraseWordInputBlockRow}>
              <Text style={[styles.seedIndexerCountLabel, { color: c.textMuted }]}>
                #{wIndex + 1}
              </Text>
              <TextInput
                style={[
                  styles.cardFieldInputStyle,
                  {
                    flex: 1,
                    marginVertical: spacing.xs,
                    borderColor: c.border,
                    color: c.text,
                    backgroundColor: isDark ? '#1F1F24' : '#F3F4F6',
                  },
                ]}
                value={word}
                onChangeText={(text) => onUpdatePasswordListItem(item.id, wIndex, text)}
                placeholder={`${t.seed_phrase_placeholder} ${wIndex + 1}`}
                placeholderTextColor={c.textMuted}
                autoFocus={wIndex === item.passwordList.length - 1 && wIndex > 0}
              />
            </View>
          ))}
          <TouchableOpacity
            style={[
              styles.secGhostOutlineButton,
              {
                paddingVertical: spacing.sm,
                borderColor: c.border,
                marginTop: spacing.xs + 2,
              },
            ]}
            onPress={() => onAddPasswordListItem(item.id)}
            accessibilityRole="button"
            accessibilityLabel={t.add_phrase_word}
          >
            <Ionicons
              name="add-circle-outline"
              size={16}
              color={c.accent}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.secGhostOutlineText, { color: c.accent, fontSize: 13 }]}>
              {t.add_phrase_word}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {item.type === 'PASSWORD' && (
        <View style={styles.inputFieldBlockGroup}>
          <Text style={[styles.smallLabelUppercase, { color: c.textMuted }]}>
            {t.card_otp_secret_label}
          </Text>
          <View style={styles.relativeInputGroupRowContainer}>
            <TextInput
              style={[
                styles.cardFieldInputStyle,
                {
                  flex: 1,
                  paddingRight: 45,
                  borderColor: c.border,
                  color: c.text,
                  backgroundColor: isDark ? '#1F1F24' : '#F3F4F6',
                },
              ]}
              value={item.otpSecret ?? ''}
              onChangeText={handleOtpInput}
              secureTextEntry={!showOtpSecret}
              placeholder={t.card_otp_paste_uri}
              placeholderTextColor={c.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.absoluteInlineInputIconPositionButton}
              onPress={() => setShowOtpSecret((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showOtpSecret ? t.card_otp_hide : t.card_otp_show}
            >
              <Ionicons
                name={showOtpSecret ? 'eye-off-outline' : 'eye-outline'}
                size={16}
                color={c.textMuted}
              />
            </TouchableOpacity>
          </View>
          {item.otpSecret?.trim() ? (
            <OtpCountdown
              otpSecret={item.otpSecret}
              otpAlgorithm={item.otpAlgorithm}
              otpDigits={item.otpDigits}
              otpPeriod={item.otpPeriod}
              isDark={isDark}
              c={c}
              t={t}
              onBiometricCheck={onBiometricCheck}
              onCopyCode={(code) => handleSecureCopyText(code, t.copy_label_otp)}
            />
          ) : null}
          {qrOpen ? (
            <OtpQrScannerPanel
              cardBg={isDark ? '#1F1F24' : '#F3F4F6'}
              borderColor={c.border}
              text={c.text}
              textMuted={c.textMuted}
              labels={{
                title: t.card_otp_scan,
                cancel: t.cancel_button,
                hint: t.card_otp_paste_uri,
                permission: t.migration_camera_permission,
              }}
              onClose={handleCloseOtpQrScanner}
              onInvalidScan={() => {
                notifications.toast({
                  title: t.otp_invalid_uri_title,
                  message: t.otp_invalid_uri_desc,
                  variant: 'error',
                  duration: 5000,
                });
              }}
              onScan={(parsed) => {
                onUpdateCardValue(item.id, 'otpSecret', parsed.secret);
                if (parsed.algorithm) onUpdateCardValue(item.id, 'otpAlgorithm', parsed.algorithm);
                if (parsed.digits) onUpdateCardValue(item.id, 'otpDigits', parsed.digits);
                if (parsed.period) onUpdateCardValue(item.id, 'otpPeriod', parsed.period);
                const detail = [parsed.issuer, parsed.account].filter(Boolean).join(' · ');
                notifications.toast({
                  title: t.otp_scan_success_title,
                  message: detail || t.otp_scan_success_message,
                  variant: 'success',
                  duration: 3000,
                });
              }}
            />
          ) : (
            <TouchableOpacity
              style={[
                styles.secGhostOutlineButton,
                {
                  paddingVertical: spacing.sm,
                  borderColor: c.border,
                  marginTop: spacing.xs + 2,
                },
              ]}
              onPress={handleOpenOtpQrScanner}
              accessibilityLabel={t.card_otp_scan}
            >
              <Ionicons
                name="qr-code-outline"
                size={16}
                color={c.text}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.secGhostOutlineText, { color: c.text, fontSize: 13 }]}>
                {t.card_otp_scan}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Reference Web Destination direction */}
      <View style={styles.inputFieldBlockGroup}>
        <Text style={[styles.smallLabelUppercase, { color: c.textMuted }]}>
          {t.card_link_label}
        </Text>
        <View style={styles.relativeInputGroupRowContainer}>
          <TextInput
            style={[
              styles.cardFieldInputStyle,
              {
                flex: 1,
                borderColor: c.border,
                color: c.text,
                backgroundColor: isDark ? '#1F1F24' : '#F3F4F6',
              },
            ]}
            value={item.link}
            onChangeText={(text) => onUpdateCardValue(item.id, 'link', text)}
            placeholder={t.placeholder_link_example}
            placeholderTextColor={c.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
          />
          {item.link.trim() ? (
            <TouchableOpacity
              style={[
                styles.smallActionButtonRounded,
                {
                  backgroundColor: isDark ? '#2D2D37' : '#E5E7EB',
                  marginTop: spacing.xs,
                  marginLeft: spacing.sm,
                  marginRight: 0,
                },
              ]}
              onPress={() => handleOpenCardLink(item.link)}
              disabled={isOpeningLink}
              accessibilityRole="button"
              accessibilityLabel={t.go_to_link}
            >
              <Ionicons
                name="open-outline"
                size={16}
                color={isOpeningLink ? c.textMuted : c.accent}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Description field grows dynamically in height */}
      <View style={styles.inputFieldBlockGroup}>
        <Text style={[styles.smallLabelUppercase, { color: c.textMuted }]}>
          {t.card_notes_label}
        </Text>
        <TextInput
          multiline
          numberOfLines={3}
          style={[
            styles.cardFieldInputStyle,
            {
              borderColor: c.border,
              color: c.text,
              backgroundColor: isDark ? '#1F1F24' : '#F3F4F6',
              height: textareaHeights[item.id] || 70,
              textAlignVertical: 'top',
              paddingTop: spacing.sm,
            },
          ]}
          value={item.notes}
          onChangeText={(text) =>
            onUpdateCardValue(item.id, 'notes', clampField(text, CARD_NOTES_MAX).value)
          }
          maxLength={CARD_NOTES_MAX}
          onContentSizeChange={(e) =>
            updateTextareaHeight(item.id, e.nativeEvent.contentSize.height)
          }
          placeholder={t.placeholder_credentials}
          placeholderTextColor={c.textMuted}
        />
      </View>

      <CardTagsEditor
        tags={cardTags}
        onChangeTags={(tags) => onUpdateCardValue(item.id, 'tags', tags)}
        label={t.card_tags_label}
        placeholder={t.card_tags_placeholder}
        addHint={t.card_tags_add_hint}
        removeLabel={(name) => t.card_tags_remove.replace('{name}', name)}
        textColor={c.text}
        mutedColor={c.textMuted}
        borderColor={c.border}
        inputBg={inputBg}
        accentColor={c.accent}
      />

      {/* Action buttons list in Card Floor */}
      <View style={styles.bottomCardActionsGroupLine}>
        <View style={styles.actionsLineHorizontalContainer}>
          {/* Copy button */}
          <TouchableOpacity
            style={[
              styles.smallActionButtonRounded,
              { backgroundColor: isDark ? '#2D2D37' : '#E5E7EB' },
            ]}
            onPress={handleCopyCard}
            accessibilityRole="button"
            accessibilityLabel={t.a11y_copy_secret}
          >
            <Ionicons name="copy-outline" size={16} color={c.text} />
          </TouchableOpacity>

          {/* Super secure autogeneration tool */}
          {item.type === 'PASSWORD' && (
            <TouchableOpacity
              style={[
                styles.smallActionButtonRounded,
                {
                  backgroundColor: isDark ? '#2D2D37' : '#E5E7EB',
                  opacity: canGeneratePassword ? 1 : 0.45,
                },
              ]}
              onPress={() => handleAutoGenPasswordInCard(item.id)}
              accessibilityRole="button"
              accessibilityLabel={t.generate_and_replace}
              accessibilityState={{ disabled: !canGeneratePassword }}
            >
              <Ionicons
                name="key-outline"
                size={16}
                color={canGeneratePassword ? c.accent : c.textMuted}
              />
            </TouchableOpacity>
          )}

          {/* HIBP check (opt-in) */}
          {hibpEnabled && item.type === 'PASSWORD' && (
            <TouchableOpacity
              style={[
                styles.smallActionButtonRounded,
                {
                  backgroundColor: isDark ? '#2D2D37' : '#E5E7EB',
                  opacity: hibpChecking ? 0.6 : 1,
                },
              ]}
              onPress={() => onCheckHibp(item.id)}
              disabled={hibpChecking}
              accessibilityRole="button"
              accessibilityLabel={t.hibp_action_label}
              accessibilityState={{ disabled: hibpChecking }}
            >
              {hibpChecking ? (
                <ActivityIndicator size="small" color={c.accent} />
              ) : (
                <Ionicons name="shield-checkmark-outline" size={16} color={c.accent} />
              )}
            </TouchableOpacity>
          )}

          {/* Delete card */}
          <TouchableOpacity
            style={[
              styles.smallActionButtonRounded,
              { backgroundColor: isDark ? '#3B1E1E' : '#FED7D7' },
            ]}
            onPress={() => onDeleteCard(item.id)}
            accessibilityRole="button"
            accessibilityLabel={t.card_delete_btn}
          >
            <Ionicons name="trash-outline" size={16} color={c.danger} />
          </TouchableOpacity>
        </View>

        {/* Save operations */}
        <TouchableOpacity
          style={[
            styles.saveActionButtonStylePill,
            {
              backgroundColor: saveState === 'saved' ? c.accent : c.success,
              opacity: saveState === 'saving' ? 0.6 : 1,
            },
          ]}
          onPress={handleSaveWithDetection}
          disabled={saveState !== 'idle'}
          accessibilityRole="button"
          accessibilityState={{ disabled: saveState !== 'idle' }}
          accessibilityLabel={
            saveState === 'saving'
              ? t.detecting_icon
              : saveState === 'saved'
                ? t.card_saved_btn
                : t.card_save_btn
          }
        >
          <Ionicons
            name={
              saveState === 'saving'
                ? 'sync'
                : saveState === 'saved'
                  ? 'checkmark'
                  : 'checkmark-circle-outline'
            }
            size={16}
            color="#FFFFFF"
            style={{ marginRight: spacing.xs + 2 }}
          />
          <Text style={styles.saveActionTextPill}>
            {saveState === 'saving'
              ? t.detecting_icon
              : saveState === 'saved'
                ? t.card_saved_btn
                : t.card_save_btn}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Storable Timestamp Logs */}
      <View style={styles.creationLogLabelRow}>
        <Text style={[styles.metadataFooterCardDate, { color: c.textMuted }]}>
          {t.created_label}: {new Date(item.creation_date).toLocaleDateString()} |{' '}
          {t.modified_label}: {new Date(item.last_update).toLocaleDateString()}
        </Text>
      </View>
    </View>
  );
});
