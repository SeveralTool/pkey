/**
 * @fileoverview Self-contained TOTP code display with a 1-second countdown.
 *
 * Owns the per-second `setInterval` tick so the countdown only re-renders
 * this small component instead of the whole CardItem. Mounted only while the
 * card is expanded and has an OTP secret, so collapsed cards keep no timers
 * and the show/offset state resets naturally on unmount.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getRemainingSeconds, getTotpAtOffset, type OtpAlgorithm } from '@pkey/core';
import { globalStyles as styles } from '../../styles/globalStyles';

export interface OtpCountdownProps {
  otpSecret: string;
  otpAlgorithm?: OtpAlgorithm;
  otpDigits?: 6 | 8;
  otpPeriod?: number;
  isDark: boolean;
  c: Record<string, string>;
  t: Record<string, string>;
  onBiometricCheck: (onSuccess: () => void, prompt: string) => void;
  onCopyCode: (code: string) => void;
}

export const OtpCountdown = React.memo(function OtpCountdown({
  otpSecret,
  otpAlgorithm,
  otpDigits,
  otpPeriod,
  isDark,
  c,
  t,
  onBiometricCheck,
  onCopyCode,
}: OtpCountdownProps) {
  const period = otpPeriod ?? 30;

  const [showOtpCode, setShowOtpCode] = useState(false);
  const [otpWindowOffset, setOtpWindowOffset] = useState<-1 | 0 | 1>(0);
  const [otpRemaining, setOtpRemaining] = useState(() => getRemainingSeconds(period));

  useEffect(() => {
    setOtpWindowOffset(0);
  }, [otpSecret]);

  useEffect(() => {
    const tick = () => setOtpRemaining(getRemainingSeconds(period));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [otpSecret, period]);

  // Changes once per TOTP period; the per-second tick re-render above makes
  // sure this is re-evaluated so the code refreshes on period boundaries.
  const currentPeriod = Math.floor(Date.now() / 1000 / period);
  const otpCode = useMemo(() => {
    if (!otpSecret?.trim()) return '';
    const options = { algorithm: otpAlgorithm, digits: otpDigits, period: otpPeriod };
    return getTotpAtOffset(otpSecret, otpWindowOffset, 1, options) ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPeriod, otpWindowOffset, otpSecret, otpAlgorithm, otpDigits, otpPeriod]);

  const handleToggleOtpCode = () => {
    if (showOtpCode) {
      setShowOtpCode(false);
      return;
    }
    onBiometricCheck(() => setShowOtpCode(true), t.require_auth_otp_view);
  };

  const handleCopyOtp = () => {
    if (otpCode) onCopyCode(otpCode);
  };

  const otpMask = '•'.repeat(otpDigits ?? 6);

  return (
    <View style={styles.otpDisplayBlock}>
      <Text style={[styles.smallLabelUppercase, { color: c.textMuted, marginBottom: 0 }]}>
        {t.card_otp_code_label}
      </Text>
      <View style={styles.otpCodeToolbar}>
        <View style={styles.otpCodeCluster}>
          {showOtpCode ? (
            <TouchableOpacity
              style={[
                styles.otpToolbarButton,
                {
                  backgroundColor: isDark ? '#2D2D37' : '#E5E7EB',
                  opacity: otpWindowOffset <= -1 ? 0.4 : 1,
                },
              ]}
              onPress={() => setOtpWindowOffset((o) => (o > -1 ? ((o - 1) as -1 | 0 | 1) : o))}
              disabled={otpWindowOffset <= -1}
              accessibilityLabel={t.otp_window_prev}
            >
              <Ionicons name="chevron-back" size={18} color={c.text} />
            </TouchableOpacity>
          ) : null}
          <View style={styles.otpCodeColumn}>
            <View
              style={[
                styles.otpCodeField,
                {
                  borderColor: c.border,
                  backgroundColor: isDark ? '#1F1F24' : '#F3F4F6',
                },
              ]}
            >
              <Text style={[styles.otpCodeText, { color: c.text }]}>
                {showOtpCode && otpCode ? otpCode : otpMask}
              </Text>
            </View>
            {showOtpCode ? (
              <Text style={[styles.otpOffsetLabel, { color: c.textMuted }]}>
                {t.otp_window_label.replace('{n}', String(otpWindowOffset))}
              </Text>
            ) : null}
          </View>
          {showOtpCode ? (
            <TouchableOpacity
              style={[
                styles.otpToolbarButton,
                {
                  backgroundColor: isDark ? '#2D2D37' : '#E5E7EB',
                  opacity: otpWindowOffset >= 1 ? 0.4 : 1,
                },
              ]}
              onPress={() => setOtpWindowOffset((o) => (o < 1 ? ((o + 1) as -1 | 0 | 1) : o))}
              disabled={otpWindowOffset >= 1}
              accessibilityLabel={t.otp_window_next}
            >
              <Ionicons name="chevron-forward" size={18} color={c.text} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.otpActionGroup}>
          <TouchableOpacity
            style={[styles.otpToolbarButton, { backgroundColor: isDark ? '#2D2D37' : '#E5E7EB' }]}
            onPress={handleToggleOtpCode}
            accessibilityLabel={showOtpCode ? t.card_otp_hide_code : t.card_otp_show_code}
          >
            <Ionicons
              name={showOtpCode ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={c.text}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.otpToolbarButton, { backgroundColor: isDark ? '#2D2D37' : '#E5E7EB' }]}
            onPress={handleCopyOtp}
            accessibilityLabel={t.card_otp_copy_btn}
          >
            <Ionicons name="copy-outline" size={18} color={c.text} />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={[styles.otpCountdownText, { color: c.textMuted }]}>
        {t.card_otp_countdown.replace('{n}', String(otpRemaining))}
      </Text>
    </View>
  );
});
