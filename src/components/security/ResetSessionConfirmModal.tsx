/**
 * @fileoverview Final confirmation modal for wiping the local session (danger zone).
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCoreState } from '../../context/CoreStateContext';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { KeyboardAwareBottomSheetModal } from '../common/KeyboardAwareBottomSheetModal';

export const ResetSessionConfirmModal = () => {
  const { resetSessionConfirmVisible, setResetSessionConfirmVisible } = useCoreState();
  const { executeResetSession } = useAuth();
  const { c, t } = useSettings();
  const [busy, setBusy] = useState(false);

  const handleClose = () => {
    if (busy) return;
    setResetSessionConfirmVisible(false);
  };

  const handleConfirm = () => {
    if (busy) return;
    setBusy(true);
    void executeResetSession()
      .catch(() => {
        /* errors surfaced inside executeResetSession */
      })
      .finally(() => setBusy(false));
  };

  return (
    <KeyboardAwareBottomSheetModal
      visible={resetSessionConfirmVisible}
      onRequestClose={handleClose}
      dismissOnBackdropPress={!busy}
      sheetStyle={{
        backgroundColor: c.cardBg,
        borderColor: c.danger,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Ionicons name="warning" size={22} color={c.danger} style={{ marginRight: 8 }} />
        <Text style={{ color: c.danger, fontSize: 18, fontWeight: '700', flex: 1 }}>
          {t.confirm_reset_session_title}
        </Text>
      </View>

      <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>
        {t.confirm_reset_session_message}
      </Text>

      {busy ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 14,
            marginBottom: 8,
            gap: 10,
          }}
        >
          <ActivityIndicator size="small" color={c.danger} />
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>
            {t.reset_session_busy}
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
        <TouchableOpacity
          onPress={handleClose}
          disabled={busy}
          style={{ paddingVertical: 10, paddingHorizontal: 16, opacity: busy ? 0.4 : 1 }}
        >
          <Text style={{ color: c.textMuted, fontWeight: '700' }}>{t.cancel_button}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={busy}
          style={{
            backgroundColor: c.danger,
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 8,
            minWidth: 120,
            alignItems: 'center',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={{ color: '#FFF', fontWeight: '700' }}>{t.reset_session_btn}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAwareBottomSheetModal>
  );
};
