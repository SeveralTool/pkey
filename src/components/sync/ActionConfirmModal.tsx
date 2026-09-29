/**
 * @fileoverview Phone-side confirmation when the LAN PWA asks to step-up an action.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../../context/SyncContext';
import { useCoreState } from '../../context/CoreStateContext';
import { useSettings } from '../../context/SettingsContext';
import { KeyboardAwareBottomSheetModal } from '../common/KeyboardAwareBottomSheetModal';
import { webClientOsNotifyLabel, type PwaActionConfirmKind } from '@pkey/core';
import type { LocaleStrings } from '../../constants/localization';

export function actionConfirmVerb(t: LocaleStrings, action: PwaActionConfirmKind): string {
  switch (action) {
    case 'edit':
      return t.web_action_edit;
    case 'delete':
      return t.web_action_delete;
    case 'reveal':
      return t.web_action_reveal;
    case 'copy':
      return t.web_action_copy;
    case 'copy_otp':
      return t.web_action_copy_otp;
    case 'reveal_otp':
      return t.web_action_reveal_otp;
    case 'copy_username':
      return t.web_action_copy_username;
    default:
      return t.web_action_copy;
  }
}

export const ActionConfirmModal = () => {
  const {
    actionConfirmPrompt,
    resolveActionConfirm,
    beginActionConfirmAuth,
    connectedWebClients,
    webClientAliases,
  } = useSync();
  const { db } = useCoreState();
  const { c, t } = useSettings();
  const startedForRef = useRef<string | null>(null);

  const visible = !!actionConfirmPrompt;
  const prompt = actionConfirmPrompt;
  const card = prompt?.cardId ? db.cards.find((item) => item.id === prompt.cardId) : undefined;
  const cardTitle = card?.title?.trim() || t.web_action_confirm_card_unknown;
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
  const actionLabel = prompt ? actionConfirmVerb(t, prompt.action) : '';
  const message = t.web_action_confirm_message
    .replace('{client}', clientLabel)
    .replace('{action}', actionLabel)
    .replace('{card}', cardTitle);

  useEffect(() => {
    if (!prompt) {
      startedForRef.current = null;
      return;
    }
    const startIfForeground = () => {
      if (AppState.currentState !== 'active') return;
      if (startedForRef.current === prompt.requestId) return;
      startedForRef.current = prompt.requestId;
      beginActionConfirmAuth();
    };
    startIfForeground();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') startIfForeground();
    });
    return () => sub.remove();
  }, [prompt, beginActionConfirmAuth]);

  return (
    <KeyboardAwareBottomSheetModal
      visible={visible}
      onRequestClose={() => resolveActionConfirm(false, 'denied')}
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
          {t.web_action_confirm_title}
        </Text>
      </View>

      <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>
        {message}
      </Text>

      <TouchableOpacity
        onPress={() => beginActionConfirmAuth()}
        style={{
          backgroundColor: c.accent,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 8,
          marginBottom: 8,
        }}
      >
        <Text style={{ color: '#FFF', fontWeight: '700', textAlign: 'center' }}>
          {t.web_action_confirm_approve}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => resolveActionConfirm(false, 'denied')}
        style={{ paddingVertical: 10, paddingHorizontal: 16 }}
      >
        <Text style={{ color: c.danger, fontWeight: '700', textAlign: 'center' }}>
          {t.web_action_confirm_deny}
        </Text>
      </TouchableOpacity>
    </KeyboardAwareBottomSheetModal>
  );
};
