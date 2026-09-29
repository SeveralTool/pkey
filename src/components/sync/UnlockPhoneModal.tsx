/**
 * @fileoverview Phone-side SAS + biometrics when the LAN PWA asks to unlock.
 */
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, AppState, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../../context/SyncContext';
import { useCoreState } from '../../context/CoreStateContext';
import { useSettings } from '../../context/SettingsContext';
import { KeyboardAwareBottomSheetModal } from '../common/KeyboardAwareBottomSheetModal';
import { webClientOsNotifyLabel } from '@pkey/core';

export const UnlockPhoneModal = () => {
  const {
    unlockPrompt,
    resolveUnlock,
    beginUnlockAuth,
    unlockAuthBusy,
    connectedWebClients,
    webClientAliases,
  } = useSync();
  const { isLogged } = useCoreState();
  const { c, t } = useSettings();

  const visible = !!unlockPrompt;
  const prompt = unlockPrompt;
  const client = prompt
    ? connectedWebClients.find((item) => item.sourceId === prompt.sourceId)
    : undefined;
  const clientLabel = prompt
    ? webClientOsNotifyLabel({
        alias: webClientAliases[prompt.sourceId],
        userAgent: client?.userAgent,
        fallback: t.web_client_unknown,
      })
    : t.web_client_unknown;
  const message = t.web_unlock_message.replace('{client}', clientLabel);

  // Foreground + already unlocked: start bio for a new request (PWA retry).
  // No AppState listener — Recents should show the SAS before Approve.
  useEffect(() => {
    if (!prompt || !isLogged) return;
    if (AppState.currentState !== 'active') return;
    beginUnlockAuth();
  }, [prompt, isLogged, beginUnlockAuth]);

  return (
    <KeyboardAwareBottomSheetModal
      visible={visible}
      onRequestClose={() => resolveUnlock(false)}
      dismissOnBackdropPress
      sheetStyle={{
        backgroundColor: c.cardBg,
        borderColor: c.accent,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Ionicons
          name="finger-print-outline"
          size={22}
          color={c.accent}
          style={{ marginRight: 8 }}
        />
        <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', flex: 1 }}>
          {t.web_unlock_title}
        </Text>
      </View>

      <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 8 }}>
        {message}
      </Text>
      <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 18, marginBottom: 8 }}>
        {t.web_unlock_sas_hint}
      </Text>
      <Text
        accessible
        accessibilityRole="text"
        accessibilityLabel={prompt ? t.web_unlock_sas_a11y.replace('{code}', prompt.sas) : ''}
        style={{
          color: c.text,
          fontSize: 40,
          fontWeight: '700',
          letterSpacing: 10,
          textAlign: 'center',
          marginVertical: 12,
          fontVariant: ['tabular-nums'],
        }}
      >
        {prompt?.sas ?? ''}
      </Text>

      <TouchableOpacity
        onPress={() => beginUnlockAuth()}
        disabled={unlockAuthBusy}
        style={{
          backgroundColor: c.accent,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 8,
          marginBottom: 8,
          opacity: unlockAuthBusy ? 0.7 : 1,
        }}
        accessibilityRole="button"
        accessibilityLabel={t.web_unlock_approve}
        accessibilityState={{ disabled: unlockAuthBusy }}
      >
        {unlockAuthBusy ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <Text style={{ color: '#FFF', fontWeight: '700', textAlign: 'center' }}>
            {t.web_unlock_approve}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => resolveUnlock(false)}
        style={{ paddingVertical: 10, paddingHorizontal: 16 }}
      >
        <Text style={{ color: c.danger, fontWeight: '700', textAlign: 'center' }}>
          {t.web_unlock_deny}
        </Text>
      </TouchableOpacity>
    </KeyboardAwareBottomSheetModal>
  );
};
